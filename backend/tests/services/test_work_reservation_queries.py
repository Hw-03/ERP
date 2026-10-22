"""Reservation read models preserve source stock and only forecast open effects."""
from datetime import datetime
from typing import Any
import uuid

from sqlalchemy import event
import pytest

from app.models import (
    Employee, IoBatch, IoBundle, IoLine, IoDraftReservation,
    IoWorkReservationEvent, StockRequest, StockRequestLine,
    StockRequestStatusEnum as Status, StockRequestTypeEnum, RequestBucketEnum,
)


def make_work(db, item, *, status="draft", reservation_status="reserved", kind="move", quantity=3):
    owner = Employee(employee_code=str(uuid.uuid4()), name="Owner snapshot", role="staff", department="조립", is_active=True)
    db.add(owner)
    db.flush()
    batch = IoBatch(work_type="warehouse_io", sub_type="warehouse_to_dept", status=status,
                    reservation_status=reservation_status, requester_employee_id=owner.employee_id,
                    requester_name=owner.name, requester_department="조립", revision=2)
    bundle = IoBundle(bundle_id=uuid.uuid4(), source_kind="direct_item", source_item_id=item.item_id,
                      title_snapshot=item.item_name, quantity=quantity)
    line = IoLine(line_id=uuid.uuid4(), item_id=item.item_id, item_name_snapshot=item.item_name,
                  mes_code_snapshot=item.mes_code, unit=item.unit, direction=kind,
                  from_bucket="none" if kind == "in" else "warehouse", to_bucket="production" if kind != "out" else "none",
                  to_department="조립" if kind != "out" else None, quantity=quantity, origin="direct")
    bundle.lines = [line]
    batch.bundles = [bundle]
    db.add(batch)
    db.flush()
    effect = dict(effect_id=str(line.line_id), operation_line_id=str(line.line_id), bundle_id=str(bundle.bundle_id),
                  item_id=str(item.item_id), item_name=item.item_name, mes_code=item.mes_code, unit=item.unit,
                  kind=kind, quantity=quantity, **{"from": None if kind == "in" else {"bucket": "warehouse", "department": None},
                                                "to": None if kind == "out" else {"bucket": "production", "department": "조립"}})
    batch.effective_plan = {"version": 1, "fingerprint": "test", "effects": [effect]}
    if status == "draft" and reservation_status == "reserved" and kind != "in":
        db.add(IoDraftReservation(batch_id=batch.batch_id, item_id=item.item_id, source_bucket="warehouse", source_department="", quantity=quantity))
    db.flush()
    return batch, line, owner


def add_request(db, batch, line, *, status=Status.RESERVED, operation_line=True):
    request = StockRequest(requester_employee_id=batch.requester_employee_id,
                           requester_name=batch.requester_name, requester_department=batch.requester_department,
                           operation_batch_id=batch.batch_id, request_type=StockRequestTypeEnum.INTERNAL_USE,
                           status=status, approved_at=datetime.utcnow())
    request.lines = [StockRequestLine(item_id=line.item_id, item_name_snapshot=line.item_name_snapshot,
                                      quantity=line.quantity, from_bucket=RequestBucketEnum(line.from_bucket),
                                      to_bucket=RequestBucketEnum(line.to_bucket), to_department=line.to_department,
                                      operation_line_id=line.line_id if operation_line else None, status=status)]
    db.add(request)
    db.flush()
    return request


def test_draft_transfer_summary_and_target_are_read_only(db_session, make_item):
    from app.services.work_reservation_queries import bulk_inventory_work_status
    item = make_item(process_type_code="AR", warehouse_qty=10)
    batch, _, _ = make_work(db_session, item)
    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["summary"]["work_reserved_quantity"] == 3
    assert result["summary"]["expected_in_quantity"] == 0
    assert result["summary"]["transfer_in_quantity"] == 3
    assert result["summary"]["transfer_out_quantity"] == 3
    assert result["summary"]["forecast_complete"] is True
    assert result["works"][0]["targets"][0]["item_id"] == str(item.item_id)
    assert result["works"][0]["reserved_inputs"][0]["operation_line_ids"] == [str(batch.bundles[0].lines[0].line_id)]
    assert not db_session.new and not db_session.dirty


