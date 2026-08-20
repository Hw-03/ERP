#!/usr/bin/env python3
"""Finalize the development item master without changing inventory data."""

from __future__ import annotations

import argparse
from contextlib import closing
from dataclasses import asdict, dataclass
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
from typing import Callable, Iterable
from uuid import UUID

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = PROJECT_ROOT / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.models import Item  # noqa: E402
from app.services.item_display_order import (  # noqa: E402
    _apply_default_item_display_order,
    default_item_display_order,
)


DISPOSAL_CODES = (
    "6-NR-0003",
    "37-PR-0129",
    "34678-NR-0011",
    "348-PR-0175",
    "7-NR-0010",
    "4-VR-0015",
    "6-NR-0004",
    "6-NR-0006",
    "6-NR-0008",
    "8-AR-0300",
)

RESTORE_CODES = tuple(code for code in DISPOSAL_CODES if code != "8-AR-0300")

RENAME_CODES = (
    "3-AA-0016",
    "3-PA-0034",
    "3-PF-0029",
    "348-PR-0174",
    "6-NR-0009",
    "6-PR-0372",
    "8-HR-0055",
    "8-HR-0056",
)


class FinalizeInventoryMasterError(ValueError):
    """Raised when the requested master-data change is unsafe."""


@dataclass(frozen=True)
class EmployeeItem:
    """Employee-server fields required to verify one development item."""

    item_id: str
    mes_code: str
    item_name: str
    deleted: bool


@dataclass(frozen=True)
class FinalizeSummary:
    """Counts produced by a dry-run or applied finalization."""

    applied: bool
    disposal_targets: int
    disposal_items_changed: int
    rename_targets: int
    renamed_items_changed: int


@dataclass(frozen=True)
class EmployeeDisposalSummary:
    """Counts produced by an employee item-status-only synchronization."""

    applied: bool
    restore_targets: int
    items_restored: int
    disposal_targets: int
    disposal_items_changed: int


@dataclass(frozen=True)
class SortOrderSummary:
    """Counts produced by normalizing active item display order."""

    applied: bool
    active_items: int
    changed_items: int
    duplicate_sort_orders: int


def _normalize_item_id(value: object) -> str:
    """Return the UUID as the canonical 32-character hex string."""
    try:
        return UUID(str(value)).hex
    except (TypeError, ValueError, AttributeError) as exc:
        raise FinalizeInventoryMasterError(f"invalid item_id: {value!r}") from exc


def _hash_file(path: Path) -> str:
    """Calculate a SHA-256 hash without opening the file for writing."""
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_employee_items(path: Path, codes: set[str]) -> dict[str, EmployeeItem]:
    """Read the requested item rows through a query-only SQLite connection."""
    if not path.is_file():
        raise FinalizeInventoryMasterError(f"employee DB not found: {path}")
    placeholders = ",".join("?" for _ in codes)
    uri = f"file:{path.resolve().as_posix()}?mode=ro"
    with closing(sqlite3.connect(uri, uri=True)) as connection:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA query_only=ON")
        rows = connection.execute(
            f"""
            SELECT item_id, mes_code, item_name, deleted_at
            FROM items
            WHERE mes_code IN ({placeholders})
            """,
            sorted(codes),
        ).fetchall()
    return {
        str(row["mes_code"]): EmployeeItem(
            item_id=_normalize_item_id(row["item_id"]),
            mes_code=str(row["mes_code"]),
            item_name=str(row["item_name"]),
            deleted=row["deleted_at"] is not None,
        )
        for row in rows
    }


def _by_code(items: Iterable[Item]) -> dict[str, Item]:
    """Index development items by their computed MES code."""
    return {str(item.mes_code): item for item in items}


def run_finalize(
    db: Session,
    employee_db_path: Path,
    *,
    disposal_codes: tuple[str, ...] = DISPOSAL_CODES,
    rename_codes: tuple[str, ...] = RENAME_CODES,
    apply: bool = False,
) -> FinalizeSummary:
    """Validate and optionally apply the explicit item-only finalization."""
    all_codes = set(disposal_codes) | set(rename_codes)
    employee_items = _load_employee_items(employee_db_path, all_codes)
    development_items = _by_code(db.query(Item).filter(Item.mes_code.in_(all_codes)).all())

    missing_employee = sorted(all_codes - employee_items.keys())
    if missing_employee:
        raise FinalizeInventoryMasterError(
            f"employee items missing: {', '.join(missing_employee)}"
        )
    missing_development = sorted(all_codes - development_items.keys())
    if missing_development:
        raise FinalizeInventoryMasterError(
            f"development items missing: {', '.join(missing_development)}"
        )

    for code in sorted(all_codes):
        development = development_items[code]
        employee = employee_items[code]
        if development.deleted_at is not None:
            raise FinalizeInventoryMasterError(f"development item is deleted: {code}")
        if _normalize_item_id(development.item_id) != employee.item_id:
            raise FinalizeInventoryMasterError(f"item_id mismatch: {code}")
    for code in rename_codes:
        if employee_items[code].deleted:
            raise FinalizeInventoryMasterError(f"rename source is deleted: {code}")

    disposal_changes = sum(
        development_items[code].legacy_item_type != "불용" for code in disposal_codes
    )
    rename_changes = sum(
        development_items[code].item_name != employee_items[code].item_name
        for code in rename_codes
    )
    summary = FinalizeSummary(
        applied=apply,
        disposal_targets=len(disposal_codes),
        disposal_items_changed=disposal_changes,
        rename_targets=len(rename_codes),
        renamed_items_changed=rename_changes,
    )
    if not apply:
        return summary

    try:
        for code in disposal_codes:
            development_items[code].legacy_item_type = "불용"
        for code in rename_codes:
            development_items[code].item_name = employee_items[code].item_name
        db.commit()
    except Exception:
        db.rollback()
        raise
    return summary


