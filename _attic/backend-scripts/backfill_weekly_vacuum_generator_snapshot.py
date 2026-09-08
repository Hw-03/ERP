#!/usr/bin/env python3
"""발생부 진공 품목을 기존 주간 스냅샷에 안전하게 보충한다.

기본 실행은 미리보기이며 ``--apply``를 지정해야만 검증된 백업 생성 후
누락 행과 스냅샷 헤더 합계를 한 트랜잭션으로 갱신한다.
"""

from __future__ import annotations

import argparse
import sys
import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Callable

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.models import (  # noqa: E402
    Item,
    LocationStatusEnum,
    TransactionLog,
    WeeklyInventorySnapshot,
    WeeklyInventorySnapshotItem,
)
from app.services import stock_math  # noqa: E402
from app.services.weekly_report_scope import (  # noqa: E402
    is_vacuum_generator_weekly_item,
)
from app.services.weekly_inventory_snapshot import DISUSED_ITEM_TYPE  # noqa: E402
from scripts.ops.backup_db import backup_sqlite  # noqa: E402


BACKUP_LABEL = "weekly-vacuum-generator-snapshot"


class BackfillSafetyError(RuntimeError):
    """스냅샷 경계값을 검증 가능한 원장으로 복원할 수 없을 때 발생한다."""


@dataclass(frozen=True)
class BackfillRow:
    """기존 스냅샷에 추가할 한 품목의 확정 경계값."""

    item_id: uuid.UUID
    mes_code: str | None
    item_name: str
    process_type_code: str
    quantity: Decimal
    normal_quantity: Decimal
    defective_quantity: Decimal


@dataclass(frozen=True)
class BackfillReport:
    """미리보기 또는 적용 결과."""

    week_end: date
    rows: tuple[BackfillRow, ...]
    applied: bool
    backup_path: Path | None


def _decimal(value: object) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise BackfillSafetyError("inventory_effect delta is invalid") from exc


def _effect_deltas(effect: object) -> tuple[Decimal, Decimal]:
    """한 거래 효과에서 정상·불량 재고 증감을 분리한다."""

    if not isinstance(effect, list):
        raise BackfillSafetyError("inventory_effect is missing or invalid")
    normal_delta = Decimal("0")
    defective_delta = Decimal("0")
    for cell in effect:
        if not isinstance(cell, dict) or "delta" not in cell:
            raise BackfillSafetyError("inventory_effect is missing or invalid")
        delta = _decimal(cell["delta"])
        scope = cell.get("scope")
        if scope == "warehouse":
            normal_delta += delta
            continue
        if scope == "warehouse_box":
            continue
        if scope != "location":
            raise BackfillSafetyError(f"inventory_effect scope is unsupported: {scope}")
        status = cell.get("status")
        if status == LocationStatusEnum.PRODUCTION.value:
            normal_delta += delta
        elif status == LocationStatusEnum.DEFECTIVE.value:
            defective_delta += delta
        else:
            raise BackfillSafetyError(f"inventory_effect location status is unsupported: {status}")
    return normal_delta, defective_delta


def _build_rows(
    db: Session,
    snapshot: WeeklyInventorySnapshot,
    *,
    target_predicate: Callable[[Item], bool],
) -> tuple[BackfillRow, ...]:
    """현재 셀 재고에서 경계 이후 원장 효과를 빼 누락 행을 복원한다."""

    existing_ids = {
        row.item_id
        for row in (
            db.query(WeeklyInventorySnapshotItem.item_id)
            .filter(WeeklyInventorySnapshotItem.snapshot_id == snapshot.snapshot_id)
            .all()
        )
    }
    missing_items = (
        db.query(Item)
        .filter(Item.created_at <= snapshot.as_of_utc)
        .order_by(Item.mes_code)
        .all()
    )
    missing_items = [item for item in missing_items if item.item_id not in existing_ids]
    for item in missing_items:
        existed_at_cutoff = item.deleted_at is None or item.deleted_at > snapshot.as_of_utc
        if existed_at_cutoff and (
            item.updated_at > snapshot.as_of_utc or item.deleted_at is not None
        ):
            raise BackfillSafetyError(
                f"item metadata changed after snapshot cutoff: {item.mes_code}"
            )
    candidates = [
        item
        for item in missing_items
        if item.deleted_at is None
        and item.legacy_item_type != DISUSED_ITEM_TYPE
        and target_predicate(item)
    ]
    figures = stock_math.bulk_compute(db, [item.item_id for item in candidates])
    rows: list[BackfillRow] = []
    for item in candidates:
        normal_delta = Decimal("0")
        defective_delta = Decimal("0")
        logs = (
            db.query(TransactionLog)
            .filter(
                TransactionLog.item_id == item.item_id,
                TransactionLog.created_at > snapshot.as_of_utc,
                TransactionLog.cancelled.is_(False),
            )
            .order_by(TransactionLog.created_at, TransactionLog.log_id)
            .all()
        )
        for log in logs:
            log_normal, log_defective = _effect_deltas(log.inventory_effect)
            normal_delta += log_normal
            defective_delta += log_defective

        current = figures[item.item_id]
        normal = current.warehouse_qty + current.production_total - normal_delta
        defective = current.defective_total - defective_delta
        quantity = normal + defective
        if normal < 0 or defective < 0 or quantity < 0:
            raise BackfillSafetyError(
                f"negative reconstructed stock for {item.mes_code}: "
                f"normal={normal}, defective={defective}"
            )
        rows.append(
            BackfillRow(
                item_id=item.item_id,
                mes_code=item.mes_code,
                item_name=item.item_name,
                process_type_code=item.process_type_code,
                quantity=quantity,
                normal_quantity=normal,
                defective_quantity=defective,
            )
        )
    return tuple(rows)


