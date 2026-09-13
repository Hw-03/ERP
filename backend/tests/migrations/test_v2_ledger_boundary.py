"""Legacy ledger rollout must not rewrite stock or transaction evidence."""

from datetime import UTC, datetime
import importlib.util
from pathlib import Path
import uuid

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
from sqlalchemy import text

from app.models import (
    DepartmentEnum, Employee, EmployeeLevelEnum, InventoryOperation,
    InventoryOperationKindEnum, InventoryOperationStatusEnum, RequestBucketEnum,
    StockRequest, StockRequestLine, StockRequestStatusEnum, StockRequestTypeEnum,
    SystemSetting,
)

V2_KEY = "inventory_operation_v2_cutover_at"


def _migration():
    path = Path(__file__).resolve().parents[2] / "alembic/versions/20260911_0036_legacy_ledger_boundary.py"
    assert path.exists(), "The compatibility migration must exist"
    spec = importlib.util.spec_from_file_location("legacy_ledger_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _upgrade(db_session, monkeypatch) -> None:
    module = _migration()
    monkeypatch.setattr(module, "op", Operations(MigrationContext.configure(db_session.connection())))
    monkeypatch.setattr(module.context, "is_offline_mode", lambda: False)
    module.upgrade()
    db_session.expire_all()


@pytest.mark.parametrize("change", ["quantity", "settings", "status", "new_line"])
def test_migration_rejects_unapproved_business_deltas(change) -> None:
    module = _migration()
    before = {"settings": {"existing": "preserve"}, "lines": [{"line_id": 1, "quantity": 4, "status": "COMPLETED"}]}
    after = {"settings": dict(before["settings"]), "lines": [dict(before["lines"][0])]}
    if change == "settings":
        after["settings"]["existing"] = "changed"
    elif change == "new_line":
        after["lines"].append({"line_id": 2, "quantity": 1, "status": "SUBMITTED"})
    else:
        after["lines"][0][change] = 3 if change == "quantity" else "FAILED_APPROVAL"
    with pytest.raises(RuntimeError, match="unapproved"):
        module._assert_allowed_delta(before, after, set(), None)


@pytest.mark.parametrize("has_v2", [False, True])
def test_migration_separates_legacy_activation_and_preserves_evidence(db_session, monkeypatch, has_v2) -> None:
    legacy_at = "2026-08-26T00:00:00+00:00"
    db_session.add(SystemSetting(setting_key="inventory_operation_cutover_at", setting_value=legacy_at))
    operation = InventoryOperation(
        kind=InventoryOperationKindEnum.BUSINESS, domain="test", action="legacy",
        status=InventoryOperationStatusEnum.COMMITTED, display_label="legacy", actor_name="test",
        contract_version=2 if has_v2 else 1, effective_at=datetime(2026, 9, 2),
    )
    db_session.add(operation)
    db_session.flush()
    before = list(db_session.execute(text("SELECT * FROM inventory_operations")))
    started = datetime.now(UTC)
    _upgrade(db_session, monkeypatch)
    stored = db_session.get(SystemSetting, V2_KEY).setting_value
    cutoff = datetime.fromisoformat(stored)
    if has_v2:
        assert cutoff == datetime(2026, 9, 2, tzinfo=UTC)
    else:
        assert started <= cutoff <= datetime.now(UTC)
    assert db_session.get(SystemSetting, "inventory_operation_cutover_at").setting_value == legacy_at
    assert list(db_session.execute(text("SELECT * FROM inventory_operations"))) == before
    _upgrade(db_session, monkeypatch)
    assert db_session.get(SystemSetting, V2_KEY).setting_value == stored


def test_migration_does_not_activate_an_inactive_ledger(db_session, monkeypatch) -> None:
    _upgrade(db_session, monkeypatch)
    assert db_session.get(SystemSetting, V2_KEY) is None


def test_migration_only_finishes_unexecuted_lines_of_failed_requests(db_session, make_item, monkeypatch) -> None:
    item = make_item(name="legacy-failed", warehouse_qty=8)
    actor = Employee(employee_code=uuid.uuid4().hex, name="test", role="test", department=DepartmentEnum.ASSEMBLY.value,
                     level=EmployeeLevelEnum.STAFF, is_active=True)
    db_session.add(actor)
    db_session.flush()
    request = StockRequest(
        requester_employee_id=actor.employee_id, requester_name=actor.name,
        requester_department=actor.department, request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        status=StockRequestStatusEnum.FAILED_APPROVAL,
    )
    db_session.add(request)
    db_session.flush()
    lines = []
    for status in (StockRequestStatusEnum.RESERVED, StockRequestStatusEnum.SUBMITTED,
                   StockRequestStatusEnum.COMPLETED):
        line = StockRequestLine(request_id=request.request_id, item_id=item.item_id,
                                item_name_snapshot=item.item_name, quantity=1,
                                from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.PRODUCTION,
                                to_department=actor.department, status=status)
        db_session.add(line)
        lines.append(line)
    db_session.flush()
    before = list(db_session.execute(text("SELECT * FROM inventory")))
    before_requests = list(db_session.execute(text("SELECT * FROM stock_requests")))
    _upgrade(db_session, monkeypatch)
    assert [line.status for line in lines] == [StockRequestStatusEnum.FAILED_APPROVAL,
                                              StockRequestStatusEnum.FAILED_APPROVAL,
                                              StockRequestStatusEnum.COMPLETED]
    assert list(db_session.execute(text("SELECT * FROM inventory"))) == before
    assert list(db_session.execute(text("SELECT * FROM stock_requests"))) == before_requests
