"""Run the fail-closed PostgreSQL concurrency evidence shared by local and CI."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool


BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_DB_ACK = "ALLOW_TEST_DB_MUTATION"
REQUIRED_TESTS = [
    "tests/ops/test_inventory_cutover_postgres_locking.py::test_postgres_cutover_lock_blocks_shipping_writer_until_rollback",
    "tests/services/test_warehouse_map_postgres_locking.py::test_postgres_head_public_tables_serialize_two_connections",
    "tests/services/test_warehouse_map_postgres_locking.py::test_postgres_concurrent_admin_moves_serialize_target_capacity_and_stack_order",
    "tests/services/test_warehouse_map_postgres_locking.py::test_postgres_outbound_blocks_actual_admin_move_until_commit",
]


class _NoSkipEvidence:
    skipped = 0

    def pytest_runtest_logreport(self, report: pytest.TestReport) -> None:
        if report.skipped:
            self.skipped += 1


def main() -> int:
    test_url = os.environ.get("TEST_POSTGRES_URL", "").strip()
    if not test_url:
        print("PostgreSQL concurrency: NOT_VERIFIED (TEST_POSTGRES_URL is not set).")
        return 3
    if os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK") != TEST_DB_ACK:
        print(f"DEXCOWIN_POSTGRES_TEST_ACK must equal {TEST_DB_ACK} before any test DB mutation.", file=sys.stderr)
        return 3
    try:
        parsed = make_url(test_url)
    except Exception as exc:
        print(f"Invalid TEST_POSTGRES_URL: {exc}", file=sys.stderr)
        return 3
    if not parsed.drivername.startswith("postgresql"):
        print("TEST_POSTGRES_URL must be PostgreSQL.", file=sys.stderr)
        return 3
    database_name = parsed.database or ""
    if not (database_name.startswith("test_") or database_name.endswith("_test")):
        print("TEST_POSTGRES_URL must use a dedicated test database name (test_* or *_test).", file=sys.stderr)
        return 3
    if os.environ.get("DATABASE_URL") != test_url:
        print("DATABASE_URL must exactly match TEST_POSTGRES_URL.", file=sys.stderr)
        return 3

    engine = create_engine(test_url, poolclass=NullPool)
    try:
        with engine.connect() as connection:
            actual_database = connection.execute(text("SELECT current_database()")).scalar_one()
    except Exception as exc:
        print(f"PostgreSQL test database identity check failed: {exc}", file=sys.stderr)
        return 3
    finally:
        engine.dispose()
    if actual_database != database_name:
        print(f"Connected database identity mismatch: URL={database_name} actual={actual_database}", file=sys.stderr)
        return 3

    check = subprocess.run(
        [sys.executable, "bootstrap_db.py", "--check"],
        cwd=BACKEND_DIR,
        check=False,
    )
    if check.returncode != 0:
        return check.returncode

    evidence = _NoSkipEvidence()
    result = pytest.main([*REQUIRED_TESTS, "-q", "-rs"], plugins=[evidence])
    if evidence.skipped:
        print(f"PostgreSQL concurrency evidence skipped {evidence.skipped} test(s).", file=sys.stderr)
        return 3
    return int(result)


if __name__ == "__main__":
    raise SystemExit(main())
