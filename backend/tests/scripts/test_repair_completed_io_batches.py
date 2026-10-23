"""완료 상태 정정은 검증된 개발 작업의 상태 외에는 어떤 원장도 변경하지 않는다."""
from __future__ import annotations

import importlib.util
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models import Employee, Inventory, IoBatch, IoBundle, IoLine, Item, ProcessType, StockRequest, StockRequestLine


@pytest.fixture
def repair_case(tmp_path):
    path = tmp_path / "mes.db"
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        owner = Employee(employee_code="REPAIR", name="repair owner", role="staff", department="창고", is_active=True)
        item = Item(item_name="repair item", unit="EA", model_symbol="1", process_type_code="TR", serial_no=1)
        db.add_all([ProcessType(code="TR", prefix="T", suffix="R", stage_order=10), owner, item])
        db.flush()
        db.add(Inventory(item_id=item.item_id, warehouse_qty=5))
        submitted = datetime(2026, 9, 7, 6)
        batch = IoBatch(work_type="internal_use", sub_type="internal_use_out", status="partially_completed",
                        requester_employee_id=owner.employee_id, requester_name=owner.name, requester_department="창고",
                        submitted_at=submitted, completed_at=submitted + timedelta(minutes=1), reservation_status="inactive")
        bundle = IoBundle(source_kind="direct_item", source_item_id=item.item_id, title_snapshot=item.item_name, quantity=1)
        line = IoLine(item_id=item.item_id, item_name_snapshot=item.item_name, unit="EA", direction="out",
                      from_bucket="warehouse", to_bucket="none", quantity=1, included=True, origin="direct")
        bundle.lines = [line]
        batch.bundles = [bundle]
        db.add(batch)
        db.flush()
        for status in ("cancelled", "completed"):
            request = StockRequest(requester_employee_id=owner.employee_id, requester_name=owner.name, requester_department="창고",
                                   request_type="internal_use", operation_batch_id=batch.batch_id, status=status,
                                   created_at=submitted + timedelta(seconds=-2 if status == "cancelled" else 1),
                                   cancelled_at=submitted - timedelta(seconds=1) if status == "cancelled" else None,
                                   completed_at=batch.completed_at if status == "completed" else None)
            request.lines = [StockRequestLine(item_id=item.item_id, item_name_snapshot=item.item_name, quantity=1,
                                             operation_line_id=line.line_id, from_bucket="warehouse", to_bucket="none", status=status)]
            db.add(request)
        db.commit()
    engine.dispose()
    spec = importlib.util.spec_from_file_location("repair_completed_io_batches", Path(__file__).parents[2] / "scripts/repair_completed_io_batches.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.DEVELOPMENT_DB = path

    def backup(source: Path, label: str) -> Path:
        assert label == "completed-io-batches"
        target = tmp_path / "before.db"
        with sqlite3.connect(source) as src, sqlite3.connect(target) as dest:
            src.backup(dest)
        return target

    return module, path, tmp_path / "report.json", backup


def rows(path: Path) -> dict[str, list[tuple]]:
    """모든 테이블을 읽어 정정 대상 외의 이력과 재고가 그대로인지 비교한다."""
    with sqlite3.connect(path) as db:
        return {name: db.execute(f'SELECT * FROM "{name}" ORDER BY rowid').fetchall()
                for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()}


def test_dry_run_reports_candidate_without_writing(repair_case):
    module, path, report, backup = repair_case
    before = rows(path)
    result = module.repair_completed_batches(path, report_path=report, backup_fn=backup)
    assert result["state"] == "dry_run"
    assert len(result["changed"]) == 0
    assert len([row for row in result["batches"] if row["eligible"]]) == 1
    assert rows(path) == before
    assert not (path.parent / "before.db").exists()


def test_apply_changes_only_status_and_updated_at_and_is_idempotent(repair_case):
    module, path, report, backup = repair_case
    before = rows(path)
    result = module.repair_completed_batches(path, apply=True, report_path=report, backup_fn=backup)
    assert result["state"] == "applied"
    assert len(result["changed"]) == 1
    assert result["before_fingerprints"] == result["after_fingerprints"]
    assert rows(path.parent / "before.db") == before
    after = rows(path)
    for name in before.keys() - {"io_batches"}:
        assert after[name] == before[name]
    with sqlite3.connect(path) as db:
        columns = [r[1] for r in db.execute("PRAGMA table_info(io_batches)")]
    changed_columns = {columns[i] for i, (left, right) in enumerate(zip(before["io_batches"][0], after["io_batches"][0])) if left != right}
    assert changed_columns == {"status", "updated_at"}
    assert after["io_batches"][0][columns.index("status")] == "completed"
    again = module.repair_completed_batches(path, apply=True, report_path=report, backup_fn=backup)
    assert again["changed"] == []
    assert rows(path) == after


@pytest.mark.parametrize("mutation", [
    "UPDATE stock_requests SET cancelled_at='2026-09-07 06:00:00' WHERE status='CANCELLED'",
    "UPDATE stock_requests SET cancelled_at=NULL WHERE status='CANCELLED'",
    "UPDATE io_batches SET submitted_at=NULL",
    "UPDATE io_batches SET completed_at=NULL",
    "UPDATE io_batches SET reservation_status='reserved'",
    "UPDATE stock_requests SET status='RESERVED' WHERE status='COMPLETED'",
    "UPDATE stock_requests SET status='REJECTED' WHERE status='COMPLETED'",
    "UPDATE stock_requests SET status='CANCELLED', cancelled_at='2026-09-07 06:00:01' WHERE status='COMPLETED'",
    "UPDATE stock_requests SET completed_at=NULL WHERE status='COMPLETED'",
    "UPDATE stock_request_lines SET status='RESERVED' WHERE status='COMPLETED'",
    "UPDATE stock_request_lines SET quantity=2 WHERE status='COMPLETED'",
    "UPDATE stock_request_lines SET operation_line_id=NULL WHERE status='COMPLETED'",
    "UPDATE io_lines SET included=0",
    "DELETE FROM stock_request_lines WHERE status='COMPLETED'",
    "INSERT INTO io_draft_reservations(reservation_id,batch_id,item_id,source_bucket,source_department,quantity) SELECT 'ledger',batch_id,item_id,'warehouse','',1 FROM io_batches,items",
    "INSERT INTO stock_request_lines(line_id,request_id,item_id,item_name_snapshot,quantity,operation_line_id,from_bucket,to_bucket,status) SELECT 'duplicate',request_id,item_id,item_name_snapshot,quantity,operation_line_id,from_bucket,to_bucket,status FROM stock_request_lines WHERE status='COMPLETED'",
])
def test_unsafe_or_genuinely_partial_work_is_not_promoted(repair_case, mutation):
    module, path, report, backup = repair_case
    with sqlite3.connect(path) as db:
        db.execute(mutation)
    before = rows(path)
    result = module.repair_completed_batches(path, apply=True, report_path=report, backup_fn=backup)
    assert not result["batches"][0]["eligible"]
    assert result["batches"][0]["reason"]
    assert result["changed"] == []
    assert rows(path) == before


def test_rejects_employee_database_before_backup(repair_case):
    module, _, report, backup = repair_case
    with pytest.raises(ValueError, match="development"):
        module.repair_completed_batches(Path("C:/ERP-dev/backend/mes.db"), apply=True, report_path=report, backup_fn=backup)


def test_explicit_employee_mode_repairs_only_employee_database(repair_case):
    module, path, report, backup = repair_case
    dev_path = path.parent / "development.db"
    with sqlite3.connect(path) as source, sqlite3.connect(dev_path) as destination:
        source.backup(destination)
    module.DEVELOPMENT_DB = dev_path
    module.EMPLOYEE_DB = path
    before_dev = rows(dev_path)
    with pytest.raises(ValueError, match="development"):
        module.repair_completed_batches(path, apply=True, report_path=report, backup_fn=backup)
    result = module.repair_completed_batches(path, apply=True, employee_data_only=True, report_path=report, backup_fn=backup)
    assert result["target"] == "employee_data_only"
    assert len(result["changed"]) == 1
    assert result["before_fingerprints"] == result["after_fingerprints"]
    assert rows(dev_path) == before_dev


def test_employee_mode_refuses_development_path(repair_case):
    module, path, report, backup = repair_case
    with pytest.raises(ValueError, match="employee"):
        module.repair_completed_batches(path, employee_data_only=True, report_path=report, backup_fn=backup)


def test_report_cannot_replace_database(repair_case):
    module, path, _, backup = repair_case
    with pytest.raises(ValueError, match="report"):
        module.repair_completed_batches(path, report_path=path, backup_fn=backup)


def test_backup_failure_leaves_database_unchanged(repair_case):
    module, path, report, _ = repair_case
    before = rows(path)

    def fail_backup(source: Path, label: str) -> Path:
        raise OSError("backup unavailable")

    with pytest.raises(OSError, match="backup unavailable"):
        module.repair_completed_batches(path, apply=True, report_path=report, backup_fn=fail_backup)
    assert rows(path) == before


def test_unexpected_inventory_change_is_detected_and_rolled_back(repair_case):
    module, path, report, backup = repair_case
    with sqlite3.connect(path) as db:
        db.execute("CREATE TRIGGER accidental_stock_change AFTER UPDATE OF status ON io_batches BEGIN UPDATE inventory SET warehouse_qty=warehouse_qty-1; END")
    before = rows(path)
    with pytest.raises(RuntimeError, match="Protected database contents changed"):
        module.repair_completed_batches(path, apply=True, report_path=report, backup_fn=backup)
    assert rows(path) == before


def test_prepared_report_failure_rolls_back_status_change(repair_case, monkeypatch):
    module, path, report, backup = repair_case
    before = rows(path)

    def fail_report(path: Path, data: dict) -> None:
        raise OSError("report unavailable")

    monkeypatch.setattr(module, "_write_report", fail_report)
    with pytest.raises(OSError, match="report unavailable"):
        module.repair_completed_batches(path, apply=True, report_path=report, backup_fn=backup)
    assert rows(path) == before
