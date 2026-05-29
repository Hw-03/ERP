"""
거래 이력 아카이빙 스크립트.

6개월 이상 된 TransactionLog 레코드를 archived_at 필드로 마킹한다.
실제 삭제는 하지 않으므로 감사 목적으로 데이터는 보존된다.
API의 include_archived=false(기본값) 조건으로 일반 조회에서는 제외된다.

사용법:
    python archive_old_logs.py              # 6개월 이상, 실제 반영
    python archive_old_logs.py --months 12  # 12개월 이상
    python archive_old_logs.py --dry-run    # 대상 건수만 출력 (반영 안 함)
"""

import argparse
from datetime import datetime, timedelta

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app.database import SessionLocal
from app.models import TransactionLog


def archive(months: int, dry_run: bool) -> None:
    cutoff = datetime.utcnow() - timedelta(days=30 * months)
    db = SessionLocal()
    try:
        q = db.query(TransactionLog).filter(
            TransactionLog.created_at < cutoff,
            TransactionLog.archived_at.is_(None),
        )
        count = q.count()
        print(f"대상: {count:,}건 (기준일 이전: {cutoff.date()})")
        if dry_run:
            print("[dry-run] 실제 반영 없음. --dry-run 없이 재실행하면 마킹됩니다.")
            return
        now = datetime.utcnow()
        q.update({"archived_at": now}, synchronize_session=False)
        db.commit()
        print(f"완료: {count:,}건 archived_at={now.isoformat()[:19]} 마킹")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="거래 이력 아카이빙")
    parser.add_argument("--months", type=int, default=6, help="기준 개월 수 (기본 6)")
    parser.add_argument("--dry-run", action="store_true", help="대상 건수 확인만 (반영 안 함)")
    args = parser.parse_args()
    archive(args.months, args.dry_run)
