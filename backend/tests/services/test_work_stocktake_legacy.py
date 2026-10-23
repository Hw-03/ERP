"""Legacy drafts must include every physical input/output in census readiness."""
import json
from types import SimpleNamespace
import uuid

import pytest

from app import models
from app.services import sr_draft
from app.services.sr_validation import LineInput
from app.services.work_reservation_errors import WorkReservationError


def _scopes(db):
    db.add_all([
        models.InventoryScope(scope_key="warehouse", physical_department="창고"),
        models.InventoryScope(scope_key="tube", physical_department="튜브"),
        models.InventoryScope(scope_key="assembly", physical_department="조립"),
    ])
    db.flush()


def _line(item, source="warehouse", destination="production", department="튜브"):
    return SimpleNamespace(item_id=item.item_id, from_bucket=source,
        from_department=None if source == "warehouse" else department,
        to_bucket=destination, to_department=department, pool_id=None,
        defect_quarantine_record_id=None)


def test_movement_requires_both_physical_cells(db_session, make_item):
    from app.services.work_stocktake_legacy import required_cells
    _scopes(db_session)
    item = make_item()
    request = SimpleNamespace(request_type=models.StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        lines=[_line(item)], notes=None)
    assert required_cells(db_session, request) == [
        {"item_id": str(item.item_id), "scope_key": "tube"},
        {"item_id": str(item.item_id), "scope_key": "warehouse"},
    ]


def test_rework_includes_nested_children_at_their_own_departments(db_session, make_item):
    from app.services.work_stocktake_legacy import required_cells
    _scopes(db_session)
    parent = make_item()
    child = make_item(process_type_code="AR")
    grandchild = make_item()
    request = SimpleNamespace(request_type=models.StockRequestTypeEnum.REWORK_NORMAL,
        lines=[_line(parent, destination="none")], notes=json.dumps({"child_decisions": [
            {"item_id": str(child.item_id), "qty": 2, "children": [
                {"item_id": str(grandchild.item_id), "qty": 3, "action": "keep"}]}]}))
    cells = {(row["item_id"], row["scope_key"]) for row in required_cells(db_session, request)}
    assert (str(parent.item_id), "warehouse") in cells
    assert (str(child.item_id), "assembly") in cells
    assert (str(grandchild.item_id), "tube") in cells


def test_invalid_rework_remains_blocked_instead_of_ignoring_children(db_session, make_item):
    from app.services.work_stocktake_legacy import required_cells
    _scopes(db_session)
    item = make_item()
    request = SimpleNamespace(request_type=models.StockRequestTypeEnum.REWORK_NORMAL,
        lines=[_line(item, destination="none")], notes="broken")
    assert {"item_id": str(item.item_id), "scope_key": "unresolved_rework"} in required_cells(db_session, request)


def test_unmapped_location_is_not_treated_as_no_stock_effect(db_session, make_item):
    from app.services.work_stocktake_legacy import required_cells
    _scopes(db_session)
    item = make_item()
    request = SimpleNamespace(request_type=models.StockRequestTypeEnum.DEPT_INTERNAL,
        lines=[_line(item, source="production", department="미등록")], notes=None)
    assert {"item_id": str(item.item_id), "scope_key": "unmapped:미등록"} in required_cells(db_session, request)


def _paused_request(db, make_item):
    item = make_item(warehouse_qty=10)
    owner = models.Employee(employee_code="LEGACY-PAUSE", name="Legacy worker", role="직원",
        department=models.DepartmentEnum.TUBE, is_active=True)
    db.add(owner)
    db.flush()
    args = dict(requester=owner, request_type=models.StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        reference_no="preserved", notes="physical work in progress", lines_input=[LineInput(
            item_id=item.item_id, quantity=3, from_bucket=models.RequestBucketEnum.WAREHOUSE,
            from_department=None, to_bucket=models.RequestBucketEnum.PRODUCTION, to_department="튜브")])
    request = sr_draft.upsert_draft_request(db, **args)
    round_ = models.StocktakeRound(title="Census", epoch=1, started_by=owner.employee_id)
    db.add(round_)
    db.flush()
    pause = models.StocktakeWorkPause(kind="stock_request", work_id=request.request_id,
        round_id=round_.round_id, token=uuid.uuid4(), required_cells=[
            {"item_id": str(item.item_id), "scope_key": "warehouse"}])
    db.add(pause)
    db.commit()
    return request, args, pause


def test_paused_legacy_cannot_save_without_quantity_confirmation(db_session, make_item):
    request, args, _ = _paused_request(db_session, make_item)
    with pytest.raises(WorkReservationError):
        sr_draft.upsert_draft_request(db_session, **{**args, "notes": "stale editor overwrite"})
    db_session.rollback()
    assert request.notes == "physical work in progress"
    assert request.lines[0].quantity == 3


def test_paused_legacy_cannot_submit(db_session, make_item):
    request, args, _ = _paused_request(db_session, make_item)
    with pytest.raises(WorkReservationError):
        sr_draft.submit_draft_request(db_session, request_id=request.request_id,
            requester_employee_id=args["requester"].employee_id)
    db_session.rollback()
    assert request.status == models.StockRequestStatusEnum.DRAFT


