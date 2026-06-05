"""미완료 배치 정리 스크립트.

draft / submitted / reserved 상태의 io_batches 행만 삭제한다.
completed / cancelled / rejected / failed 는 보존.

삭제 순서 (FK 안전):
    io_lines → io_bundles → io_batches (WHERE status IN ...)
    transaction_logs.operation_batch_id 는 SET NULL (ondelete 자동).

사용:
    python backend/scripts/clear_pending_batches.py --dry-run
    python backend/scripts/clear_pending_batches.py --yes
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal  # noqa: E402
from app.models import IoBatch, IoBundle, IoLine  # noqa: E402

PENDING_STATUSES = ("draft", "submitted", "reserved")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dry-run", action="store_true", help="commit 없이 카운트만 출력")
    p.add_argument("--yes", action="store_true", help="확인 프롬프트 스킵")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    db = SessionLocal()
    try:
        pending_batches = (
            db.query(IoBatch).filter(IoBatch.status.in_(PENDING_STATUSES)).all()
        )
        batch_ids = [b.batch_id for b in pending_batches]

        bundle_count = (
            db.query(IoBundle).filter(IoBundle.batch_id.in_(batch_ids)).count()
            if batch_ids else 0
        )
        line_count = (
            db.query(IoLine)
            .join(IoBundle, IoLine.bundle_id == IoBundle.bundle_id)
            .filter(IoBundle.batch_id.in_(batch_ids))
            .count()
            if batch_ids else 0
        )

        print("=" * 60)
        print("삭제 대상 (미완료 배치)")
        print("=" * 60)
        for status in PENDING_STATUSES:
            cnt = sum(1 for b in pending_batches if b.status == status)
            print(f"  {status:<12}: {cnt} 배치")
        print(f"  {'합계':<12}: {len(batch_ids)} 배치 / {bundle_count} 번들 / {line_count} 라인")
        print("=" * 60)

        if not batch_ids:
            print("삭제할 미완료 배치가 없습니다.")
            return 0

        if not args.yes and not args.dry_run:
            ans = input("진행할까요? (yes/no): ").strip().lower()
            if ans not in ("y", "yes"):
                print("취소.")
                return 1

        if batch_ids:
            # io_lines → io_bundles → io_batches 순서로 삭제
            bundle_ids = [b.bundle_id for b in db.query(IoBundle).filter(IoBundle.batch_id.in_(batch_ids)).all()]
            if bundle_ids:
                db.query(IoLine).filter(IoLine.bundle_id.in_(bundle_ids)).delete(synchronize_session=False)
            db.query(IoBundle).filter(IoBundle.batch_id.in_(batch_ids)).delete(synchronize_session=False)
            db.query(IoBatch).filter(IoBatch.batch_id.in_(batch_ids)).delete(synchronize_session=False)

        if args.dry_run:
            db.rollback()
            print("[dry-run] 롤백 완료. 실제 변경 없음.")
        else:
            db.commit()
            print("[commit] 미완료 배치가 삭제됐습니다.")

        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
