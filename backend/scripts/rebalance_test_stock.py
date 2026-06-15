"""테스트 재고 재분배 — R 시리즈 창고 보존 + 분포 보정.

reset_test_stock.py 로 1차 채워진 상태 위에서:

1. R 시리즈 (TR/HR/VR/NR/AR/PR) 의 창고 재고는 **보존**
2. R 시리즈에 품목코드 부서 매핑으로 InventoryLocation 추가
   - 부족 목표면 0~50
   - 정상 목표면 안전재고(200) 까지 채우고 추가 0~50
3. A/F 시리즈 (TA/HA/VA/NA/AA/PA, TF/HF/VF/NF/AF/PF) 는 분포 기반 재채움
   - 품절이면 location 없음
   - 정상이면 200~300
   - 부족이면 1~199
4. 전체 939품목 분포 보정 (기본):
   - 품절 100 (A/F 만 가능; R 은 창고가 100~200 보존되므로 품절 불가)
   - 정상 400 (총재고 >= min_stock(=200))
   - 부족 나머지 (0 < 총재고 < 200)

엣지: R 시리즈 중 창고가 우연히 200인 ~7개는 부족으로 뽑혀도 자동으로 정상이 됨
(창고 손대지 않는 제약 때문). 분포가 정상 쪽으로 ±소수 흔들릴 수 있음.

사용:
    python backend/scripts/rebalance_test_stock.py --dry-run
    python backend/scripts/rebalance_test_stock.py --yes
    python backend/scripts/rebalance_test_stock.py --yes --out 100 --normal 400
"""
from __future__ import annotations

import argparse
import random
import sys
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    DepartmentEnum,
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
)
from app.services.inventory import PROCESS_TYPE_TO_DEPT  # noqa: E402
from app.services.sr_approval import cancel_open_stock_requests  # noqa: E402


# R 시리즈는 PROCESS_TYPE_TO_DEPT 에 의도적으로 빠져 있다(원자재는 창고 폴백).
# 이 스크립트에서는 R 시리즈에도 부서 재고를 만들 거라 별도 매핑이 필요하다.
R_PREFIX_TO_DEPT: dict[str, DepartmentEnum] = {
    "TR": DepartmentEnum.TUBE,
    "HR": DepartmentEnum.HIGH_VOLTAGE,
    "VR": DepartmentEnum.VACUUM,
    "NR": DepartmentEnum.TUNING,
    "AR": DepartmentEnum.ASSEMBLY,
    "PR": DepartmentEnum.SHIPPING,
}
R_CODES = set(R_PREFIX_TO_DEPT.keys())

