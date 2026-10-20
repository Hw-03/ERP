"""명시한 DB의 기존 draft만 작업 예약으로 전환한다. 기본 실행은 쓰기 없는 dry-run이다.

예: python backend/scripts/backfill_work_reservations.py --db-path C:/copies/mes.db
실제 반영: 같은 명령에 --apply 추가. 서버 시작이나 GET에서는 호출하지 않는다.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sqlite3
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def main(argv: list[str] | None = None) -> int:
    """Require an explicit existing DB path; only --apply permits reservation writes."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db-path", type=Path, required=True, help="검사할 기존 SQLite DB의 명시적 경로")
    parser.add_argument("--apply", action="store_true", help="예약·버전·감사 이벤트 변경을 작업별 commit")
    args = parser.parse_args(argv)
    path = args.db_path.expanduser().resolve()
    if not path.is_file():
        parser.error(f"기존 DB 파일을 찾을 수 없습니다: {path}")

    from sqlalchemy import create_engine, event
    from sqlalchemy.orm import Session
    from app.database import _create_database_engine
    from app.services.work_reservation_backfill import backfill_work_reservations

    print(f"DB: {path}")
    print("apply: 작업별 예약 원장·pending·상태·버전·감사 이벤트를 변경합니다. 실재고와 입출고 로그는 변경하지 않습니다."
          if args.apply else "dry-run: DB를 변경하지 않고 오래된 작업부터 가상 예약을 계산합니다.")
    if args.apply:
        engine = _create_database_engine(f"sqlite:///{path.as_posix()}")
    else:
        # mode=ro prevents even journal-mode changes while inspecting a legacy DB.
        engine = create_engine("sqlite://", creator=lambda: sqlite3.connect(path.as_uri() + "?mode=ro", uri=True))

        @event.listens_for(engine, "connect")
        def read_only_connection(connection: sqlite3.Connection, _record: object) -> None:
            """Do not upgrade journal mode or initialize missing application data."""
            connection.isolation_level = None
            connection.execute("PRAGMA query_only=ON")

        @event.listens_for(engine, "begin")
        def read_transaction(connection: object) -> None:
            """Keep the entire dry run on one stable read snapshot."""
            connection.exec_driver_sql("BEGIN")

    try:
        with Session(engine, autoflush=False) as db:
            report = backfill_work_reservations(db, apply=args.apply)
            for row in report:
                print(json.dumps(row, ensure_ascii=False))
        return 1 if any(row["status"] == "error" for row in report) else 0
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
