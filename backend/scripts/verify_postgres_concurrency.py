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
    "tests/migrations/test_inventory_location_ledger.py::test_postgresql_fresh_and_0031_to_0032_preserve_rows",
    "tests/migrations/test_inventory_location_ledger.py::test_postgresql_0032_source_lock_serializes_a_concurrent_writer",
    "tests/migrations/test_inventory_location_ledger.py::test_postgresql_anomaly_rolls_back_without_orphan_ddl",
    "tests/migrations/test_inventory_location_ledger.py::test_postgresql_0032_downgrade_blocks_concurrent_v2_operation_insert",
    "tests/migrations/test_shipping_command_receipts.py::test_postgresql_upgrade_to_0033_creates_exact_receipt_schema",
    "tests/migrations/test_shipping_command_receipts.py::test_postgresql_0033_downgrade_and_reupgrade",
    "tests/migrations/test_shipping_command_receipts.py::test_postgresql_0033_late_failure_rolls_back_and_retry_succeeds",
    "tests/migrations/test_shipping_command_receipts.py::test_postgresql_0033_late_downgrade_failure_rolls_back_and_retry_succeeds",
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
    "tests/services/test_warehouse_map_postgres_locking.py::test_postgres_inventory_bulk_lock_blocks_a_second_connection_update",
    "tests/services/test_warehouse_map_postgres_locking.py::test_postgres_box_placement_and_quarantine_share_item_first_lock_order",
    "tests/services/test_warehouse_map_postgres_locking.py::test_postgres_soft_delete_and_box_placement_have_exactly_one_winner",
    "tests/services/test_warehouse_map_postgres_locking.py::test_postgres_quarantine_cancel_and_restore_have_exactly_one_winner",
    "tests/services/test_warehouse_map_postgres_locking.py::test_postgres_quarantine_cancel_and_stock_request_approval_are_deadlock_free",
    "tests/services/test_warehouse_map_postgres_locking.py::test_postgres_legacy_cancel_and_box_placement_share_item_first_lock_order",
    "tests/services/test_warehouse_map_postgres_locking.py::test_postgres_concurrent_admin_moves_serialize_target_capacity_and_stack_order",
    "tests/services/test_warehouse_map_postgres_locking.py::test_postgres_outbound_blocks_actual_admin_move_until_commit",
    "tests/services/test_warehouse_map_postgres_locking.py::test_postgres_delete_box_rejects_item_added_before_canonical_lock",
    "tests/services/test_warehouse_map_postgres_locking.py::test_postgres_delete_angle_rechecks_boxes_after_concurrent_create",
    "tests/concurrency/test_transaction_correction_postgres.py::test_postgres_cp4_partial_unique_index_is_present",
    "tests/concurrency/test_transaction_correction_postgres.py::test_postgres_concurrent_corrections_have_one_winner_and_no_loser_orphans",
    "tests/concurrency/test_transaction_correction_postgres.py::test_postgres_correction_and_cancel_have_one_winner_and_no_loser_orphans",
    "tests/concurrency/test_transaction_correction_postgres.py::test_postgres_corrected_operation_rejects_fresh_cancellation_preview",
    "tests/concurrency/test_transaction_correction_postgres.py::test_postgres_v2_cancel_and_outbound_have_one_physical_winner",
    "tests/concurrency/test_transaction_correction_postgres.py::test_postgres_effect_snapshot_serializes_placement_and_cancels_only_own_delta",
    "tests/concurrency/test_cp4_command_postgres.py::test_postgres_cp4_fingerprint_columns_are_nullable_varchar_64",
    "tests/concurrency/test_cp4_command_postgres.py::test_postgres_io_same_key_collision_applies_once_and_replays",
    "tests/concurrency/test_cp4_command_postgres.py::test_postgres_existing_draft_submit_race_and_lost_response_apply_once",
    "tests/concurrency/test_cp4_command_postgres.py::test_postgres_existing_draft_save_then_submit_is_deadlock_free",
    "tests/concurrency/test_cp4_command_postgres.py::test_postgres_existing_draft_submit_then_save_is_deadlock_free",
    "tests/concurrency/test_cp4_command_postgres.py::test_postgres_stock_request_same_key_collision_reserves_once_and_replays",
    "tests/concurrency/test_cp4_command_postgres.py::test_postgres_stock_request_code_retry_reacquires_idempotency_lock",
    "tests/concurrency/test_cp4_command_postgres.py::test_postgres_cross_route_same_key_race_has_one_owner",
    "tests/concurrency/test_cp4_command_postgres.py::test_postgres_handover_receive_race_has_one_winner_and_no_orphans",
    "tests/concurrency/test_cp4_command_postgres.py::test_postgres_handover_cancel_race_has_one_winner_and_no_orphans",
    "tests/concurrency/test_cp4_command_postgres.py::test_postgres_handover_rollback_then_retry_has_one_physical_result",
    "tests/concurrency/test_cp4_command_postgres.py::test_postgres_lost_response_retries_replay_io_and_stock_without_duplication",
    "tests/concurrency/test_cp4_command_postgres.py::test_postgres_item_delete_vs_io_submit_has_one_winner_and_no_orphans",
    "tests/concurrency/test_shipping_command_postgres.py::test_postgres_shipping_transition_races_have_one_mutation_winner",
    "tests/concurrency/test_shipping_command_postgres.py::test_postgres_pickup_and_prepare_cancel_have_one_current_state_winner",
    "tests/concurrency/test_shipping_command_postgres.py::test_postgres_stale_next_state_cancel_cannot_chain_after_transition",
    "tests/concurrency/test_shipping_command_postgres.py::test_postgres_shipping_cancel_races_have_one_mutation_winner",
    "tests/concurrency/test_shipping_command_postgres.py::test_postgres_prepare_and_request_writer_serialize_without_stale_state",
    "tests/concurrency/test_shipping_command_postgres.py::test_postgres_prepare_and_stock_request_draft_submit_have_one_owner",
    "tests/concurrency/test_shipping_command_postgres.py::test_postgres_stock_request_draft_save_and_submit_lock_owner_first",
    "tests/concurrency/test_shipping_command_postgres.py::test_postgres_shipping_reservation_vs_consumer_has_one_physical_winner",
    "tests/concurrency/test_shipping_command_postgres.py::test_postgres_prepare_cancel_prelocks_multi_item_allocations_in_canonical_order",
    "tests/scripts/test_inventory_location_preflight.py::test_postgresql_readonly_transaction_rejects_actual_update",
    "tests/scripts/test_inventory_location_preflight.py::test_postgresql_repeatable_read_snapshot_survives_writer_commit",
    "tests/scripts/test_inventory_location_preflight.py::test_postgresql_collect_and_cli_match_sqlite_canonical_fixture",
    "tests/scripts/test_inventory_location_preflight.py::test_postgresql_cli_fails_closed_without_traceback_for_schema_error",
    "tests/scripts/test_inventory_location_preflight.py::test_postgresql_cli_rejects_required_view_even_with_matching_columns_and_data",
    "tests/scripts/test_inventory_location_preflight.py::test_postgresql_cli_fails_closed_without_traceback_for_snapshot_query_error",
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