def test_reservations_group_requester_departments_across_source_locations(db_session, make_item):
    """Requester snapshots identify the reserving team; stock locations stay independent."""
    from app.services.work_reservation_queries import bulk_inventory_work_status
    from app.schemas.work_reservations import InventoryReservationSummary

    item = make_item(process_type_code="AR", warehouse_qty=30)
    first, _, owner = make_work(db_session, item, quantity=4)
    second, _, _ = make_work(db_session, item, quantity=6)
    ledger = db_session.query(IoDraftReservation).filter_by(batch_id=second.batch_id).one()
    ledger.source_bucket, ledger.source_department = "production", "튜닝"
    third, line, _ = make_work(db_session, item, status="reserved", kind="out", quantity=3)
    request = add_request(db_session, third, line)
    request.requester_department = "튜브"
    owner.department = "출하"
    db_session.flush()

    summary = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]["summary"]
    assert summary["reservation_by_requester_department"] == [
        {"requester_department": "조립", "work_reserved_quantity": 10,
         "approval_reserved_quantity": 0, "shipping_reserved_quantity": 0},
        {"requester_department": "튜브", "work_reserved_quantity": 0,
         "approval_reserved_quantity": 3, "shipping_reserved_quantity": 0},
    ]
    assert len(summary["reservation_by_location"]) == 2
    assert InventoryReservationSummary.model_validate(summary).model_dump()["reservation_by_requester_department"] == summary["reservation_by_requester_department"]
    assert first.requester_department == "조립"
    assert not db_session.new and not db_session.dirty


@pytest.mark.parametrize("source_kind,work_type,sub_type,origin,kind,included", [
    ("direct_item", "receive", "receive_supplier", "direct", "in", True),
    ("direct_item", "warehouse_io", "dept_transfer", "direct", "move", True),
    ("bom_parent", "process", "produce", "direct", "in", True),
    ("bom_parent", "process", "disassemble", "direct", "out", True),
    ("bom_parent", "process", "produce", "direct", "in", False),
    ("manual", "process", "produce", "manual", "in", True),
    ("manual", "warehouse_io", "warehouse_to_dept", "manual", "move", True),
])
def test_target_quantity_uses_current_source_line_not_preview_basis(
    db_session, make_item, source_kind, work_type, sub_type, origin, kind, included,
):
    """A saved parent edit keeps the BOM preview basis at one while the purpose becomes two."""
    from app.services.work_reservation_queries import bulk_inventory_work_status

    item = make_item(process_type_code="TF")
    batch, line, _ = make_work(db_session, item, quantity=1, kind=kind)
    batch.work_type, batch.sub_type = work_type, sub_type
    bundle = batch.bundles[0]
    bundle.source_kind = source_kind
    line.quantity, line.origin, line.included = 2, origin, included
    db_session.flush()

    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["works"][0]["targets"][0]["quantity"] == 2
    assert bundle.quantity == 1 and line.quantity == 2
    assert not db_session.new and not db_session.dirty


def test_custom_child_quantities_do_not_redefine_source_target(db_session, make_item):
    """Manual additions and edited BOM rows are effects, not the work's source quantity."""
    from app.services.work_reservation_queries import bulk_inventory_work_status

    item = make_item(process_type_code="TF")
    child = make_item(process_type_code="TR")
    batch, parent, _ = make_work(db_session, item, quantity=1, kind="in")
    batch.work_type, batch.sub_type = "process", "produce"
    bundle = batch.bundles[0]
    bundle.source_kind = "bom_parent"
    parent.quantity, parent.included = 2, False
    bundle.lines.extend([
        IoLine(item_id=child.item_id, item_name_snapshot=child.item_name, quantity=37,
               direction="out", from_bucket="production", from_department="튜브", to_bucket="none", origin="bom_auto", edited=True),
        IoLine(item_id=item.item_id, item_name_snapshot=item.item_name, quantity=9,
               direction="in", from_bucket="none", to_bucket="production", to_department="튜브", origin="manual", edited=True),
        IoLine(item_id=child.item_id, item_name_snapshot=child.item_name, quantity=50,
               direction="out", from_bucket="production", from_department="튜브", to_bucket="none", origin="direct"),
    ])
    db_session.flush()

    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["works"][0]["targets"][0]["quantity"] == 2
    assert bundle.quantity == 1 and not db_session.dirty


