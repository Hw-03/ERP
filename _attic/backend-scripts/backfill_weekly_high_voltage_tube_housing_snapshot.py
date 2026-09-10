#!/usr/bin/env python3
"""세라믹튜브 70KV 하우징을 기존 주간 스냅샷에 안전하게 보충한다."""

from __future__ import annotations

import argparse
import importlib.util
import sys
from datetime import date
from pathlib import Path
from typing import Callable


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
IMPLEMENTATION_PATH = PROJECT_ROOT / "_attic" / "backend-scripts" / "backfill_weekly_vacuum_generator_snapshot.py"
BACKUP_LABEL = "weekly-high-voltage-tube-housing-snapshot"
TARGET_MES_CODE = "3468-HA-0006"
TARGET_PROCESS_CODE = "HA"

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.models import Item  # noqa: E402
from scripts.ops.backup_db import backup_sqlite  # noqa: E402


def _load_implementation():
    spec = importlib.util.spec_from_file_location("weekly_snapshot_backfill", IMPLEMENTATION_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load snapshot backfill implementation: {IMPLEMENTATION_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def is_target(item: Item) -> bool:
    """승인된 세라믹튜브 70KV 하우징 한 품목만 선택한다."""
    return item.process_type_code == TARGET_PROCESS_CODE and item.mes_code == TARGET_MES_CODE


def backfill_snapshot(
    db_path: Path,
    *,
    week_end: date,
    apply: bool,
    backup_fn: Callable[..., Path] = backup_sqlite,
):
    """대상 일요일 스냅샷을 미리보거나 백업 후 원자적으로 보충한다."""
    implementation = _load_implementation()
    return implementation.backfill_snapshot(
        db_path,
        week_end=week_end,
        apply=apply,
        backup_fn=backup_fn,
        target_predicate=is_target,
        backup_label=BACKUP_LABEL,
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill ceramic-tube housing HA item into one weekly inventory snapshot",
    )
    parser.add_argument("--db", type=Path, default=BACKEND_ROOT / "mes.db")
    parser.add_argument("--week-end", type=date.fromisoformat, required=True)
    parser.add_argument("--apply", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    report = backfill_snapshot(args.db, week_end=args.week_end, apply=args.apply)
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
