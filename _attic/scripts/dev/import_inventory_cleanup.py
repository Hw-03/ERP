"""
import_inventory_cleanup.py — CLI 래퍼.

핵심 로직은 backend/app/services/seed_cleanup.py 에 있음.

Usage:
    cd backend
    python ../scripts/dev/import_inventory_cleanup.py [--dry-run]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal
from app.services.seed_cleanup import run_cleanup_import, DEFAULT_EXCEL_PATH


def main(dry_run: bool = False) -> None:
    print(f"엑셀 경로: {DEFAULT_EXCEL_PATH}")
    db = SessionLocal()
    try:
        result = run_cleanup_import(db, dry_run=dry_run)
        print(f"rows: {result['rows']}, total_qty: {result['total_qty']}, ok: {result['ok']}")
        if result["errors"]:
            for e in result["errors"]:
                print(f"[경고] {e}")
        if dry_run:
            print("[dry-run] DB 변경 없이 종료.")
        else:
            print("[완료]" if result["ok"] else "[경고] 일부 검증 실패.")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="DB 변경 없이 파싱/검증만 실행")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
