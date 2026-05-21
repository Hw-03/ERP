#!/usr/bin/env python3
"""DB 백업 유틸리티.

사용법:
    # SQLite 직접 파일 백업
    python scripts/ops/backup_db.py --sqlite backend/mes.db

    # PostgreSQL (Docker 컨테이너 기준)
    python scripts/ops/backup_db.py --postgres --container <container_name>
    python scripts/ops/backup_db.py --postgres --host localhost --port 5432 --user erp_user --dbname erp_db

결과:
    outputs/backups/mes_YYYYMMDD_HHMMSS.db   (SQLite)
    outputs/backups/mes_YYYYMMDD_HHMMSS.sql  (PostgreSQL)
"""

import argparse
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path


OUTPUT_DIR = Path(__file__).resolve().parents[2] / "outputs" / "backups"


def backup_sqlite(db_path: str) -> None:
    src = Path(db_path).resolve()
    if not src.exists():
        print(f"❌ SQLite 파일 없음: {src}")
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dst = OUTPUT_DIR / f"mes_{ts}.db"
    shutil.copy2(src, dst)
    size_kb = dst.stat().st_size // 1024
    print(f"✅ SQLite 백업 완료: {dst} ({size_kb} KB)")


def backup_postgres(container: str | None, host: str, port: int, user: str, dbname: str) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dst = OUTPUT_DIR / f"mes_{ts}.sql"

    if container:
        cmd = [
            "docker", "exec", container,
            "pg_dump", "-U", user, dbname,
        ]
    else:
        cmd = [
            "pg_dump",
            "-h", host, "-p", str(port),
            "-U", user, dbname,
        ]

    print(f"  실행: {' '.join(cmd)}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        dst.write_text(result.stdout, encoding="utf-8")
        size_kb = dst.stat().st_size // 1024
        print(f"✅ PostgreSQL 백업 완료: {dst} ({size_kb} KB)")
    except subprocess.CalledProcessError as e:
        print(f"❌ pg_dump 실패:\n{e.stderr}")
        sys.exit(1)
    except FileNotFoundError:
        print("❌ docker 또는 pg_dump 명령을 찾을 수 없습니다.")
        sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="DB 백업 유틸리티")
    parser.add_argument("--sqlite", metavar="PATH", help="SQLite DB 파일 경로")
    parser.add_argument("--postgres", action="store_true", help="PostgreSQL 백업")
    parser.add_argument("--container", help="Docker 컨테이너 이름 (PostgreSQL)")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=5432)
    parser.add_argument("--user", default="erp_user")
    parser.add_argument("--dbname", default="erp_db")
    return parser.parse_args()


def main():
    args = parse_args()

    print("=" * 50)
    print("DEXCOWIN MES — DB 백업")
    print("=" * 50)

    if args.sqlite:
        backup_sqlite(args.sqlite)
    elif args.postgres:
        backup_postgres(args.container, args.host, args.port, args.user, args.dbname)
    else:
        # 기본: backend/mes.db 존재하면 SQLite 백업
        default_path = Path(__file__).resolve().parents[2] / "backend" / "mes.db"
        if default_path.exists():
            backup_sqlite(str(default_path))
        else:
            print("--sqlite <경로> 또는 --postgres 를 지정하세요.")
            sys.exit(1)


if __name__ == "__main__":
    main()