def test_parentless_bom_target_keeps_current_bundle_basis(db_session, make_item):
    from app.services.work_reservation_queries import bulk_inventory_work_status

    item = make_item(process_type_code="TF")
    batch, child, _ = make_work(db_session, item, quantity=3)
    batch.bundles[0].source_kind = "bom_parent"
    child.origin, child.quantity = "bom_auto", 99
    db_session.flush()

    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["works"][0]["targets"][0]["quantity"] == 3
    assert not db_session.new and not db_session.dirty


def test_missing_legacy_source_does_not_guess_target_from_effects(db_session, make_item):
    from app.services.work_reservation_queries import bulk_inventory_work_status

    item = make_item(process_type_code="AR")
    batch, _, _ = make_work(db_session, item)
    batch.bundles[0].source_item_id = None
    batch.bundles[0].source_item = None
    db_session.flush()

    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["works"][0]["targets"] == []
    assert result["summary"]["work_reserved_quantity"] == 3
    assert not db_session.new and not db_session.dirty


def test_inactive_draft_is_related_but_has_no_forecast(db_session, make_item):
    from app.services.work_reservation_queries import bulk_inventory_work_status
    item = make_item(process_type_code="AR")
    make_work(db_session, item, reservation_status="inactive")
    work = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]["works"][0]
    assert work["reserved_inputs"] == []
    assert work["expected_effects"] == []


def test_approved_reserved_remains_open_and_closed_requests_do_not_duplicate(db_session, make_item):
    from app.services.work_reservation_queries import bulk_inventory_work_status
    item = make_item(process_type_code="AR")
    batch, line, _ = make_work(db_session, item, status="partially_completed", reservation_status="inactive", kind="out")
    add_request(db_session, batch, line, status=Status.CANCELLED)
    add_request(db_session, batch, line)
    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["summary"]["approval_reserved_quantity"] == 3
    assert result["summary"]["expected_out_quantity"] == 3
    assert len(result["works"][0]["expected_effects"]) == 1


def test_duplicate_and_missing_mappings_never_guess_effects(db_session, make_item):
    from app.services.work_reservation_queries import bulk_inventory_work_status
    item = make_item(process_type_code="AR")
    batch, line, _ = make_work(db_session, item, status="submitted", reservation_status="inactive")
    add_request(db_session, batch, line)
    duplicate = add_request(db_session, batch, line)
    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["summary"]["approval_reserved_quantity"] == 6
    assert result["summary"]["forecast_complete"] is False
    assert result["works"][0]["expected_effects"] == []
    assert result["works"][0]["forecast_issue"]["code"] == "missing_effect_mapping"
    duplicate.lines[0].operation_line_id = None
    db_session.flush()
    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["summary"]["forecast_complete"] is False


def test_standalone_approval_counts_stock_but_not_invented_work(db_session, make_item):
    from app.services.work_reservation_queries import bulk_inventory_work_status
    item = make_item(process_type_code="AR")
    batch, line, _ = make_work(db_session, item, status="completed", reservation_status="inactive")
    request = add_request(db_session, batch, line)
    request.operation_batch_id = None
    db_session.flush()
    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["summary"]["approval_reserved_quantity"] == 3
    assert result["summary"]["forecast_complete"] is False
    assert result["works"] == []


def test_admin_filters_snapshot_and_event_projection(db_session, make_item):
    from app.services.work_reservation_queries import batch_detail, list_admin_work_reservations
    item = make_item(process_type_code="AR")
    batch, _, owner = make_work(db_session, item)
    make_work(db_session, item, reservation_status="not_required", kind="in")
    owner.department = "changed"
    db_session.add(IoWorkReservationEvent(batch_id=batch.batch_id, action="saved", actor_name="Auditor",
                                        from_revision=1, to_revision=2, reason="private"))
    db_session.flush()
    statements: list[str] = []
    def record_statement(_connection: Any, _cursor: Any, statement: str,
                         _parameters: Any, _context: Any, _executemany: bool) -> None:
        """Capture SQL so the list contract cannot retain a hidden classification query."""
        statements.append(statement)
    event.listen(db_session.bind, "before_cursor_execute", record_statement)
    try:
        result = list_admin_work_reservations(db_session, requester_department="조립")
    finally:
        event.remove(db_session.bind, "before_cursor_execute", record_statement)
    assert set(result) == {"items", "total", "skip", "limit"}
    assert result["total"] == 2
    assert {row["reservation_status"] for row in result["items"]} == {"reserved", "not_required"}
    assert not any("GROUP BY" in statement.upper() for statement in statements)
    assert "history" not in batch_detail(db_session, batch)
    detail = batch_detail(db_session, batch, include_history=True)
    assert detail["history"][0]["revision"] == 2
    assert detail["history"][0]["reason"] == "private"


