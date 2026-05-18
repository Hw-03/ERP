"""
fix_inventory_bucket.py

Phase 1: A/F 시리즈 품목의 warehouse_qty 버킷 버그 수정
  - seed.py / import_real_inventory.py 가 warehouse_qty=quantity 로 설정해서
    InventoryLocation 과 이중 계상된 경우 해소.

Phase 2: 전체 Inventory.quantity 재동기화
  - quantity = warehouse_qty + sum(InventoryLocation)
  - R-series 포함 모든 품목 대상.

Usage:
    cd backend
    python ../scripts/migrations/fix_inventory_bucket.py          # dry-run
    python ../scripts/migrations/fix_inventory_bucket.py --apply  # 실제 반영
"""

from __future__ import annotations

import argparse
import os
import sys
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{(BACKEND_DIR / 'erp.db').as_posix()}")

from app.database import SessionLocal  # noqa: E402
from app.models import Inventory, InventoryLocation, Item, LocationStatusEnum  # noqa: E402
from app.services.inventory import PROCESS_TYPE_TO_DEPT  # noqa: E402
from sqlalchemy import func  # noqa: E402

_R_SERIES = {"TR", "HR", "VR", "NR", "AR", "PR"}


def run(apply: bool) -> None:
    db = SessionLocal()
    try:
        # ── Phase 1: A/F 시리즈 warehouse_qty > 0 수정 ──────────────────────────
        rows = (
            db.query(Inventory, Item)
            .join(Item, Inventory.item_id == Item.item_id)
            .filter(
                Item.process_type_code.isnot(None),
                Item.process_type_code.notin_(list(_R_SERIES)),
                Inventory.warehouse_qty > 0,
            )
            .all()
        )

        moved = 0
        zeroed = 0

        if not rows:
            print("Phase 1: A/F 버킷 수정 대상 없음.")
        else:
            print(f"Phase 1: {len(rows)}건 | {'[DRY-RUN]' if not apply else '[APPLY]'}")

            for inv, item in rows:
                pt = item.process_type_code
                dept = PROCESS_TYPE_TO_DEPT.get(pt)
                if dept is None:
                    print(f"  SKIP {item.item_code}: {pt!r} 부서 매핑 없음")
                    continue

                wh_qty = inv.warehouse_qty or Decimal("0")
                loc = (
                    db.query(InventoryLocation)
                    .filter(
                        InventoryLocation.item_id == item.item_id,
                        InventoryLocation.department == dept,
                        InventoryLocation.status == LocationStatusEnum.PRODUCTION,
                    )
                    .first()
                )

                if loc is None:
                    print(f"  MOVE  {item.item_code} | wh={wh_qty} -> {dept.value}(PROD)")
                    if apply:
                        db.add(InventoryLocation(
                            item_id=item.item_id,
                            department=dept,
                            status=LocationStatusEnum.PRODUCTION,
                            quantity=wh_qty,
                        ))
                        inv.warehouse_qty = Decimal("0")
                    moved += 1
                else:
                    print(f"  ZERO  {item.item_code} | wh={wh_qty} -> 0 (loc={loc.quantity} 유지)")
                    if apply:
                        inv.warehouse_qty = Decimal("0")
                    zeroed += 1

        if apply:
            db.flush()

        # ── Phase 2: 전체 Inventory.quantity 재동기화 ────────────────────────────
        all_invs = db.query(Inventory).all()
        synced = 0
        for inv in all_invs:
            loc_sum = (
                db.query(func.coalesce(func.sum(InventoryLocation.quantity), 0))
                .filter(InventoryLocation.item_id == inv.item_id)
                .scalar()
            ) or 0
            correct = (inv.warehouse_qty or Decimal("0")) + Decimal(str(loc_sum))
            if abs((inv.quantity or Decimal("0")) - correct) > Decimal("0.0001"):
                synced += 1
                if apply:
                    inv.quantity = correct

        if apply:
            db.commit()

        print()
        if apply:
            print(f"완료: MOVE {moved}건, ZERO {zeroed}건, quantity 재동기화 {synced}건")
        else:
            print(f"DRY-RUN: MOVE {moved}건, ZERO {zeroed}건, 재동기화 필요 {synced}건 (--apply 로 반영)")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="재고 버킷 버그 수정 (A/F series + quantity sync)")
    parser.add_argument("--apply", action="store_true", help="실제로 DB 반영 (미지정 시 dry-run)")
    args = parser.parse_args()
    run(apply=args.apply)