def test_deleting_paused_legacy_removes_only_its_pause(db_session, make_item):
    request, args, pause = _paused_request(db_session, make_item)
    request_id = request.request_id
    sr_draft.delete_draft_request(db_session, request_id=request_id,
        requester_employee_id=args["requester"].employee_id)
    assert db_session.get(models.StocktakeWorkPause, ("stock_request", request_id)) is None


def test_direct_legacy_request_cannot_bypass_uncounted_cells(db_session, make_item):
    from app.services import stock_request_actions
    from tests.services.test_stocktake_counts import setup_round
    _, owner, item, _, _ = setup_round(db_session, make_item)
    with pytest.raises(WorkReservationError):
        stock_request_actions.create_request(db_session, requester=owner,
            request_type=models.StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
            reference_no=None, notes=None, lines_input=[LineInput(item_id=item.item_id,
                quantity=1, from_bucket=models.RequestBucketEnum.WAREHOUSE, from_department=None,
                to_bucket=models.RequestBucketEnum.PRODUCTION, to_department="튜브")])
    assert db_session.query(models.StockRequest).count() == 0


def test_resume_refreshes_only_previously_signed_bom_quantities(db_session, make_item, make_bom):
    from app.services.bom_stock_policy import bom_template_claims, has_valid_bom_auto_token, issue_bom_auto_token
    from app.services.work_stocktake_legacy import refresh_resume_notes
    parent, child = make_item(), make_item()
    make_bom(parent.item_id, child.item_id, qty=2)
    claims = bom_template_claims(parent_item_id=parent.item_id, item_id=child.item_id, quantity=6)
    token = issue_bom_auto_token(db_session, flow="bom_template", claims=claims)
    old = {"item_id": str(child.item_id), "qty": 6, "normal_qty": 4, "defective_qty": 2, "scrap_qty": 0, "bom_auto_token": token}
    new = {**old, "qty": 2, "normal_qty": 1, "defective_qty": 1}
    request = SimpleNamespace(request_type=models.StockRequestTypeEnum.REWORK_NORMAL,
        lines=[SimpleNamespace(item_id=parent.item_id)], notes=json.dumps({"child_decisions": [old]}))
    notes = refresh_resume_notes(db_session, request, [SimpleNamespace(item_id=parent.item_id, quantity=1)],
        json.dumps({"child_decisions": [new], "memo": "keep this"}))
    parsed = json.loads(notes)
    assert parsed["memo"] == "keep this"
    assert parsed["child_decisions"][0]["normal_qty"] == 1
    assert has_valid_bom_auto_token(db_session, flow="bom_template",
        claims=bom_template_claims(parent_item_id=parent.item_id, item_id=child.item_id, quantity=2),
        token=parsed["child_decisions"][0]["bom_auto_token"])
    old["bom_auto_token"] = "forged"
    request.notes = json.dumps({"child_decisions": [old]})
    parsed = json.loads(refresh_resume_notes(db_session, request,
        [SimpleNamespace(item_id=parent.item_id, quantity=1)], json.dumps({"child_decisions": [{**new, "bom_auto_token": "forged"}]})))
    assert parsed["child_decisions"][0]["bom_auto_token"] == "forged"


def test_legacy_resumes_remaining_quantity_before_unrelated_targets_finish(db_session, make_item):
    from app.services.work_stocktake_pause import pause_payload
    from tests.services.test_stocktake_counts import setup_round
    from tests.services.test_work_stocktake_pause import mark_applied
    make_item(name="Other worker's item", warehouse_qty=20)
    db_session.add(models.Department(name="튜브", is_active=True))
    _, owner, item, round_, _ = setup_round(db_session, make_item)
    args = dict(requester=owner, request_type=models.StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        reference_no="keep", notes="keep notes", lines_input=[LineInput(item_id=item.item_id,
            quantity=3, from_bucket=models.RequestBucketEnum.WAREHOUSE, from_department=None,
            to_bucket=models.RequestBucketEnum.PRODUCTION, to_department="튜브")])
    request = sr_draft.upsert_draft_request(db_session, **args)
    db_session.commit()
    pause = pause_payload(db_session, "stock_request", request.request_id)
    assert pause["state"] == "blocked"
    mark_applied(db_session, round_["round_id"], item.item_id, scopes=("warehouse", "tube"))
    args["lines_input"][0].quantity = 2
    resumed = sr_draft.upsert_draft_request(db_session, **args, stocktake_resume_token=uuid.UUID(pause["token"]))
    db_session.commit()
    assert resumed.request_id == request.request_id
    assert resumed.lines[0].quantity == 2
    assert resumed.reference_no == "keep"
    assert pause_payload(db_session, "stock_request", request.request_id) is None
    submitted = sr_draft.submit_draft_request(db_session, request_id=request.request_id,
        requester_employee_id=owner.employee_id)
    db_session.commit()
    assert submitted.status != models.StockRequestStatusEnum.DRAFT
    assert db_session.get(models.StocktakeRound, uuid.UUID(round_["round_id"])).status == "ACTIVE"