@pytest.mark.parametrize(("search", "expected"), [
    ("생산", [0]),
    ("부서 입출고", [0, 1]),
    ("분해", [1]),
    ("없는 작업", []),
    ("PROCESS", [0, 1]),
    ("Owner snapshot", [0, 1, 2]),
    ("%", []),
    ("_", [2]),
])
def test_admin_search_matches_displayed_work_labels(db_session, make_item, search, expected):
    from app.services.work_reservation_queries import list_admin_work_reservations

    item = make_item(process_type_code="AR")
    batches = [make_work(db_session, item)[0] for _ in range(3)]
    batches[0].work_type, batches[0].sub_type = "process", "produce"
    batches[1].work_type, batches[1].sub_type = "process", "disassemble"
    db_session.flush()

    result = list_admin_work_reservations(db_session, search=search)

    assert {row["batch_id"] for row in result["items"]} == {str(batches[index].batch_id) for index in expected}
    assert result["total"] == len(expected)


def test_admin_label_search_preserves_filters_and_pagination(db_session, make_item):
    from app.services.work_reservation_queries import list_admin_work_reservations

    item = make_item(process_type_code="AR")
    batches = [make_work(db_session, item)[0] for _ in range(3)]
    for batch in batches[:2]:
        batch.work_type, batch.sub_type = "process", "produce"
    batches[0].updated_at = datetime(2026, 1, 1)
    batches[1].updated_at = datetime(2026, 1, 2)
    batches[1].reservation_status = "inactive"
    db_session.flush()

    result = list_admin_work_reservations(
        db_session, search="부서 입출고", requester_department="조립",
        skip=0, limit=1,
    )
    assert [row["batch_id"] for row in result["items"]] == [str(batches[0].batch_id)]
    assert result["total"] == 2
    assert result["skip"] == 0 and result["limit"] == 1

    result = list_admin_work_reservations(db_session, search=item.mes_code, requester_employee_id=batches[0].requester_employee_id)
    assert [row["batch_id"] for row in result["items"]] == [str(batches[0].batch_id)]
    assert result["total"] == 1
    assert list_admin_work_reservations(db_session, search="생산", requester_department="없는 부서")["total"] == 0


@pytest.mark.parametrize("identifier_format", ["full", "hex", "other"])
def test_admin_search_matches_displayed_batch_identifier(db_session, make_item, identifier_format):
    from app.services.work_reservation_queries import list_admin_work_reservations

    item = make_item(process_type_code="AR")
    batch, _, _ = make_work(db_session, item)
    assert batch.reference_no is None
    search = batch.batch_id.hex if identifier_format == "hex" else str(batch.batch_id)
    if identifier_format == "other":
        search = str(uuid.uuid4())

    result = list_admin_work_reservations(db_session, search=search)

    expected = [] if identifier_format == "other" else [str(batch.batch_id)]
    assert [row["batch_id"] for row in result["items"]] == expected
    assert result["total"] == len(expected)


def test_bulk_query_count_does_not_grow_per_item(db_session, make_item):
    from app.services.work_reservation_queries import bulk_inventory_work_status
    items = [make_item(process_type_code="AR") for _ in range(8)]
    for item in items:
        make_work(db_session, item, kind="in", reservation_status="not_required")
    db_session.expire_all()
    ids = [item.item_id for item in items]
    def count_for(selected):
        statements = []
        def record(*args):
            statements.append(args[2])
        event.listen(db_session.bind, "before_cursor_execute", record)
        try:
            result = bulk_inventory_work_status(db_session, selected)
        finally:
            event.remove(db_session.bind, "before_cursor_execute", record)
        assert all(row["summary"]["expected_in_quantity"] == 3 for row in result.values())
        return len(statements)
    one = count_for(ids[:1])
    db_session.expire_all()
    many = count_for(ids)
    assert many <= one + 1
    assert many <= 12


