"""Raise eligible employee department stock to min_stock plus a fixed buffer.

The default execution is a read-only preview.  ``--apply`` creates a SQLite
backup, locks the database transaction, creates auditable ADJUST logs, and
then updates only single-department PRODUCTION rows below the target.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable


SAFETY_BUFFER = 100
PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.ops.maintenance_backup import create_sqlite_snapshot  # noqa: E402
from scripts.runtime_paths import runtime_path  # noqa: E402

STOCK_QUERY = """
SELECT
    items.item_id,
    items.mes_code,
    COALESCE(items.min_stock, 0) AS min_stock,
    COALESCE(SUM(CASE WHEN inventory_locations.status = 'PRODUCTION' THEN inventory_locations.quantity ELSE 0 END), 0) AS production_quantity,
    COUNT(DISTINCT CASE WHEN inventory_locations.status = 'PRODUCTION' THEN inventory_locations.department END) AS production_department_count,
    MAX(CASE WHEN inventory_locations.status = 'PRODUCTION' THEN inventory_locations.department END) AS department,
    inventory.quantity AS inventory_quantity,
    inventory.warehouse_qty AS warehouse_quantity,
    COALESCE(SUM(COALESCE(inventory_locations.quantity, 0)), 0) AS all_location_quantity
FROM items
LEFT JOIN inventory ON inventory.item_id = items.item_id
LEFT JOIN inventory_locations ON inventory_locations.item_id = items.item_id
WHERE items.deleted_at IS NULL
GROUP BY items.item_id
ORDER BY items.mes_code
"""


@dataclass(frozen=True)
class DepartmentStock:
    item_id: str
    mes_code: str
    min_stock: int
    production_quantity: int
    department: str | None
    production_department_count: int
    inventory_quantity: int | None = None
    warehouse_quantity: int | None = None
    all_location_quantity: int = 0


@dataclass(frozen=True)
class ReplenishmentTarget:
    item_id: str
    mes_code: str
    department: str
    target_quantity: int
    increase_quantity: int


@dataclass(frozen=True)
class ReplenishmentPlan:
    targets: tuple[ReplenishmentTarget, ...]
    total_increase: int
    skipped_above_or_at_target: int
    skipped_multiple_departments: int
    skipped_without_department: int


@dataclass(frozen=True)
class ReplenishmentReport:
    applied: bool
    target_count: int
    total_increase: int
    transaction_log_count: int
    skipped_above_or_at_target: int
    skipped_multiple_departments: int
    skipped_without_department: int
    backup_path: str | None


def plan_replenishment(stocks: Iterable[DepartmentStock]) -> ReplenishmentPlan:
    """Return only positive replenishments for one existing production department per item."""
    targets: list[ReplenishmentTarget] = []
    skipped_above_or_at_target = 0
    skipped_multiple_departments = 0
    skipped_without_department = 0

    for stock in stocks:
        if stock.production_department_count == 0 or stock.department is None:
            skipped_without_department += 1
            continue
        if stock.production_department_count > 1:
            skipped_multiple_departments += 1
            continue

        target_quantity = stock.min_stock + SAFETY_BUFFER
        if stock.production_quantity >= target_quantity:
            skipped_above_or_at_target += 1
            continue

        targets.append(
            ReplenishmentTarget(
                item_id=stock.item_id,
                mes_code=stock.mes_code,
                department=stock.department,
                target_quantity=target_quantity,
                increase_quantity=target_quantity - stock.production_quantity,
            )
        )

    return ReplenishmentPlan(
        targets=tuple(targets),
        total_increase=sum(target.increase_quantity for target in targets),
        skipped_above_or_at_target=skipped_above_or_at_target,
        skipped_multiple_departments=skipped_multiple_departments,
        skipped_without_department=skipped_without_department,
    )


def _to_stock(row: object) -> DepartmentStock:
    item_id, mes_code, min_stock, production_qty, department_count, department, total, warehouse, locations = row
    return DepartmentStock(
        item_id=str(item_id),
        mes_code=str(mes_code),
        min_stock=int(min_stock or 0),
        production_quantity=int(production_qty or 0),
        department=str(department) if department is not None else None,
        production_department_count=int(department_count or 0),
        inventory_quantity=int(total) if total is not None else None,
        warehouse_quantity=int(warehouse) if warehouse is not None else None,
        all_location_quantity=int(locations or 0),
    )


def load_stocks(connection: sqlite3.Connection) -> tuple[DepartmentStock, ...]:
    """Load the active-item stock snapshot through a read-only SQLite connection."""
    return tuple(_to_stock(row) for row in connection.execute(STOCK_QUERY).fetchall())


def _load_stocks_from_session(session: object) -> tuple[DepartmentStock, ...]:
    from sqlalchemy import text

    rows = session.execute(text(STOCK_QUERY)).fetchall()
    return tuple(_to_stock(tuple(row)) for row in rows)


def _create_backup(database_path: Path) -> Path:
    """Create a pre-replenishment snapshot in the permanent runtime tree."""
    return create_sqlite_snapshot(database_path, "department-safety-replenish")


def _plan_signature(plan: ReplenishmentPlan) -> tuple[tuple[str, int, str], ...]:
    return tuple((target.item_id, target.increase_quantity, target.department) for target in plan.targets)


def _validate_target_invariants(stocks: tuple[DepartmentStock, ...], plan: ReplenishmentPlan) -> None:
    by_id = {stock.item_id: stock for stock in stocks}
    for target in plan.targets:
        stock = by_id.get(target.item_id)
        if stock is None:
            raise ValueError(f"target item disappeared: {target.mes_code}")
        if stock.production_department_count != 1 or stock.department != target.department:
            raise ValueError(f"target department changed: {target.mes_code}")
        if stock.inventory_quantity is None or stock.warehouse_quantity is None:
            raise ValueError(f"target inventory is missing: {target.mes_code}")
        if stock.inventory_quantity != stock.warehouse_quantity + stock.all_location_quantity:
            raise ValueError(f"inventory invariant failed before change: {target.mes_code}")
        if stock.production_quantity + target.increase_quantity != target.target_quantity:
            raise ValueError(f"target quantity changed: {target.mes_code}")


def _session_local_for(database_path: Path):
    os.environ["DATABASE_URL"] = f"sqlite:///{database_path.resolve().as_posix()}"
    os.environ.pop("APP_ENV", None)
    os.environ.pop("REQUIRE_POSTGRES", None)
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))
    from app.database import SessionLocal

    return SessionLocal


def _apply_locked_plan(database_path: Path, preview_plan: ReplenishmentPlan) -> int:
    session_local = _session_local_for(database_path)
    from app.models import DepartmentEnum, DeptAdjSubTypeEnum
    from app.services import dept_adjustment

    session = session_local()
    try:
        locked_stocks = _load_stocks_from_session(session)
        locked_plan = plan_replenishment(locked_stocks)
        if _plan_signature(locked_plan) != _plan_signature(preview_plan):
            raise ValueError("stock changed after preview; no update was applied")
        _validate_target_invariants(locked_stocks, locked_plan)

        lines = [
            dept_adjustment.AdjLine(
                item_id=uuid.UUID(target.item_id),
                direction="in",
                quantity=target.increase_quantity,
                department=DepartmentEnum(target.department),
                reason="safety_stock_plus_100",
            )
            for target in locked_plan.targets
        ]
        log_ids = dept_adjustment.submit_adjustment(
            session,
            DeptAdjSubTypeEnum.CORRECTION,
            lines,
            operator_name="system",
            reference_no="SAFETY-STOCK-PLUS-100",
            notes="safety_stock_plus_100",
        )
        session.commit()
        return len(log_ids)
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _verify_applied(database_path: Path, plan: ReplenishmentPlan, warehouse_before: dict[str, int]) -> None:
    with sqlite3.connect(f"file:{database_path}?mode=ro", uri=True) as connection:
        stocks = {stock.item_id: stock for stock in load_stocks(connection)}
        for target in plan.targets:
            stock = stocks.get(target.item_id)
            if stock is None:
                raise ValueError(f"target item missing after change: {target.mes_code}")
            if stock.production_quantity != target.target_quantity:
                raise ValueError(f"target quantity mismatch after change: {target.mes_code}")
            if stock.warehouse_quantity != warehouse_before[target.item_id]:
                raise ValueError(f"warehouse quantity changed: {target.mes_code}")
            if stock.inventory_quantity != stock.warehouse_quantity + stock.all_location_quantity:
                raise ValueError(f"inventory invariant failed after change: {target.mes_code}")
        if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("SQLite integrity check failed")
        if connection.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("SQLite foreign key check failed")


def replenish_database(
    database_path: Path,
    *,
    apply: bool,
) -> ReplenishmentReport:
    """Preview or atomically replenish eligible production stock without changing warehouse stock."""
    database_path = Path(database_path)
    if not database_path.is_file():
        raise FileNotFoundError(f"database file not found: {database_path}")

    with sqlite3.connect(f"file:{database_path}?mode=ro", uri=True) as connection:
        preview_stocks = load_stocks(connection)
    preview_plan = plan_replenishment(preview_stocks)
    base_report = {
        "target_count": len(preview_plan.targets),
        "total_increase": preview_plan.total_increase,
        "skipped_above_or_at_target": preview_plan.skipped_above_or_at_target,
        "skipped_multiple_departments": preview_plan.skipped_multiple_departments,
        "skipped_without_department": preview_plan.skipped_without_department,
    }
    if not apply:
        return ReplenishmentReport(
            applied=False,
            transaction_log_count=0,
            backup_path=None,
            **base_report,
        )
    if not preview_plan.targets:
        return ReplenishmentReport(
            applied=False,
            transaction_log_count=0,
            backup_path=None,
            **base_report,
        )

    warehouse_before = {
        stock.item_id: stock.warehouse_quantity
        for stock in preview_stocks
        if stock.item_id in {target.item_id for target in preview_plan.targets}
    }
    if any(quantity is None for quantity in warehouse_before.values()):
        raise ValueError("target inventory is missing before backup")

    backup_path = _create_backup(database_path)
    transaction_log_count = _apply_locked_plan(database_path, preview_plan)
    _verify_applied(database_path, preview_plan, warehouse_before)
    return ReplenishmentReport(
        applied=True,
        transaction_log_count=transaction_log_count,
        backup_path=str(backup_path),
        **base_report,
    )


def _write_report(report_dir: Path, report: ReplenishmentReport) -> None:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    (report_dir / f"department-safety-replenish-report-{timestamp}.json").write_text(
        json.dumps(asdict(report), ensure_ascii=False, indent=2), encoding="utf-8"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=Path("backend/mes.db"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        report = replenish_database(
            args.database,
            apply=args.apply,
        )
        if report.applied:
            _write_report(runtime_path("reports", "maintenance", create=True), report)
    except Exception as error:
        print(f"[failed] {error}")
        return 1

    mode = "applied" if report.applied else "preview"
    print(
        f"[{mode}] targets={report.target_count} increase={report.total_increase} "
        f"logs={report.transaction_log_count} skipped_at_or_above={report.skipped_above_or_at_target} "
        f"skipped_multi={report.skipped_multiple_departments} skipped_none={report.skipped_without_department}"
    )
    if report.backup_path:
        print(f"[backup] {report.backup_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
