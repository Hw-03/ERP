"""The close report reads the frozen denominator and latest attempts without writes."""
import uuid

from sqlalchemy import event

from app import models
from tests.services.test_stocktake_counts import setup_round


def test_snapshot_classifies_latest_attempts_and_excludes_pending_from_denominator(db_session, make_item):
    from app.services import stocktake_reports

    names = ["Selected", "Excluded", "Applied", "Draft", "Abandoned"]
    for name in names:
        make_item(name=name, warehouse_qty=10, pending=4 if name == "Selected" else 0)
    db_session.commit()
    service, actor, _, round_, _ = setup_round(db_session, make_item)
    targets = {row.item_name: row for row in db_session.query(models.StocktakeTarget)
               .join(models.StocktakeTargetSet).filter(models.StocktakeTargetSet.round_id == uuid.UUID(round_["round_id"])).all()}
    selected_revision = uuid.uuid4()
    for name, status in [("Selected", "CONFIRMED"), ("Excluded", "CONFIRMED"),
                         ("Applied", "APPLIED"), ("Draft", "DRAFT"), ("Abandoned", "ABANDONED")]:
        target = targets[name]
        count = models.StocktakeCount(count_id=uuid.uuid4(), round_id=uuid.UUID(round_["round_id"]),
            target_id=target.target_id, owner_id=actor.employee_id, owner_name=actor.name,
            status=status, version=2, fence=1, quantity_revision=0,
            quantities={"normal": 2 if name == "Selected" else 10, "defect": 0, "b_grade": 0, "obsolete": 0},
            baseline={"quantities": {}, "reservations": {}},
            confirmation_revision_id=selected_revision if name == "Selected" else
                (uuid.uuid4() if status in {"CONFIRMED", "APPLIED"} else None))
        db_session.add(count)
        target.latest_count_id = count.count_id
    pending_item = make_item(name="Not admitted", warehouse_qty=0)
    if db_session.get(models.StocktakePendingTarget, (uuid.UUID(round_["round_id"]), pending_item.item_id, "warehouse")) is None:
        db_session.add(models.StocktakePendingTarget(round_id=uuid.UUID(round_["round_id"]),
            item_id=pending_item.item_id, scope_key="warehouse",
            snapshot={"item_id": str(pending_item.item_id), "scope_key": "warehouse",
                      "item_code": pending_item.mes_code, "item_name": pending_item.item_name,
                      "unit": pending_item.unit, "scope_name": "창고"}))
    db_session.commit()

    statements = []
    connection = db_session.connection()
    def observe(_connection, _cursor, statement, _parameters, _context, _executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)
    event.listen(connection, "before_cursor_execute", observe)
    try:
        report = stocktake_reports.snapshot(db_session, uuid.UUID(round_["round_id"]), {str(selected_revision)})
    finally:
        event.remove(connection, "before_cursor_execute", observe)

    entries = {entry["item_name"]: entry for entry in report["entries"]}
    assert {name: entries[name]["classification"] for name in names} == {
        "Selected": "SELECTED_APPLY", "Excluded": "CONFIRMED_EXCLUDED", "Applied": "ALREADY_APPLIED",
        "Draft": "DRAFT", "Abandoned": "ABANDONED"}
    assert entries["Counted item"]["classification"] == "UNCOUNTED"
    assert entries["Not admitted"]["classification"] == "PENDING_UNADMITTED"
    assert entries["Selected"]["confirmation_revision_id"] == str(selected_revision)
    assert entries["Selected"]["held_reasons"] == ["RESERVATION_SHORTAGE"]
    assert report["summary"] == {"total": 6, "confirmed": 3, "applied": 1, "selected": 1,
                                 "unconfirmed": 3, "confirmed_excluded": 1, "held": 1, "pending": 1}
    assert report["by_scope"] == [{"scope_id": "warehouse", "scope_name": "창고", **{k: v for k, v in report["summary"].items() if k != "pending"}, "pending": 1}]
    assert len(report["by_employee"]) == 1
    assert report["by_employee"][0]["owner_id"] == str(actor.employee_id)
    assert report["by_employee"][0]["total"] == 5
    assert len(statements) <= 12
    assert not db_session.new and not db_session.dirty and not db_session.deleted
