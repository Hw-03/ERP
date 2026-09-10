#!/usr/bin/env python3
"""Check DEXCOWIN MES inventory integrity without starting the server.

Exit codes:
    0 = pass or warning-only
    1 = blocking data violation
    2 = CLI usage or configuration error
    3 = database, schema, or tool error
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator
from urllib.parse import quote

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.exc import ArgumentError
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.services.inventory_integrity import diagnose_inventory_integrity  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")


class ConfigurationError(ValueError):
    """The requested database URL cannot be used by this checker."""


class DatabaseCheckError(RuntimeError):
    """The checker cannot safely open or inspect the requested database."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check DEXCOWIN MES inventory integrity")
    parser.add_argument("--db-url", default=None, help="SQLAlchemy database URL")
    parser.add_argument(
        "--json",
        action="store_true",
        dest="as_json",
        help="Print only the stable inventory-integrity/v1 JSON payload",
    )
    return parser.parse_args()


def database_url(args: argparse.Namespace) -> str:
    if args.db_url is not None:
        return str(args.db_url)
    return (
        os.getenv("DATABASE_URL")
        or f"sqlite:///{(BACKEND_DIR / 'mes.db').as_posix()}"
    )


def _sqlite_path(database: str | None) -> Path:
    if not database or database == ":memory:":
        raise ConfigurationError("SQLite 검사는 기존 파일 경로가 필요합니다.")
    path = Path(database)
    if not path.is_absolute():
        path = (Path.cwd() / path).resolve()
    if not path.is_file():
        raise DatabaseCheckError("SQLite 데이터베이스 파일을 열 수 없습니다.")
    return path


def _sqlite_engine(path: Path) -> Engine:
    uri = f"file:{quote(path.as_posix(), safe='/:')}?mode=ro"

    def connect_read_only() -> sqlite3.Connection:
        return sqlite3.connect(uri, uri=True, check_same_thread=False)

    return create_engine("sqlite://", creator=connect_read_only, poolclass=NullPool)


def _engine_for_url(raw_url: str) -> tuple[Engine, str]:
    try:
        parsed = make_url(raw_url)
    except ArgumentError as exc:
        raise ConfigurationError("데이터베이스 URL 형식이 올바르지 않습니다.") from exc
    backend = parsed.get_backend_name()
    if backend == "sqlite":
        return _sqlite_engine(_sqlite_path(parsed.database)), backend
    if backend == "postgresql":
        return create_engine(parsed, poolclass=NullPool), backend
    raise ConfigurationError("지원하지 않는 데이터베이스 종류입니다.")


@contextmanager
def _diagnostic_session(engine: Engine, backend: str) -> Iterator[Session]:
    """Yield one read-only snapshot transaction and always roll it back."""
    connection = engine.connect()
    if backend == "postgresql":
        connection = connection.execution_options(isolation_level="REPEATABLE READ")
    session = Session(bind=connection, autoflush=False, expire_on_commit=False)
    try:
        if backend == "postgresql":
            session.execute(text("SET TRANSACTION READ ONLY"))
        else:
            session.execute(text("PRAGMA query_only = ON"))
            session.execute(text("BEGIN"))
        yield session
    finally:
        session.rollback()
        session.close()
        connection.close()


def _print_text(payload: dict[str, object]) -> None:
    print("DEXCOWIN MES inventory integrity check")
    checks = payload["checks"]
    assert isinstance(checks, list)
    for check in checks:
        assert isinstance(check, dict)
        count = int(check["count"])
        severity = check["severity"]
        prefix = "PASS" if count == 0 else "WARN" if severity == "warning" else "FAIL"
        print(f"{prefix} {check['check_id']}: {count}")
        samples = check["samples"]
        assert isinstance(samples, list)
        for sample in samples:
            print(f"  {json.dumps(sample, ensure_ascii=False, sort_keys=True)}")
    print(
        f"RESULT {payload['status']}: blocking={payload['blocking_count']} "
        f"warning={payload['warning_count']}"
    )


def main() -> int:
    args = parse_args()
    engine: Engine | None = None
    try:
        engine, backend = _engine_for_url(database_url(args))
        with _diagnostic_session(engine, backend) as db:
            payload = diagnose_inventory_integrity(db).contract_payload()
    except ConfigurationError:
        print("configuration error: database configuration is not supported", file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001 — CLI tool failures share exit code 3
        print(f"database check error: {type(exc).__name__}", file=sys.stderr)
        return 3
    finally:
        if engine is not None:
            engine.dispose()

    if args.as_json:
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    else:
        _print_text(payload)
    return 1 if int(payload["blocking_count"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
