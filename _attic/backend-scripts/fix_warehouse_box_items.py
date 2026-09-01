"""창고 박스의 빈 컨테이너만 정리하고 수량 원장 불일치는 fail-closed한다.

0032부터 B/Z/U는 하나의 물리 원장이다. 출처가 불명확한 B 초과분을 자동 축소하면
수량을 잃으므로 이 스크립트는 W=B+Z+U 위반을 보고하고 중단한다.

실행:
  cd backend
  python ../_attic/backend-scripts/fix_warehouse_box_items.py          # dry-run
  python ../_attic/backend-scripts/fix_warehouse_box_items.py --apply  # 빈 박스만 삭제
"""

from __future__ import annotations

import sys

sys.path.insert(0, ".")

from app.database import SessionLocal  # noqa: E402
from app.models import WarehouseBox, WarehouseBoxItem  # noqa: E402
from app.services.warehouse_map import reconcile_inventory  # noqa: E402


def main() -> None:
    apply_mode = "--apply" in sys.argv
    print(
        f"{'[APPLY]' if apply_mode else '[DRY-RUN]'} "
        "창고 박스 빈 컨테이너 정리\n"
    )
    db = SessionLocal()
    try:
        report = reconcile_inventory(db)
        if report["ledger_mismatch_count"]:
            mismatches = [
                row
                for row in report["rows"]
                if row["ledger_status"] != "ok"
            ]
            for row in mismatches[:20]:
                print(
                    f"  원장 불일치: {row['mes_code'] or row['item_id']} "
                    f"W={row['warehouse_qty']} B={row['box_total']} "
                    f"Z={row['zone_total']} U={row['unplaced_total']}"
                )
            raise RuntimeError(
                "W=B+Z+U 위반은 자동 수정할 수 없습니다: "
                f"{report['ledger_mismatch_count']}개 품목"
            )

        empty_boxes = (
            db.query(WarehouseBox)
            .outerjoin(
                WarehouseBoxItem,
                WarehouseBoxItem.box_id == WarehouseBox.box_id,
            )
            .filter(WarehouseBoxItem.id.is_(None))
            .order_by(WarehouseBox.box_id)
            .all()
        )
        if apply_mode:
            for box in empty_boxes:
                db.delete(box)
            db.commit()
            print(f"\n완료: 빈 박스 {len(empty_boxes)}개 삭제, 원장 대조 통과")
        else:
            db.rollback()
            print(f"\n[DRY-RUN] 빈 박스 {len(empty_boxes)}개 삭제 예정")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
