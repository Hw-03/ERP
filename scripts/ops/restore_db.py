#!/usr/bin/env python3
"""DB 복구 유틸리티.

사용법:
    # SQLite 파일 복구
    python scripts/ops/restore_db.py --sqlite outputs/backups/erp_20260508_120000.db --target backend/erp.db

    # PostgreSQL 덤프 복구 (Docker 컨테이너 기준)
    python scripts/ops/restore_db.py --postgres outputs/backups/erp_20260508_120000.sql --container <container>

    # 복구 후 무결성 자동 점검 (--check 플래그)
    python scripts/ops/restore_db.py --sqlite ... --check

주의:
    - 복구 전 현재 DB를 자동으로 .pre-restore 백업합니다.
    - PostgreSQL 복구는 기존 DB를 DROP → CREATE → psql import 합니다.
"""

import argparse
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path


BACKUP_DIR = Path(__file__).resolve().parents[2] / "outputs" / "backups"
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def restore_sqlite(backup_path: str, target_path: str, run_check: bool) -> None:
    src = Path(backup_path).resolve()
    dst = Path(target_path).resolve()

    if not src.exists():
        print(f"❌ 백업 파일 없음: {src}")
        sys.exit(1)

    if dst.exists():
        pre_restore = dst.with_suffix(f".pre-restore.{datetime.now().strftime('%Y%m%d_%H%M%S')}.db")
        shutil.copy2(dst, pre_restore)
        print(f"  현재 DB 백업: {pre_restore}")

    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    size_kb = dst.stat().st_size // 1024
    print(f"✅ SQLite 복구 완료: {src.name} → {dst} ({size_kb} KB)")

    if run_check:
        _run_integrity_check(db_url=f"sqlite:///{dst}")


def restore_postgres(
    backup_path: str,
    container: str | None,
    host: str,
    port: int,
    user: str,
    dbname: str,
    run_check: bool,
) -> None:
    src = Path(backup_path).resolve()
    if not src.exists():
        print(f"❌ 백업 파일 없음: {src}")
        sys.exit(1)

    print(f"  복구 파일: {src} ({src.stat().st_size // 1024} KB)")
    print("  ⚠️  기존 DB를 DROP 후 재생성합니다. 계속하려면 Enter를 누르세요 (Ctrl+C로 취소).")
    try:
        input()
    except KeyboardInterrupt:
        print("\n취소됨.")
        sys.exit(0)

    def pg_exec(cmd: list[str]) -> None:
        print(f"  실행: {' '.join(cmd)}")
        try:
            subprocess.run(cmd, check=True)
        except subprocess.CalledProcessError as e:
            print(f"❌ 명령 실패: {e}")
            sys.exit(1)
        except FileNotFoundError:
            print("❌ docker 또는 psql/pg_dump 명령을 찾을 수 없습니다.")
            sys.exit(1)

    if container:
        # 컨테이너 내부에 파일 복사 후 실행
        tmp = f"/tmp/restore_{datetime.now().strftime('%Y%m%d%H%M%S')}.sql"
        pg_exec(["docker", "cp", str(src), f"{container}:{tmp}"])
        pg_exec(["docker", "exec", container, "dropdb", "-U", user, "--if-exists", dbname])
        pg_exec(["docker", "exec", container, "createdb", "-U", user, dbname])
        pg_exec(["docker", "exec", container, "psql", "-U", user, "-d", dbname, "-f", tmp])
    else:
        pg_exec(["dropdb", "-h", host, "-p", str(port), "-U", user, "--if-exists", dbname])
        pg_exec(["createdb", "-h", host, "-p", str(port), "-U", user, dbname])
        with open(src, "r", encoding="utf-8") as f:
            result = subprocess.run(
                ["psql", "-h", host, "-p", str(port), "-U", user, "-d", dbname],
                stdin=f, check=True,
            )

    print(f"✅ PostgreSQL 복구 완료: {src.name} → {dbname}")

    if run_check:
        pg_url = f"postgresql://{user}@{host}:{port}/{dbname}"
        _run_integrity_check(db_url=pg_url)


def _run_integrity_check(db_url: str) -> None:
    check_script = PROJECT_ROOT / "scripts" / "ops" / "check_inventory_integrity.py"
    if not check_script.exists():
        print("⚠️  check_inventory_integrity.py 없음 — 무결성 점검 생략")
        return
    print("\n  무결성 점검 실행 중...")
    result = subprocess.run(
        [sys.executable, str(check_script), "--db-url", db_url],
        capture_output=False,
    )
    if result.returncode != 0:
        print("⚠️  무결성 점검 이상 — 위 출력 확인 필요")
    else:
        print("✅ 무결성 점검 통과")


def parse_args():
    parser = argparse.ArgumentParser(description="DB 복구 유틸리티")
    parser.add_argument("--sqlite", metavar="BACKUP_PATH", help="SQLite 백업 파일 경로")
    parser.add_argument("--target", default="backend/erp.db", help="복구 대상 경로 (기본: backend/erp.db)")
    parser.add_argument("--postgres", metavar="BACKUP_SQL", help="PostgreSQL 덤프 파일 경로")
    parser.add_argument("--container", help="Docker 컨테이너 이름")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=5432)
    parser.add_argument("--user", default="erp_user")
    parser.add_argument("--dbname", default="erp_db")
    parser.add_argument("--check", action="store_true", help="복구 후 무결성 자동 점검")
    return parser.parse_args()


def main():
    args = parse_args()

    print("=" * 54)
    print("DEXCOWIN MES — DB 복구")
    print("=" * 54)

    if args.sqlite:
        restore_sqlite(args.sqlite, args.target, args.check)
    elif args.postgres:
        restore_postgres(
            args.postgres, args.container,
            args.host, args.port, args.user, args.dbname,
            args.check,
        )
    else:
        print("--sqlite <백업경로> 또는 --postgres <덤프파일> 을 지정하세요.")
        sys.exit(1)


if __name__ == "__main__":
    main()
