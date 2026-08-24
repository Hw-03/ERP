#!/usr/bin/env python3
"""매주 월요일 실행해 직전 일요일 완료품 재고를 확정한다."""

from __future__ import annotations

import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import SessionLocal  # noqa: E402
from app.services.weekly_inventory_snapshot import (  # noqa: E402
    WeeklyInventorySnapshotGapError,
    ensure_due_snapshot_committed,
)


def main() -> int:
    """확정 결과를 작업 스케줄러 로그에 남길 한 줄로 출력한다."""

    try:
        with SessionLocal() as db:
            snapshot = ensure_due_snapshot_committed(db, source="scheduled")
    except WeeklyInventorySnapshotGapError as exc:
        print(f"[WEEKLY SNAPSHOT] ERROR {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 - 예약 작업은 실패 유형을 종료 코드로 전달
        print(
            f"[WEEKLY SNAPSHOT] ERROR {type(exc).__name__}: {exc}",
            file=sys.stderr,
        )
        return 1

    if snapshot is None:
        print("[WEEKLY SNAPSHOT] SKIPPED boundary already changed", file=sys.stderr)
        return 2

    print(
        "[WEEKLY SNAPSHOT] OK "
        f"week_end={snapshot.week_end.isoformat()} "
        f"items={snapshot.item_count} "
        f"total={snapshot.total_quantity} "
        f"source={snapshot.capture_source}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
