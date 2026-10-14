"""Typed stocktake application evidence must match confirmation and actual effects."""

import uuid

import pytest

from app import models
from app.services.inventory_integrity import _collect_integrity_snapshot, diagnose_inventory_integrity
from app.services.stocktake_evidence import application_evidence
from tests.services.test_stocktake_application import apply, confirm, preview
from tests.services.test_stocktake_counts import setup_round
from tests.services.test_stocktake_bulk_application import bulk_apply, bulk_preview
from tests.services.test_stocktake_owned_waiting import location_env


def _applied(db, make_item, *, normal=10):
    env = setup_round(db, make_item)
    count = confirm(db, env, normal=normal)
    result = apply(db, env, preview(db, env, count))
    application = db.get(models.StocktakeApplication, uuid.UUID(result["application_id"]))
    line = db.query(models.StocktakeApplicationLine).filter_by(application_id=application.application_id).one()
    return env, application, line


def _evidence(db, application):
    return next(row for row in application_evidence(db)
                if row.evidence_id == str(application.application_id))


def test_zero_difference_application_is_valid_snapshot_evidence_without_transaction(db_session, make_item):
    env, application, line = _applied(db_session, make_item)
    assert line.before_quantities == line.after_quantities
    assert db_session.query(models.TransactionLog).filter_by(operation_id=application.operation_id).count() == 0

    evidence = _evidence(db_session, application)
    snapshot = _collect_integrity_snapshot(db_session)
    included = next(row for row in snapshot.operation_evidence
                    if row.evidence_id == str(application.application_id))
    report = diagnose_inventory_integrity(db_session)

    assert evidence.kind == "stocktake_application" and evidence.valid
    assert included == evidence
    assert not any(sample.get("evidence_id") == str(application.application_id)
                   for check in report.checks for sample in check.samples)


@pytest.mark.parametrize(("field", "replacement"), [
    ("before_quantities", {"normal": True, "defect": 0, "b_grade": 0, "obsolete": 0}),
    ("after_quantities", {"normal": "10", "defect": 0, "b_grade": 0, "obsolete": 0}),
    ("reservations", {"normal": 0.5, "defect": 0, "b_grade": 0, "obsolete": 0}),
    ("before_quantities", {"normal": 9, "defect": 0, "b_grade": 0, "obsolete": 0}),
    ("after_quantities", {"normal": 11, "defect": 0, "b_grade": 0, "obsolete": 0}),
])
def test_wrong_type_bool_or_count_mismatch_invalidates_application_evidence(
    db_session, make_item, field, replacement,
):
    _, application, line = _applied(db_session, make_item)
    setattr(line, field, replacement)
    db_session.flush()

    assert not _evidence(db_session, application).valid
    snapshot = _collect_integrity_snapshot(db_session)
    assert not next(row for row in snapshot.operation_evidence
                    if row.evidence_id == str(application.application_id)).valid


def test_nonzero_application_rejects_mismatched_physical_effect(db_session, make_item):
    _, application, line = _applied(db_session, make_item, normal=12)
    assert _evidence(db_session, application).valid
    log = db_session.query(models.TransactionLog).filter_by(operation_id=application.operation_id).one()
    effect = [dict(cell) for cell in log.inventory_effect]
    effect[0]["delta"] = 3
    log.inventory_effect = effect
    db_session.flush()

    assert not _evidence(db_session, application).valid


@pytest.mark.parametrize("normal", [10, 12])
def test_bulk_application_keeps_valid_evidence_after_reload(db_session, make_item, normal):
    from tests.services.test_stocktake_close_contract import _close, _close_preview

    env = setup_round(db_session, make_item, new_policy=True)
    counts = [confirm(db_session, env, normal=normal),
              confirm(db_session, location_env(db_session, env, "tube"), normal=0)]
    result = bulk_apply(db_session, env, bulk_preview(db_session, env, counts))
    closed = _close(db_session, env, _close_preview(db_session, env))
    assert closed["status"] == "CLOSED_PARTIAL"
    db_session.expire_all()
    for response in result["applications"]:
        application = db_session.get(models.StocktakeApplication, uuid.UUID(response["application_id"]))
        assert _evidence(db_session, application).valid
    assert diagnose_inventory_integrity(db_session).is_consistent


def test_selected_close_by_another_approver_keeps_valid_application_evidence(db_session, make_item):
    from tests.services.test_stocktake_close_contract import _close, _close_preview

    env = setup_round(db_session, make_item)
    second = models.Employee(employee_code="EVIDENCE-DEPUTY", name="Other approver",
                             role="staff", department_role="deputy")
    db_session.add(second)
    db_session.commit()
    count = confirm(db_session, env, normal=12)
    proposal = _close_preview(db_session, env, selected=[count["confirmation_revision_id"]])
    result = _close(db_session, env, proposal, actor=second)
    assert result["status"] == "CLOSED_PARTIAL"
    db_session.expire_all()
    application = db_session.get(models.StocktakeApplication, uuid.UUID(result["applications"][0]["application_id"]))
    child = db_session.get(models.StocktakePreview, application.preview_id)
    assert child.actor_id == env[1].employee_id
    assert application.actor_id == second.employee_id != child.actor_id
    assert _evidence(db_session, application).valid
    assert diagnose_inventory_integrity(db_session).is_consistent


@pytest.mark.parametrize("change", [
    "kind", "actor", "round", "scope", "hash", "selection", "master_hash",
    "master_child", "receipt_request", "receipt_response", "operation_receipt",
])
def test_bulk_application_rejects_unbound_or_tampered_evidence(db_session, make_item, change):
    from copy import deepcopy
    from app.services.stocktake_common import fingerprint

    env = setup_round(db_session, make_item, new_policy=True)
    proposal = bulk_preview(db_session, env, [confirm(db_session, env)])
    result = bulk_apply(db_session, env, proposal)
    application = db_session.get(models.StocktakeApplication, uuid.UUID(result["applications"][0]["application_id"]))
    child = db_session.get(models.StocktakePreview, application.preview_id)
    master = db_session.get(models.StocktakePreview, uuid.UUID(proposal["preview_id"]))
    receipt = db_session.get(models.StocktakeReceipt, uuid.UUID(result["receipt_id"]))
    assert _evidence(db_session, application).valid
    with db_session.no_autoflush:
        if change == "kind":
            child.kind = "application_bulk"
        elif change == "actor":
            child.actor_id = uuid.uuid4()
        elif change == "round":
            child.round_id = uuid.uuid4()
        elif change == "scope":
            child.payload = {**child.payload, "scope_id": "department:5"}
            child.preview_hash = fingerprint(child.payload)
        elif change == "hash":
            child.preview_hash = "0" * 64
        elif change == "selection":
            child.payload = {**child.payload, "entries": []}
            child.preview_hash = fingerprint(child.payload)
        elif change == "master_hash":
            master.preview_hash = "0" * 64
        elif change == "master_child":
            value = deepcopy(master.payload)
            value["scope_previews"][0]["preview_id"] = str(uuid.uuid4())
            master.payload = value
            master.preview_hash = fingerprint(value)
        elif change == "receipt_request":
            receipt.request_hash = "0" * 64
        elif change == "receipt_response":
            receipt.response = {**receipt.response, "applications": []}
        else:
            db_session.get(models.InventoryOperation, application.operation_id).idempotency_key = "stocktake:" + str(uuid.uuid4())
        assert not _evidence(db_session, application).valid
