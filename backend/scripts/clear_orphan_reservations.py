"""고아 예약 정리 스크립트 — 일회성.

재고 리셋/재적재 후 pending이 소멸됐는데 RESERVED/SUBMITTED 상태로 남아있는
미결 stock_request를 CANCELLED로 일괄 전이한다.

사용:
    python backend/scripts/clear_orphan_reservations.py --dry-run
    python backend/scripts/clear_orphan_reservations.py --yes
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal  # noqa: E402
from app.models import StockRequest, StockRequestStatusEnum  # noqa: E402
from app.services.sr_approval import cancel_open_stock_requests  # noqa: E402


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dry-run", action="store_true", help="commit 없이 대상만 출력")
    p.add_argument("--yes", action="store_true", help="확인 프롬프트 스킵")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    db = SessionLocal()
    try:
        open_statuses = (StockRequestStatusEnum.RESERVED, StockRequestStatusEnum.SUBMITTED)
        targets = (
            db.query(StockRequest)
            .filter(StockRequest.status.in_(open_statuses))
            .order_by(StockRequest.created_at.desc())
            .all()
        )

        print("=" * 60)
        print("고아 예약 정리 대상 현재 상태")
        print("=" * 60)
        print(f"  RESERVED/SUBMITTED 미결 요청 : {len(targets)} 건")
        if targets:
            print()
            print("  요청코드                           상태       생성일")
            print("  " + "-" * 54)
            for req in targets:
                print(f"  {req.request_code:<36} {req.status.value:<10} {str(req.created_at)[:10]}")
        print("=" * 60)

        if not targets:
            print("정리할 미결 요청이 없습니다.")
            return 0

        if args.dry_run:
            db.rollback()
            print("[dry-run] 롤백 완료. 실제 변경 없음.")
            return 0

        if not args.yes:
            ans = input("위 요청을 모두 CANCELLED 처리할까요? (yes/no): ").strip().lower()
            if ans not in ("y", "yes"):
                print("취소.")
                return 1

        count = cancel_open_stock_requests(db, reason="고아 예약 정리 (일회성)")
        db.commit()
        print(f"[commit] {count}건을 CANCELLED 처리했습니다.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