def test_submitted_line_forecasts_without_claiming_reserved_stock(db_session, make_item):
    from app.services.work_reservation_queries import bulk_inventory_work_status
    item = make_item(process_type_code="AR")
    batch, line, _ = make_work(db_session, item, status="submitted", reservation_status="inactive")
    add_request(db_session, batch, line, status=Status.SUBMITTED)
    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["summary"]["approval_reserved_quantity"] == 0
    assert result["works"][0]["reserved_inputs"] == []
    assert result["summary"]["transfer_in_quantity"] == 3


def test_partial_completion_only_counts_the_open_line(db_session, make_item):
    from copy import deepcopy
    from app.services.work_reservation_queries import bulk_inventory_work_status
    item = make_item(process_type_code="AR")
    batch, open_line, _ = make_work(db_session, item, status="partially_completed", reservation_status="inactive", kind="out")
    closed_line = IoLine(line_id=uuid.uuid4(), item_id=item.item_id, item_name_snapshot=item.item_name,
                         direction="out", from_bucket="warehouse", to_bucket="none", quantity=5, origin="direct")
    batch.bundles[0].lines.append(closed_line)
    db_session.flush()
    plan = deepcopy(batch.effective_plan)
    completed_effect = dict(plan["effects"][0], operation_line_id=str(closed_line.line_id), effect_id=str(closed_line.line_id), quantity=5)
    plan["effects"].append(completed_effect)
    batch.effective_plan = plan
    add_request(db_session, batch, open_line)
    add_request(db_session, batch, closed_line, status=Status.COMPLETED)
    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["summary"]["expected_out_quantity"] == 3
    assert result["summary"]["forecast_complete"] is True
    assert result["summary"]["approval_reserved_quantity"] == 3


def test_legacy_plan_is_restored_read_only_and_route_mismatch_is_incomplete(db_session, make_item):
    from app.services.work_reservation_queries import bulk_inventory_work_status
    item = make_item(process_type_code="AR")
    batch, line, _ = make_work(db_session, item, status="submitted", reservation_status="inactive")
    request = add_request(db_session, batch, line)
    batch.effective_plan = None
    db_session.flush()
    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["summary"]["transfer_in_quantity"] == 3
    assert batch.effective_plan is None and not db_session.dirty and not db_session.new
    request.lines[0].quantity = 9
    db_session.flush()
    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["summary"]["transfer_in_quantity"] == 0
    assert result["summary"]["forecast_complete"] is False
    assert result["works"][0]["forecast_issue"]["code"] == "missing_effect_mapping"


def test_admin_list_excludes_cancelled_work_but_detail_preserves_history(db_session, make_item):
    from app.services.work_reservation_queries import batch_detail, list_admin_work_reservations
    item = make_item(process_type_code="AR")
    batch, _, owner = make_work(db_session, item, status="cancelled", reservation_status="inactive")
    make_work(db_session, item, status="cancelled", reservation_status="inactive")
    db_session.add(IoWorkReservationEvent(batch_id=batch.batch_id, action="owner_deleted", actor_name=owner.name,
                                        from_revision=1, to_revision=2, reason="owner cleanup"))
    active_batch, _, inactive_owner = make_work(db_session, item)
    inactive_owner.is_active = False
    db_session.flush()
    result = list_admin_work_reservations(db_session, search=item.mes_code)
    assert result["total"] == 1
    assert set(result) == {"items", "total", "skip", "limit"}
    assert result["items"][0]["batch_id"] == str(active_batch.batch_id)
    assert result["items"][0]["requester_active"] is False
    detail = batch_detail(db_session, batch, include_history=True)
    assert detail["status"] == "cancelled"
    assert detail["history"][0]["action"] == "owner_deleted"
    assert detail["history"][0]["reason"] == "owner cleanup"


