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
    "tests/migrations/test_cp4_integrity.py::test_postgresql_head_0031_downgrade_and_reupgrade",
    "tests/concurrency/test_operator_session_postgres.py::test_postgres_foreign_operator_preflight_stays_fail_closed_after_rotation",
    "tests/concurrency/test_operator_session_postgres.py::test_postgres_same_cookie_login_then_logout_leaves_no_reissued_session",
    "tests/concurrency/test_operator_session_postgres.py::test_postgres_same_cookie_logout_then_login_fails_after_revalidation",
    "tests/concurrency/test_operator_session_postgres.py::test_postgres_operator_session_revoke_and_mutation_are_linearized",
    "tests/concurrency/test_operator_session_postgres.py::test_postgres_lifecycle_revoke_and_verified_mutation_share_lock_order",
    "tests/concurrency/test_operator_session_postgres.py::test_postgres_login_and_pin_change_share_the_employee_row_lock",
    "tests/concurrency/test_operator_session_postgres.py::test_postgres_cross_actor_lifecycle_locks_are_deadlock_free",
    "tests/concurrency/test_operator_session_postgres.py::test_postgres_admin_pin_change_serializes_the_global_credential",
    "tests/concurrency/test_operator_session_postgres.py::test_postgres_admin_mutation_and_pin_change_share_the_credential_lock",
    "tests/concurrency/test_operator_session_postgres.py::test_postgres_admin_audit_accepts_max_length_employee_code",
    "tests/ops/test_inventory_cutover_postgres_locking.py::test_postgres_cutover_lock_blocks_shipping_writer_until_rollback",
    "tests/services/test_warehouse_map_postgres_locking.py::test_postgres_head_public_tables_serialize_two_connections",
    "tests/services/test_warehouse_map_postgres_locking.py::test_postgres_concurrent_admin_moves_serialize_target_capacity_and_stack_order",
    "tests/services/test_warehouse_map_postgres_locking.py::test_postgres_outbound_blocks_actual_admin_move_until_commit",
    "tests/concurrency/test_transaction_correction_postgres.py::test_postgres_cp4_partial_unique_index_is_present",
    "tests/concurrency/test_transaction_correction_postgres.py::test_postgres_concurrent_corrections_have_one_winner_and_no_loser_orphans",
    "tests/concurrency/test_transaction_correction_postgres.py::test_postgres_correction_and_cancel_have_one_winner_and_no_loser_orphans",
    "tests/concurrency/test_transaction_correction_postgres.py::test_postgres_corrected_operation_rejects_fresh_cancellation_preview",
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