def run_employee_disposal_sync(
    db: Session,
    dev_db_path: Path,
    *,
    restore_codes: tuple[str, ...] = RESTORE_CODES,
    disposal_codes: tuple[str, ...] = DISPOSAL_CODES,
    apply: bool = False,
) -> EmployeeDisposalSummary:
    """Restore approved employee items and classify them without touching stock."""
    if not set(restore_codes).issubset(disposal_codes):
        raise FinalizeInventoryMasterError(
            "all restore codes must also be disposal codes"
        )

    all_codes = set(disposal_codes)
    development_items = _load_employee_items(dev_db_path, all_codes)
    employee_items = _by_code(
        db.query(Item).filter(Item.mes_code.in_(all_codes)).all()
    )

    missing_development = sorted(all_codes - development_items.keys())
    if missing_development:
        raise FinalizeInventoryMasterError(
            f"development items missing: {', '.join(missing_development)}"
        )
    missing_employee = sorted(all_codes - employee_items.keys())
    if missing_employee:
        raise FinalizeInventoryMasterError(
            f"employee items missing: {', '.join(missing_employee)}"
        )

    for code in sorted(all_codes):
        development = development_items[code]
        employee = employee_items[code]
        if development.deleted:
            raise FinalizeInventoryMasterError(f"development item is deleted: {code}")
        if _normalize_item_id(employee.item_id) != development.item_id:
            raise FinalizeInventoryMasterError(f"item_id mismatch: {code}")
        if employee.item_name != development.item_name:
            raise FinalizeInventoryMasterError(f"item_name mismatch: {code}")

    restored_count = sum(
        employee_items[code].deleted_at is not None for code in restore_codes
    )
    disposal_changes = sum(
        employee_items[code].legacy_item_type != "불용" for code in disposal_codes
    )
    summary = EmployeeDisposalSummary(
        applied=apply,
        restore_targets=len(restore_codes),
        items_restored=restored_count,
        disposal_targets=len(disposal_codes),
        disposal_items_changed=disposal_changes,
    )
    if not apply:
        return summary

    try:
        for code in restore_codes:
            employee_items[code].deleted_at = None
        for code in disposal_codes:
            employee_items[code].legacy_item_type = "불용"
        db.commit()
    except Exception:
        db.rollback()
        raise
    return summary


