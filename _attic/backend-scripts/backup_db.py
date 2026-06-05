"""
SQLite DB 백업 스크립트.

기존 mes_backup_YYYYMMDD_HHMMSS.db 패턴을 유지한다.
30일 이상 된 백업 파일을 자동 정리하는 옵션을 제공한다.

사용법:
    python backup_db.py                    # 기본 백업
    python backup_db.py --label nightly    # mes_backup_nightly_20260514_020000.db
    python backup_db.py --keep-days 60     # 60일 이상 된 백업 정리 (기본 30)
    python backup_db.py --no-cleanup       # 오래된 백업 정리 안 함

cron 예시 (매일 새벽 2시):
    0 2 * * * cd /app && python backup_db.py --label nightly >> /var/log/backup.log 2>&1
"""

import argparse
import shutil
from datetime import datetime
from pathlib import Path


_ATTIC = Path(__file__).resolve().parents[1]
DB_SRC = _ATTIC.parent / "backend" / "mes.db"
BACKUP_DIR = _ATTIC / "data" / "db_backups"


def backup(label: str, keep_days: int, no_cleanup: bool) -> None:
    if not DB_SRC.exists():
        print(f"[오류] DB 파일을 찾을 수 없습니다: {DB_SRC}")
        return

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    suffix = f"_{label}" if label else ""
    dest = BACKUP_DIR / f"mes_backup{suffix}_{ts}.db"

    shutil.copy2(DB_SRC, dest)
    size_kb = dest.stat().st_size // 1024
    print(f"백업 완료: {dest.name} ({size_kb:,} KB)")

    if no_cleanup:
        return

    cutoff_ts = datetime.now().timestamp() - keep_days * 86400
    removed = 0
    for old in BACKUP_DIR.glob("mes_backup*.db"):
        if old == dest:
            continue
        if old.stat().st_mtime < cutoff_ts:
            old.unlink()
            removed += 1
            print(f"  오래된 백업 삭제: {old.name}")
    if removed:
        print(f"  총 {removed}개 삭제 ({keep_days}일 기준)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SQLite DB 백업")
    parser.add_argument("--label", default="", help="파일명에 추가할 레이블 (예: nightly)")
    parser.add_argument("--keep-days", type=int, default=30, help="백업 보관 일수 (기본 30)")
    parser.add_argument("--no-cleanup", action="store_true", help="오래된 백업 정리 안 함")
    args = parser.parse_args()
    backup(args.label, args.keep_days, args.no_cleanup)
