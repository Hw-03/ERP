"""옛 취소로 남은 일부 완료만 정정한다. 직원 DB는 --employee-data-only로 명시해야 한다."""
from __future__ import annotations

import argparse
from collections import Counter
from collections.abc import Callable
from datetime import datetime
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
from typing import Any
import uuid

PROJECT_ROOT = Path(__file__).resolve().parents[2]
for import_root in (PROJECT_ROOT, PROJECT_ROOT / "backend"):
    if str(import_root) not in sys.path:
        sys.path.insert(0, str(import_root))

from sqlalchemy import create_engine, update  # noqa: E402
from sqlalchemy.engine import Connection  # noqa: E402
from sqlalchemy.orm import Session, selectinload  # noqa: E402

from app.models import IoBatch, IoBundle, IoDraftReservation, StockRequest, StockRequestStatusEnum  # noqa: E402
from app.services.io_persist import current_submission_requests  # noqa: E402

DEVELOPMENT_DB = Path("C:/ERP/backend/mes.db")
EMPLOYEE_DB = Path("C:/ERP-dev/backend/mes.db")


def _ineligible_reason(batch: IoBatch, requests: list[StockRequest], has_ledger: bool) -> str | None:
    """모든 현재 라인의 완료 근거가 일치할 때만 상태 정정을 허용한다."""
    current = current_submission_requests(batch, requests)
    if len(current) == len(requests):
        return "no_proven_previous_cancellation"
    if not current or any(request.status != StockRequestStatusEnum.COMPLETED for request in current):
        return "current_requests_not_completed"
    if batch.completed_at is None or any(request.completed_at is None for request in current):
        return "missing_completion_time"
    if batch.reservation_status != "inactive" or has_ledger:
        return "remaining_reservation"
    if any(not request.lines or any(line.status != StockRequestStatusEnum.COMPLETED for line in request.lines) for request in current):
        return "current_lines_not_completed"
    expected = Counter((line.line_id, line.item_id, int(line.quantity))
                       for bundle in batch.bundles for line in bundle.lines if line.included)
    actual = Counter((line.operation_line_id, line.item_id, int(line.quantity))
                     for request in current for line in request.lines)
    if not expected or actual != expected:
        return "line_mapping_mismatch"
    return None


def _inspect_batches(db: Session) -> list[dict[str, Any]]:
    """조회 시 상태를 동기화하지 않고 동일한 기준으로 대상과 제외 사유를 반환한다."""
    batches = db.query(IoBatch).filter_by(status="partially_completed").options(
        selectinload(IoBatch.bundles).selectinload(IoBundle.lines),
    ).order_by(IoBatch.batch_id).all()
    result = []
    for batch in batches:
        requests = db.query(StockRequest).filter_by(operation_batch_id=batch.batch_id).options(selectinload(StockRequest.lines)).all()
        has_ledger = db.query(IoDraftReservation.reservation_id).filter_by(batch_id=batch.batch_id).first() is not None
        reason = _ineligible_reason(batch, requests, has_ledger)
        result.append({
            "batch_id": str(batch.batch_id), "reference_no": batch.reference_no, "requester_name": batch.requester_name,
            "eligible": reason is None, "reason": reason,
            "previous_cancellations": len(requests) - len(current_submission_requests(batch, requests)),
            "before": {"status": batch.status, "updated_at": batch.updated_at, "completed_at": batch.completed_at},
        })
    return result


def _quote(identifier: str) -> str:
    """테이블·열 식별자를 SQLite 규칙에 맞춰 인용한다."""
    return '"' + identifier.replace('"', '""') + '"'


def _fingerprints(connection: Connection) -> dict[str, str]:
    """정정할 두 열을 제외한 모든 테이블을 비교해 원장 변경을 감지한다."""
    result = {}
    tables = connection.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").scalars().all()
    for name in tables:
        info = connection.exec_driver_sql(f"PRAGMA table_info({_quote(name)})").all()
        columns = [row[1] for row in info if name != "io_batches" or row[1] not in {"status", "updated_at"}]
        keys = [row[1] for row in sorted(info, key=lambda row: row[5]) if row[5]] or columns
        sql = f"SELECT {','.join(map(_quote, columns))} FROM {_quote(name)} ORDER BY {','.join(map(_quote, keys))}"
        digest = hashlib.sha256()
        for row in connection.exec_driver_sql(sql):
            digest.update(repr(tuple(row)).encode("utf-8"))
            digest.update(b"\n")
        result[name] = digest.hexdigest()
    return result


