"""Offline SQLite sandbox cutover. Defaults to read-only; never migrates or seeds a DB."""
from __future__ import annotations

import argparse
from getpass import getpass
import json
import os
from pathlib import Path
import sqlite3
import sys
import uuid

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

BACKEND = Path(__file__).resolve().parents[2] / "backend"
FORBIDDEN_ROOTS = (Path(r"C:\ERP"), Path(r"C:\ERP-dev"), BACKEND.parent)
sys.path.insert(0, str(BACKEND))


def sandbox_path(path: Path, root: Path) -> Path:
    """Resolve symlinks before requiring an explicit external sandbox boundary."""
    resolved, boundary = path.resolve(), root.resolve()
    if not resolved.is_relative_to(boundary) or resolved == boundary:
        raise ValueError("DB/증빙 경로가 지정한 격리 디렉터리 밖입니다.")
    if any(resolved.is_relative_to(forbidden.resolve()) for forbidden in FORBIDDEN_ROOTS):
        raise ValueError("기존 프로젝트 또는 워크트리 안의 DB는 전환할 수 없습니다.")
    return resolved


def backup_copy(source: Path, target: Path) -> None:
    """SQLite-consistent snapshot into a new file; existing evidence is never replaced."""
    with target.open("xb"):
        pass
    reader = sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)
    writer = sqlite3.connect(target)
    try:
        reader.execute("PRAGMA query_only=ON")
        reader.backup(writer)
        if writer.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
            raise ValueError("복사본 무결성 검사 실패")
    finally:
        writer.close()
        reader.close()


def database_engine(path: Path, *, writable: bool) -> Engine:
    """Open an existing file only; SQLite write lock precedes every cutover SELECT."""
    mode = "rw" if writable else "ro"
    engine = create_engine("sqlite://", creator=lambda: sqlite3.connect(
        path.as_uri() + f"?mode={mode}", uri=True), poolclass=NullPool)

    @event.listens_for(engine, "connect")
    def configure(connection, _record) -> None:
        connection.isolation_level = None
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=2000")
        if not writable:
            connection.execute("PRAGMA query_only=ON")

    @event.listens_for(engine, "begin")
    def begin(connection) -> None:
        connection.exec_driver_sql("BEGIN IMMEDIATE" if writable else "BEGIN")

    return engine


def verify_apply_pin(db: Session) -> None:
    """Read a fresh credential privately without changing settings or writing it to evidence."""
    from app.routers.settings import require_admin_readonly

    require_admin_readonly(db, getpass("관리자 PIN: "))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--action", choices=("check", "apply", "receipt", "copy"), default="check")
    parser.add_argument("--sandbox-root", type=Path, required=True)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--backup", type=Path)
    parser.add_argument("--copy-to", type=Path)
    parser.add_argument("--cutover-id", type=uuid.UUID)
    parser.add_argument("--actor-id", type=uuid.UUID)
    parser.add_argument("--expected-fingerprint")
    parser.add_argument("--writers-stopped", action="store_true")
    args = parser.parse_args()
    path = sandbox_path(args.database, args.sandbox_root)
    output = sandbox_path(args.output, args.sandbox_root)
    if not path.is_file() or output.exists():
        raise ValueError("기존 DB 파일과 새 증빙 경로가 필요합니다.")
    if os.getenv("APP_ENV", "").lower() == "production" or os.getenv("REQUIRE_POSTGRES") == "1":
        raise ValueError("운영 실행 설정에서는 격리 전환 도구를 사용할 수 없습니다.")
    if args.action == "copy":
        if args.copy_to is None:
            raise ValueError("새 복사본 경로가 필요합니다.")
        target = sandbox_path(args.copy_to, args.sandbox_root)
        backup_copy(path, target)
        result = {"source": str(path), "copy": str(target)}
    else:
        # No app default engine is connected; services use the explicitly bound session below.
        os.environ["DATABASE_URL"] = "sqlite:///:memory:"
        from app.models import DefectPoolCutover
        from app.services import pool_cutover
        from bootstrap.schema import check_schema

        engine = database_engine(path, writable=args.action == "apply")
        try:
            state = check_schema(engine=engine)
            if not state.ready:
                raise ValueError("DB 스키마 준비 상태를 확인할 수 없습니다.")
            if args.action == "apply":
                if not (args.writers_stopped and args.backup and args.cutover_id and args.actor_id and args.expected_fingerprint):
                    raise ValueError("쓰기 중단·백업·전환 ID·부서 결재자 ID·사전검사 지문이 모두 필요합니다.")
                backup_copy(path, sandbox_path(args.backup, args.sandbox_root))
            with Session(engine, autoflush=False, expire_on_commit=False) as db:
                if args.action == "check":
                    result = pool_cutover.preflight(db)
                elif args.action == "receipt":
                    row = db.get(DefectPoolCutover, args.cutover_id) if args.cutover_id else db.query(DefectPoolCutover).one_or_none()
                    if row is None:
                        raise ValueError("완료된 전환 영수증이 없습니다.")
                    result = pool_cutover.receipt(db, row)
                else:
                    verify_apply_pin(db)
                    result = pool_cutover.apply_cutover(db, cutover_id=args.cutover_id,
                        expected_fingerprint=args.expected_fingerprint, actor_id=args.actor_id)
        finally:
            engine.dispose()
    with output.open("x", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, default=str, indent=2)
    print(json.dumps({"action": args.action, "output": str(output),
        "blocking": len(result.get("blocking", [])), "warnings": len(result.get("warnings", [])),
        "cutover_id": result.get("cutover_id")}, ensure_ascii=False))
    if result.get("blocking"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