def run_sort_order_normalization(
    db: Session,
    *,
    apply: bool = False,
) -> SortOrderSummary:
    """Apply the established process-code and serial-number display rule."""
    current_items = (
        db.query(Item)
        .filter(Item.deleted_at.is_(None))
        .order_by(Item.sort_order, Item.mes_code)
        .all()
    )
    target_items = default_item_display_order(current_items)
    summary = SortOrderSummary(
        applied=apply,
        active_items=len(current_items),
        changed_items=sum(
            item.sort_order != target_order
            for target_order, item in enumerate(target_items)
        ),
        duplicate_sort_orders=len(current_items)
        - len({item.sort_order for item in current_items}),
    )
    if not apply:
        return summary

    try:
        _apply_default_item_display_order(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return summary


def _copy_read_only_sqlite(source: Path, target: Path) -> None:
    """Create a consistent employee-master snapshot without writing to it."""
    uri = f"file:{source.resolve().as_posix()}?mode=ro"
    with closing(sqlite3.connect(uri, uri=True)) as source_connection, closing(
        sqlite3.connect(target)
    ) as target_connection:
        source_connection.execute("PRAGMA query_only=ON")
        source_connection.backup(target_connection)


def execute_finalize(
    *,
    dev_db_path: Path,
    employee_db_path: Path,
    apply: bool,
    confirm: str | None,
    backup_fn: Callable[[str], object] | None = None,
) -> FinalizeSummary:
    """Run a dry-run or backed-up apply against the development database."""
    if apply and confirm != "FINALIZE-INVENTORY-MASTER":
        raise FinalizeInventoryMasterError(
            "apply requires --confirm FINALIZE-INVENTORY-MASTER"
        )
    if not dev_db_path.is_file():
        raise FinalizeInventoryMasterError(f"development DB not found: {dev_db_path}")
    if not employee_db_path.is_file():
        raise FinalizeInventoryMasterError(f"employee DB not found: {employee_db_path}")

    employee_hash = _hash_file(employee_db_path)
    with tempfile.TemporaryDirectory(prefix="mes-finalize-master-") as temp_name:
        employee_snapshot = Path(temp_name) / "employee.db"
        _copy_read_only_sqlite(employee_db_path, employee_snapshot)
        if _hash_file(employee_db_path) != employee_hash:
            raise FinalizeInventoryMasterError(
                "employee DB changed while creating the read-only snapshot"
            )

        engine = create_engine(
            f"sqlite:///{dev_db_path.resolve().as_posix()}",
            connect_args={"check_same_thread": False},
        )
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        try:
            with SessionLocal() as db:
                preview = run_finalize(db, employee_snapshot, apply=False)
            if not apply:
                return preview

            if backup_fn is None:
                from scripts.ops.backup_db import backup_sqlite

                backup_fn = backup_sqlite
            backup_fn(str(dev_db_path.resolve()))
            if _hash_file(employee_db_path) != employee_hash:
                raise FinalizeInventoryMasterError(
                    "employee DB changed before the development apply"
                )
            with SessionLocal() as db:
                result = run_finalize(db, employee_snapshot, apply=True)
        finally:
            engine.dispose()

    if _hash_file(employee_db_path) != employee_hash:
        raise FinalizeInventoryMasterError("employee DB changed during finalization")
    return result


def execute_employee_disposal_sync(
    *,
    dev_db_path: Path,
    employee_db_path: Path,
    apply: bool,
    confirm: str | None,
    backup_fn: Callable[[str], object] | None = None,
) -> EmployeeDisposalSummary:
    """Run a guarded, backed-up item-status sync against the employee DB."""
    if apply and confirm != "SYNC-EMPLOYEE-DISPOSAL":
        raise FinalizeInventoryMasterError(
            "apply requires --confirm SYNC-EMPLOYEE-DISPOSAL"
        )
    if not dev_db_path.is_file():
        raise FinalizeInventoryMasterError(f"development DB not found: {dev_db_path}")
    if not employee_db_path.is_file():
        raise FinalizeInventoryMasterError(f"employee DB not found: {employee_db_path}")

    development_hash = _hash_file(dev_db_path)
    with tempfile.TemporaryDirectory(prefix="mes-employee-disposal-") as temp_name:
        development_snapshot = Path(temp_name) / "development.db"
        _copy_read_only_sqlite(dev_db_path, development_snapshot)
        if _hash_file(dev_db_path) != development_hash:
            raise FinalizeInventoryMasterError(
                "development DB changed while creating the read-only snapshot"
            )

        engine = create_engine(
            f"sqlite:///{employee_db_path.resolve().as_posix()}",
            connect_args={"check_same_thread": False},
        )
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        try:
            with SessionLocal() as db:
                preview = run_employee_disposal_sync(
                    db, development_snapshot, apply=False
                )
            if not apply:
                return preview

            if backup_fn is None:
                from scripts.ops.backup_db import backup_sqlite

                backup_fn = backup_sqlite
            backup_fn(str(employee_db_path.resolve()))
            if _hash_file(dev_db_path) != development_hash:
                raise FinalizeInventoryMasterError(
                    "development DB changed before the employee apply"
                )
            with SessionLocal() as db:
                result = run_employee_disposal_sync(
                    db, development_snapshot, apply=True
                )
        finally:
            engine.dispose()

    if _hash_file(dev_db_path) != development_hash:
        raise FinalizeInventoryMasterError(
            "development DB changed during employee synchronization"
        )
    return result


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    """Parse explicit database paths and the apply confirmation guard."""
    parser = argparse.ArgumentParser(
        description="Finalize development item names and disposal classifications."
    )
    parser.add_argument("--dev-db", type=Path, default=BACKEND_DIR / "mes.db")
    parser.add_argument(
        "--employee-db",
        type=Path,
        default=Path(r"C:\ERP-dev\backend\mes.db"),
    )
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm")
    parser.add_argument(
        "--employee-disposal",
        action="store_true",
        help="restore/classify approved employee items without changing inventory",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Run the guarded finalization command and print its JSON summary."""
    args = _parse_args(argv)
    try:
        if args.employee_disposal:
            summary = execute_employee_disposal_sync(
                dev_db_path=args.dev_db,
                employee_db_path=args.employee_db,
                apply=args.apply,
                confirm=args.confirm,
            )
        else:
            summary = execute_finalize(
                dev_db_path=args.dev_db,
                employee_db_path=args.employee_db,
                apply=args.apply,
                confirm=args.confirm,
            )
    except FinalizeInventoryMasterError as exc:
        print(f"[FINALIZE INVENTORY MASTER] ERROR: {exc}", file=sys.stderr)
        return 2
    mode = "APPLIED" if summary.applied else "DRY-RUN"
    operation = (
        "SYNC EMPLOYEE DISPOSAL"
        if args.employee_disposal
        else "FINALIZE INVENTORY MASTER"
    )
    print(f"[{operation}] {mode}")
    print(json.dumps(asdict(summary), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
