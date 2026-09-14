"""테스트용 재고/입출고 리셋 스크립트.

품목 마스터(Item), 직원, 공정, BOM 같은 참조 데이터는 보존하고
다음만 초기화한다:

- transaction_logs / transaction_edit_logs : 입출고 내역
- io_batches / io_bundles / io_lines       : 입출고 2.0 배치
- inventory_locations                       : 부서×상태별 재고 분포
- inventory                                 : 수치(quantity/warehouse_qty/pending_quantity) 0으로 리셋

그 후 품목 코드의 process_type_code 를 보고:
- R 시리즈(TR/HR/VR/NR/AR/PR) → 창고에 100~200 랜덤
- A/F 시리즈(?A, ?F)        → 매핑된 부서의 InventoryLocation(PRODUCTION) 에 0~300 랜덤

사용:
    python backend/scripts/reset_test_stock.py --dry-run
    python backend/scripts/reset_test_stock.py --yes
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
    Inventory,
    InventoryLocation,
    IoBatch,
    IoBundle,
    IoLine,
    Item,
    LocationStatusEnum,
    StockRequest,
    StockRequestStatusEnum,
    TransactionEditLog,
    TransactionLog,
)
from app.services.inventory import PROCESS_TYPE_TO_DEPT  # noqa: E402
from app.services.sr_approval import cancel_open_stock_requests  # noqa: E402


R_CODES = {"TR", "HR", "VR", "NR", "AR", "PR"}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dry-run", action="store_true", help="commit 없이 카운트만 출력")
    p.add_argument("--yes", action="store_true", help="확인 프롬프트 스킵")
    p.add_argument("--seed", type=int, default=None, help="랜덤 seed (재현용)")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if args.seed is not None:
        random.seed(args.seed)

    db = SessionLocal()
    try:
        tx_count = db.query(TransactionLog).count()
        edit_count = db.query(TransactionEditLog).count()
        batch_count = db.query(IoBatch).count()
        loc_count = db.query(InventoryLocation).count()
        inv_count = db.query(Inventory).count()
        item_count = db.query(Item).count()

        print("=" * 60)
        print("초기화 대상 현재 상태")
        print("=" * 60)
        print(f"  transaction_logs      : {tx_count}")
        print(f"  transaction_edit_logs : {edit_count}")
        print(f"  io_batches            : {batch_count}")
        print(f"  inventory_locations   : {loc_count}")
        print(f"  inventory (UPDATE)    : {inv_count}")
        print(f"  items (보존)          : {item_count}")
        print("=" * 60)

        if not args.yes and not args.dry_run:
            ans = input("진행할까요? (yes/no): ").strip().lower()
            if ans not in ("y", "yes"):
                print("취소.")
                return 1

        # 0. 미결 stock_request 정리 — inventory pending 리셋 전에 먼저 취소해야
        #    "요청은 있는데 예약 장부는 0"인 고아 상태가 생기지 않는다.
        cancelled = cancel_open_stock_requests(db, reason="재고 리셋(reset_test_stock) 전 자동 취소")
        if cancelled:
            print(f"  미결 요청 자동 취소       : {cancelled} 건")
        db.flush()

        # 가드: cancel 이 조용히 실패해 미결 요청이 남으면 pending 리셋을 중단(예약 고아 방지).
        open_left = (
            db.query(StockRequest)
            .filter(StockRequest.status.in_(
                [StockRequestStatusEnum.RESERVED, StockRequestStatusEnum.SUBMITTED]
            ))
            .count()
        )
        if open_left:
            raise SystemExit(
                f"미결 RESERVED/SUBMITTED 요청 {open_left}건이 남아 재고 리셋을 중단합니다. (예약 고아 방지)"
            )

        # 1. 입출고 내역 / 배치 삭제 (FK 안전 순서)
        db.query(TransactionEditLog).delete(synchronize_session=False)
        db.query(TransactionLog).delete(synchronize_session=False)
        db.query(IoLine).delete(synchronize_session=False)
        db.query(IoBundle).delete(synchronize_session=False)
        db.query(IoBatch).delete(synchronize_session=False)

        # 2. 위치 재고 삭제
        db.query(InventoryLocation).delete(synchronize_session=False)

        # 3. inventory 수치 모두 0 (check 제약 warehouse>=pending 위해 pending 함께 0)
        db.query(Inventory).update(
            {
                Inventory.pending_quantity: Decimal("0"),
                Inventory.warehouse_qty: Decimal("0"),
                Inventory.quantity: Decimal("0"),
            },
            synchronize_session=False,
        )
        db.flush()

        # 4. 품목 순회: 코드 기반 랜덤 재고 채움
        items = db.query(Item).all()
        r_count = af_count = no_code_skip = unmapped_skip = 0
        skipped_codes: dict[str, int] = {}

        for item in items:
            code = (item.process_type_code or "").upper()
            if not code:
                no_code_skip += 1
                continue

            inv = db.query(Inventory).filter(Inventory.item_id == item.item_id).first()
            if inv is None:
                inv = Inventory(
                    item_id=item.item_id,
                    quantity=Decimal("0"),
                    warehouse_qty=Decimal("0"),
                    pending_quantity=Decimal("0"),
                )
                db.add(inv)
                db.flush()

            if code in R_CODES:
                qty = Decimal(random.randint(100, 200))
                inv.warehouse_qty = qty
                inv.quantity = qty
                r_count += 1
                continue

            dept = PROCESS_TYPE_TO_DEPT.get(code)
            if dept is None:
                unmapped_skip += 1
                skipped_codes[code] = skipped_codes.get(code, 0) + 1
                continue

            qty = Decimal(random.randint(0, 300))
            loc = InventoryLocation(
                item_id=item.item_id,
                department=dept.value,
                status=LocationStatusEnum.PRODUCTION,
                quantity=qty,
            )
            db.add(loc)
            inv.quantity = qty
            af_count += 1

        print()
        print("=" * 60)
        print("재고 재배치 결과")
        print("=" * 60)
        print(f"  R 시리즈(창고 100~200)  : {r_count}")
        print(f"  A/F 시리즈(부서 0~300)  : {af_count}")
        print(f"  코드 없음 스킵           : {no_code_skip}")
        print(f"  매핑 외 코드 스킵         : {unmapped_skip} {skipped_codes if skipped_codes else ''}")
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