def test_target_source_differs_from_output_and_defect_move_is_not_receipt(db_session, make_item):
    from copy import deepcopy
    from app.services.work_reservation_queries import bulk_inventory_work_status
    source = make_item(process_type_code="AR")
    output = make_item(process_type_code="AR")
    batch, line, _ = make_work(db_session, source)
    plan = deepcopy(batch.effective_plan)
    effect = plan["effects"][0]
    effect["to"] = {"bucket": "defective", "department": "조립"}
    batch.effective_plan = plan
    line.item_id = output.item_id
    effect["item_id"] = str(output.item_id)
    db_session.flush()
    result = bulk_inventory_work_status(db_session, [output.item_id])[output.item_id]
    assert result["works"][0]["targets"][0]["item_id"] == str(source.item_id)
    assert result["summary"]["expected_in_quantity"] == 0
    assert result["summary"]["transfer_in_quantity"] == 3
    assert any(cell["location"]["bucket"] == "defective" for cell in result["summary"]["forecast_by_location"])


def test_legacy_bom_without_signing_key_cannot_initialize_settings_on_get(db_session, make_item, monkeypatch):
    from app.models import SystemSetting
    from app.services import io_effective_plan
    from app.services.bom_stock_policy import issue_bom_auto_token
    from app.services.work_reservation_queries import bulk_inventory_work_status
    item = make_item(process_type_code="AR")
    batch, line, _ = make_work(db_session, item, status="submitted", reservation_status="inactive")
    add_request(db_session, batch, line)
    batch.effective_plan = None
    line.origin = "bom_auto"
    db_session.flush()
    def planner_that_initializes_secret(db, stored_batch):
        issue_bom_auto_token(db, flow="io", claims={})
        return {"version": 1, "fingerprint": "test", "effects": []}
    monkeypatch.setattr(io_effective_plan, "build_effective_plan", planner_that_initializes_secret)
    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert db_session.query(SystemSetting).count() == 0
    assert result["summary"]["forecast_complete"] is False
    assert result["works"][0]["forecast_issue"]["code"] == "unsupported_legacy_plan"


@pytest.mark.parametrize("corruption", ["duplicate_effect", "missing_source"])
def test_invalid_saved_effects_never_double_count_or_crash(db_session, make_item, corruption):
    from copy import deepcopy
    from app.services.work_reservation_queries import bulk_inventory_work_status
    item = make_item(process_type_code="AR")
    batch, _, _ = make_work(db_session, item)
    plan = deepcopy(batch.effective_plan)
    if corruption == "duplicate_effect":
        plan["effects"].append(dict(plan["effects"][0]))
    else:
        plan["effects"][0]["from"] = None
    batch.effective_plan = plan
    db_session.flush()
    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["summary"]["transfer_in_quantity"] == 0
    assert result["summary"]["forecast_complete"] is False
    assert result["summary"]["work_reserved_quantity"] == 3


def test_shipping_and_department_reservations_have_separate_location_totals(db_session, make_item):
    from app.models import ShippingRequest, ShippingAllocation
    from app.services.work_reservation_queries import bulk_inventory_work_status
    item = make_item(process_type_code="AR")
    batch, line, _ = make_work(db_session, item, status="reserved", reservation_status="inactive", kind="out")
    line.from_bucket, line.from_department = "production", "조립"
    request = add_request(db_session, batch, line)
    request.lines[0].from_department = "조립"
    shipping = ShippingRequest(base_pf_item_id=item.item_id)
    db_session.add(shipping)
    db_session.flush()
    db_session.add_all([
        ShippingAllocation(request_id=shipping.request_id, item_id=item.item_id, quantity=2, department=None),
        ShippingAllocation(request_id=shipping.request_id, item_id=item.item_id, quantity=1, department="조립"),
        ShippingAllocation(request_id=shipping.request_id, item_id=item.item_id, quantity=9, department=None, status="RELEASED"),
    ])
    db_session.flush()
    summary = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]["summary"]
    assert summary["shipping_reserved_quantity"] == 3
    assert summary["approval_reserved_quantity"] == 3
    cells = {cell["location"]["bucket"]: cell for cell in summary["reservation_by_location"]}
    assert cells["warehouse"]["shipping_reserved_quantity"] == 2
    assert cells["warehouse"]["approval_reserved_quantity"] == 0
    assert cells["production"]["shipping_reserved_quantity"] == 1
    assert cells["production"]["approval_reserved_quantity"] == 3
    assert summary["reservation_by_requester_department"] == [
        {"requester_department": None, "work_reserved_quantity": 0,
         "approval_reserved_quantity": 0, "shipping_reserved_quantity": 3},
        {"requester_department": "조립", "work_reserved_quantity": 0,
         "approval_reserved_quantity": 3, "shipping_reserved_quantity": 0},
    ]