def _write_report(path: Path, report: dict[str, Any]) -> None:
    """커밋 전 prepared 기록부터 남기고 보고 파일을 원자적으로 교체한다."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
    temporary.replace(path)


def repair_completed_batches(
    database: Path,
    *,
    report_path: Path,
    apply: bool = False,
    employee_data_only: bool = False,
    backup_fn: Callable[[Path, str], Path] | None = None,
) -> dict[str, Any]:
    """선택한 환경의 정확한 DB만 허용하고 백업 뒤 상태와 수정 시각만 정정한다."""
    database = Path(database).resolve()
    expected_database = EMPLOYEE_DB if employee_data_only else DEVELOPMENT_DB
    if database != expected_database.resolve():
        target = "employee" if employee_data_only else "development"
        raise ValueError(f"Only the {target} database is permitted")
    report_path = Path(report_path).resolve()
    if report_path == database:
        raise ValueError("The report must not replace the database")
    if not database.is_file():
        raise FileNotFoundError(database)
    report: dict[str, Any] = {"database": str(database), "target": "employee_data_only" if employee_data_only else "development",
                              "state": "dry_run", "backup": None, "changed": []}
    if apply:
        if backup_fn is None:
            from scripts.ops.maintenance_backup import create_sqlite_snapshot
            backup_fn = create_sqlite_snapshot
        report["backup"] = str(backup_fn(database, "completed-io-batches"))
    engine = create_engine("sqlite://", creator=lambda: sqlite3.connect(
        f"{database.as_uri()}?mode={'rw' if apply else 'ro'}", uri=True, isolation_level=None, timeout=5,
    ))
    try:
        with engine.connect() as connection:
            # 점검부터 수정까지 쓰기 잠금을 유지해 다른 변경이 끼어들지 못하게 한다.
            connection.exec_driver_sql("BEGIN IMMEDIATE" if apply else "BEGIN")
            report["before_fingerprints"] = _fingerprints(connection)
            with Session(bind=connection, autoflush=False) as db:
                report["batches"] = _inspect_batches(db)
                if apply:
                    now = datetime.utcnow()
                    for row in report["batches"]:
                        if not row["eligible"]:
                            continue
                        result = db.execute(update(IoBatch).where(
                            IoBatch.batch_id == uuid.UUID(row["batch_id"]), IoBatch.status == "partially_completed",
                        ).values(status="completed", updated_at=now))
                        if result.rowcount != 1:
                            raise RuntimeError("Candidate changed during repair")
                        report["changed"].append({"batch_id": row["batch_id"], "before": row["before"],
                                                  "after": {**row["before"], "status": "completed", "updated_at": now}})
                report["after_fingerprints"] = _fingerprints(connection)
                if report["before_fingerprints"] != report["after_fingerprints"]:
                    raise RuntimeError("Protected database contents changed; repair rolled back")
                report["state"] = "prepared" if apply else "dry_run"
                _write_report(report_path, report)
            if apply:
                connection.commit()
            else:
                connection.rollback()
    finally:
        engine.dispose()
    if apply:
        report["state"] = "applied"
        _write_report(report_path, report)
    return report


def main() -> int:
    """조회가 기본이며 직원 DB는 별도 명시 옵션으로만 선택한다."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path)
    parser.add_argument("--employee-data-only", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--report", type=Path, default=PROJECT_ROOT / "_attic/runtime/completed-io-batches" /
                        f"{datetime.now():%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:8]}.json")
    args = parser.parse_args()
    database = args.database or (EMPLOYEE_DB if args.employee_data_only else DEVELOPMENT_DB)
    report = repair_completed_batches(database, apply=args.apply, employee_data_only=args.employee_data_only, report_path=args.report)
    print(json.dumps({"target": report["target"], "state": report["state"], "eligible": sum(row["eligible"] for row in report["batches"]),
                      "changed": len(report["changed"]), "report": str(args.report), "backup": report["backup"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