SAFETY_STOCK = 200  # 모든 item.min_stock 이 사실상 200 (NULL 2건 제외)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dry-run", action="store_true", help="commit 없이 결과만 출력")
    p.add_argument("--yes", action="store_true", help="확인 프롬프트 스킵")
    p.add_argument("--seed", type=int, default=None, help="랜덤 seed")
    p.add_argument("--out", type=int, default=100, help="품절 목표 (default 100)")
    p.add_argument("--normal", type=int, default=400, help="정상 목표 (default 400)")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if args.seed is not None:
        random.seed(args.seed)

    db = SessionLocal()
    try:
        items = db.query(Item).all()
        r_items: list[Item] = []
        af_items: list[Item] = []
        other_items: list[Item] = []
        for item in items:
            code = (item.process_type_code or "").upper()
            if code in R_CODES:
                r_items.append(item)
            elif code in PROCESS_TYPE_TO_DEPT:
                af_items.append(item)
            else:
                other_items.append(item)

        # 분포 결정
        if args.out > len(af_items):
            raise SystemExit(
                f"품절 목표 {args.out} > A/F 품목 수 {len(af_items)} — 줄여 주세요."
            )

        af_shuffled = af_items[:]
        random.shuffle(af_shuffled)
        out_items_list = af_shuffled[: args.out]
        out_set = {it.item_id for it in out_items_list}

        # 나머지(품절 제외) 풀에서 정상/부족 선출
        rest = [it for it in (r_items + af_items) if it.item_id not in out_set]
        random.shuffle(rest)
        if args.normal > len(rest):
            raise SystemExit(
                f"정상 목표 {args.normal} > 가용 품목 {len(rest)} — 줄여 주세요."
            )
        normal_set = {it.item_id for it in rest[: args.normal]}
        short_target = len(rest) - args.normal

        print("=" * 60)
        print("분포 목표")
        print("=" * 60)
        print(f"  품절   : {args.out}    (A/F 에서만 가능)")
        print(f"  정상   : {args.normal}")
        print(f"  부족   : {short_target}")
        print("-" * 60)
        print(f"  R 시리즈 (창고 보존, 부서 추가)   : {len(r_items)}")
        print(f"  A/F 시리즈 (재채움)               : {len(af_items)}")
        print(f"  기타 (코드 없음/매핑 외, 미터치) : {len(other_items)}")
        print("=" * 60)

        if not args.yes and not args.dry_run:
            ans = input("진행할까요? (yes/no): ").strip().lower()
            if ans not in ("y", "yes"):
                print("취소.")
                return 1

        # 0. 미결 stock_request 정리 — pending 리셋 전에 먼저 취소
        cancelled = cancel_open_stock_requests(db, reason="재고 재분배(rebalance_test_stock) 전 자동 취소")
        if cancelled:
            print(f"  미결 요청 자동 취소       : {cancelled} 건")
        db.flush()

        # 1) 모든 inventory_locations 삭제
        db.query(InventoryLocation).delete(synchronize_session=False)
        db.flush()

        # 2) inv 수치 정리 — R 은 quantity=warehouse, A/F 는 모든 수치 0
        for it in r_items:
            inv = db.query(Inventory).filter_by(item_id=it.item_id).first()
            if inv is None:
                continue
            inv.pending_quantity = Decimal("0")
            inv.quantity = inv.warehouse_qty  # location 0
        for it in af_items:
            inv = db.query(Inventory).filter_by(item_id=it.item_id).first()
            if inv is None:
                continue
            inv.pending_quantity = Decimal("0")
            inv.warehouse_qty = Decimal("0")
            inv.quantity = Decimal("0")
        db.flush()

        # 3) R 시리즈 처리: 창고 보존 + 부서 추가
        r_normal = r_short = r_forced_normal = 0
        for item in r_items:
            code = (item.process_type_code or "").upper()
            dept = R_PREFIX_TO_DEPT[code]
            inv = db.query(Inventory).filter_by(item_id=item.item_id).first()
            if inv is None:
                continue
            warehouse = int(inv.warehouse_qty)

            wants_normal = item.item_id in normal_set
            if wants_normal:
                if warehouse >= SAFETY_STOCK:
                    qty = random.randint(0, 50)
                else:
                    qty = (SAFETY_STOCK - warehouse) + random.randint(0, 50)
                r_normal += 1
            else:
                # 부족 목표
                if warehouse >= SAFETY_STOCK:
                    # 창고만으로 정상. 창고 못 건드리므로 정상 강제.
                    qty = random.randint(0, 50)
                    r_forced_normal += 1
                else:
                    cap = min(50, SAFETY_STOCK - 1 - warehouse)
                    qty = random.randint(0, cap)
                    r_short += 1

            if qty > 0:
                db.add(
                    InventoryLocation(
                        item_id=item.item_id,
                        department=dept.value,
                        status=LocationStatusEnum.PRODUCTION,
                        quantity=Decimal(qty),
                    )
                )
            inv.quantity = inv.warehouse_qty + Decimal(qty)

        # 4) A/F 시리즈 처리: 분포 기반 재채움
        af_out = af_normal = af_short = 0
        for item in af_items:
            code = (item.process_type_code or "").upper()
            dept = PROCESS_TYPE_TO_DEPT[code]
            inv = db.query(Inventory).filter_by(item_id=item.item_id).first()
            if inv is None:
                continue

            if item.item_id in out_set:
                af_out += 1
                continue  # location 안 만듦, quantity 0 그대로

            if item.item_id in normal_set:
                qty = random.randint(SAFETY_STOCK, 300)
                af_normal += 1
            else:
                qty = random.randint(1, SAFETY_STOCK - 1)  # 1~199
                af_short += 1

            db.add(
                InventoryLocation(
                    item_id=item.item_id,
                    department=dept.value,
                    status=LocationStatusEnum.PRODUCTION,
                    quantity=Decimal(qty),
                )
            )
            inv.quantity = Decimal(qty)

        db.flush()

        print()
        print("=" * 60)
        print("실 처리 결과")
        print("=" * 60)
        print(f"  R 정상     : {r_normal}")
        print(f"  R 부족     : {r_short}")
        print(f"  R 정상강제 : {r_forced_normal}  (창고가 이미 200 이상이라 부족 불가)")
        print(f"  A/F 품절   : {af_out}")
        print(f"  A/F 정상   : {af_normal}")
        print(f"  A/F 부족   : {af_short}")
        print("-" * 60)
        print(f"  품절 합계  : {af_out}                 (목표 {args.out})")
        print(f"  정상 합계  : {r_normal + r_forced_normal + af_normal}  (목표 {args.normal})")
        print(f"  부족 합계  : {r_short + af_short}     (목표 {short_target})")
        print("=" * 60)

        if args.dry_run:
            db.rollback()
            print("[dry-run] 롤백 완료. 실제 변경 없음.")
        else:
            db.commit()
            print("[commit] 변경 사항이 DB 에 반영됐습니다.")

        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