def test_admin_fixed_oldest_order_pagination_and_case_insensitive_search(db_session, make_item):
    from app.services.work_reservation_queries import list_admin_work_reservations
    item = make_item(process_type_code="AR")
    batches = [make_work(db_session, item)[0] for _ in range(3)]
    batches[0].updated_at = datetime(2026, 1, 2)
    for batch in batches[1:]:
        batch.updated_at = datetime(2026, 1, 1)
    db_session.flush()
    result = list_admin_work_reservations(db_session, search="owner SNAPSHOT", skip=1, limit=1)
    assert result["total"] == 3
    assert len(result["items"]) == 1
    assert result["items"][0]["batch_id"] == sorted(str(batch.batch_id) for batch in batches[1:])[1]


def test_legacy_bulk_query_count_does_not_grow_with_batches_or_lines(db_session, make_item):
    from app.services.work_reservation_queries import bulk_inventory_work_status
    items = [make_item(process_type_code="AR") for _ in range(8)]
    for item in items:
        batch, line, _ = make_work(db_session, item, status="submitted", reservation_status="inactive")
        add_request(db_session, batch, line)
        batch.effective_plan = None
    db_session.flush()
    ids = [item.item_id for item in items]

    def count_for(selected):
        db_session.expire_all()
        statements = []
        def record(*args):
            statements.append(args[2])
        event.listen(db_session.bind, "before_cursor_execute", record)
        try:
            result = bulk_inventory_work_status(db_session, selected)
        finally:
            event.remove(db_session.bind, "before_cursor_execute", record)
        assert all(row["summary"]["transfer_in_quantity"] == 3 for row in result.values())
        assert all(row["summary"]["forecast_complete"] for row in result.values())
        assert all(statement.lstrip().upper().startswith("SELECT") for statement in statements)
        return len(statements)

    one = count_for(ids[:1])
    many = count_for(ids)
    assert many == one
    assert many <= 12


def test_complex_legacy_bom_is_explicitly_unsupported_without_per_batch_queries(db_session, make_item):
    from app.services.work_reservation_queries import bulk_inventory_work_status
    from app.models import SystemSetting
    item = make_item(process_type_code="AR")
    batches = []
    for _ in range(8):
        batch, line, _ = make_work(db_session, item, status="submitted", reservation_status="inactive")
        add_request(db_session, batch, line)
        batch.effective_plan = None
        batch.bundles[0].source_kind = "bom_parent"
        batches.append(batch)
    db_session.flush()
    statements = []
    def record(*args):
        statements.append(args[2])
    event.listen(db_session.bind, "before_cursor_execute", record)
    try:
        result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    finally:
        event.remove(db_session.bind, "before_cursor_execute", record)
    assert result["summary"]["forecast_complete"] is False
    assert result["summary"]["approval_reserved_quantity"] == 24
    assert all(work["forecast_issue"]["code"] == "unsupported_legacy_plan" for work in result["works"])
    assert len(statements) <= 12
    assert db_session.query(SystemSetting).count() == 0