def _recompute_header(db: Session, snapshot: WeeklyInventorySnapshot) -> None:
    rows = (
        db.query(WeeklyInventorySnapshotItem)
        .filter(WeeklyInventorySnapshotItem.snapshot_id == snapshot.snapshot_id)
        .all()
    )
    snapshot.item_count = len(rows)
    snapshot.total_quantity = sum((row.quantity for row in rows), Decimal("0"))
    snapshot.normal_total_quantity = sum(
        (row.normal_quantity for row in rows),
        Decimal("0"),
    )
    snapshot.defective_total_quantity = sum(
        (row.defective_quantity for row in rows),
        Decimal("0"),
    )


def _validate_verified_snapshot(db: Session, snapshot: WeeklyInventorySnapshot) -> None:
    """정상·불량 기준선이 완전한 v2 이상 스냅샷만 허용한다."""

    if (
        snapshot.basis_version < 2
        or snapshot.normal_total_quantity is None
        or snapshot.defective_total_quantity is None
    ):
        raise BackfillSafetyError("a complete verified v2 snapshot is required")
    incomplete = (
        db.query(WeeklyInventorySnapshotItem)
        .filter(
            WeeklyInventorySnapshotItem.snapshot_id == snapshot.snapshot_id,
            (
                WeeklyInventorySnapshotItem.normal_quantity.is_(None)
                | WeeklyInventorySnapshotItem.defective_quantity.is_(None)
            ),
        )
        .first()
    )
    if incomplete is not None:
        raise BackfillSafetyError("a complete verified v2 snapshot is required")


def backfill_snapshot(
    db_path: Path,
    *,
    week_end: date,
    apply: bool,
    backup_fn: Callable[..., Path] = backup_sqlite,
    target_predicate: Callable[[Item], bool] | None = None,
    backup_label: str = BACKUP_LABEL,
) -> BackfillReport:
    """대상 일요일 스냅샷을 미리보거나 백업 후 원자적으로 보충한다."""

    source = db_path.resolve()
    resolved_target_predicate = target_predicate or (
        lambda item: is_vacuum_generator_weekly_item(item.process_type_code, item.item_name)
    )
    if not source.is_file():
        raise BackfillSafetyError(f"database file not found: {source}")
    database_url = (
        f"sqlite:///{source.as_posix()}"
        if apply
        else f"sqlite:///file:{source.as_posix()}?mode=ro&uri=true"
    )
    engine = create_engine(database_url)
    try:
        with Session(engine, autoflush=False) as db:
            if apply:
                db.execute(text("BEGIN IMMEDIATE"))
            snapshot = (
                db.query(WeeklyInventorySnapshot)
                .filter(WeeklyInventorySnapshot.week_end == week_end)
                .one_or_none()
            )
            if snapshot is None:
                raise BackfillSafetyError(f"weekly snapshot not found: {week_end.isoformat()}")
            _validate_verified_snapshot(db, snapshot)
            rows = _build_rows(
                db,
                snapshot,
                target_predicate=resolved_target_predicate,
            )
            if not apply or not rows:
                db.rollback()
                return BackfillReport(
                    week_end=week_end,
                    rows=rows,
                    applied=False,
                    backup_path=None,
                )

            backup_path = backup_fn(str(source), label=backup_label)
            db.add_all(
                [
                    WeeklyInventorySnapshotItem(
                        snapshot_id=snapshot.snapshot_id,
                        item_id=row.item_id,
                        mes_code=row.mes_code,
                        item_name=row.item_name,
                        process_type_code=row.process_type_code,
                        quantity=row.quantity,
                        normal_quantity=row.normal_quantity,
                        defective_quantity=row.defective_quantity,
                    )
                    for row in rows
                ]
            )
            db.flush()
            _recompute_header(db, snapshot)
            db.commit()
            return BackfillReport(
                week_end=week_end,
                rows=rows,
                applied=True,
                backup_path=backup_path,
            )
    finally:
        engine.dispose()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill vacuum-generator VA items into one weekly inventory snapshot",
    )
    parser.add_argument("--db", type=Path, default=BACKEND_ROOT / "mes.db")
    parser.add_argument("--week-end", type=date.fromisoformat, required=True)
    parser.add_argument("--apply", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    report = backfill_snapshot(
        args.db,
        week_end=args.week_end,
        apply=args.apply,
    )
    mode = "APPLY" if report.applied else "PREVIEW"
    print(f"[{mode}] week_end={report.week_end.isoformat()} additions={len(report.rows)}")
    for row in report.rows:
        print(
            f"  {row.mes_code} {row.item_name}: "
            f"total={row.quantity} normal={row.normal_quantity} defective={row.defective_quantity}"
        )
    if report.backup_path is not None:
        print(f"BACKUP_PATH={report.backup_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