@pytest.mark.parametrize("work_type,sub_type,process,route", [
    ("warehouse_io", "warehouse_to_dept", "AR", ("move", "warehouse", None, "production", "조립")),
    ("warehouse_io", "dept_to_warehouse", "AR", ("move", "production", "조립", "warehouse", None)),
    ("warehouse_io", "dept_transfer", "AR", ("move", "production", "조립", "production", "튜브")),
    ("receive", "receive_supplier", "AR", ("in", "none", None, "warehouse", None)),
    ("receive", "outbound_supplier", "AR", ("out", "warehouse", None, "none", None)),
    ("tube_material", "tube_receive_supplier", "TR", ("in", "none", None, "production", "튜브")),
    ("tube_material", "tube_outbound_supplier", "TR", ("out", "production", "튜브", "none", None)),
])
def test_supported_legacy_routes_match_current_planner(db_session, make_item, work_type, sub_type, process, route):
    from app.services.io_effective_plan import build_effective_plan
    from app.services.work_reservation_queries import bulk_inventory_work_status
    item = make_item(process_type_code=process)
    batch, line, _ = make_work(db_session, item, status="submitted", reservation_status="inactive")
    batch.work_type, batch.sub_type = work_type, sub_type
    for field, value in zip(("direction", "from_bucket", "from_department", "to_bucket", "to_department"), route):
        setattr(line, field, value)
    request = add_request(db_session, batch, line)
    request.lines[0].from_department = line.from_department
    expected = build_effective_plan(db_session, batch)["effects"]
    batch.effective_plan = None
    db_session.flush()
    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["works"][0]["expected_effects"] == expected
    assert result["summary"]["forecast_complete"] is True
    assert batch.effective_plan is None and not db_session.dirty and not db_session.new


def test_legacy_zero_quantity_does_not_claim_a_complete_forecast(db_session, make_item):
    from app.services.work_reservation_queries import bulk_inventory_work_status
    item = make_item(process_type_code="AR")
    batch, line, _ = make_work(db_session, item, status="submitted", reservation_status="inactive")
    batch.effective_plan = None
    line.quantity = 0
    db_session.flush()
    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["summary"]["forecast_complete"] is False
    assert result["works"][0]["forecast_issue"]["code"] == "unsupported_legacy_plan"


@pytest.mark.parametrize("old_status", [Status.CANCELLED, Status.REJECTED])
@pytest.mark.parametrize("submission_time", [datetime(2026, 10, 20, 9), None])
def test_old_closed_request_cannot_hide_current_submission_mapping_gap(db_session, make_item, old_status, submission_time):
    from copy import deepcopy
    from app.services.work_reservation_queries import bulk_inventory_work_status
    item = make_item(process_type_code="AR")
    batch, missing_line, _ = make_work(db_session, item, status="submitted", reservation_status="inactive", kind="out")
    batch.submitted_at = submission_time
    old = add_request(db_session, batch, missing_line, status=old_status)
    old.created_at = datetime(2026, 10, 20, 8)
    remaining_line = IoLine(line_id=uuid.uuid4(), item_id=item.item_id, item_name_snapshot=item.item_name,
                            direction="out", from_bucket="warehouse", to_bucket="none", quantity=2, origin="direct")
    batch.bundles[0].lines.append(remaining_line)
    db_session.flush()
    plan = deepcopy(batch.effective_plan)
    plan["effects"].append(dict(plan["effects"][0], operation_line_id=str(remaining_line.line_id), effect_id=str(remaining_line.line_id), quantity=2))
    batch.effective_plan = plan
    current = add_request(db_session, batch, remaining_line)
    current.created_at = datetime(2026, 10, 20, 9, 1)
    db_session.flush()
    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["summary"]["expected_out_quantity"] == 2
    assert result["summary"]["forecast_complete"] is False
    assert result["works"][0]["forecast_issue"]["code"] == "missing_effect_mapping"


@pytest.mark.parametrize("closed_status", [Status.COMPLETED, Status.CANCELLED, Status.REJECTED, Status.FAILED_APPROVAL])
def test_current_submission_terminal_line_is_not_a_missing_mapping(db_session, make_item, closed_status):
    from app.services.work_reservation_queries import bulk_inventory_work_status
    item = make_item(process_type_code="AR")
    batch, line, _ = make_work(db_session, item, status="partially_completed", reservation_status="inactive", kind="out")
    batch.submitted_at = datetime(2026, 10, 20, 9)
    request = add_request(db_session, batch, line, status=closed_status)
    request.created_at = datetime(2026, 10, 20, 9, 1)
    db_session.flush()
    result = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert result["summary"]["expected_out_quantity"] == 0
    assert result["summary"]["forecast_complete"] is True
    assert result["works"][0]["forecast_issue"] is None
