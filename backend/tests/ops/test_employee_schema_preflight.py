from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
PREFLIGHT_SCRIPT = ROOT / "scripts" / "ops" / "employee_schema_preflight.py"
MIGRATIONS = ROOT / "backend" / "alembic" / "versions"


def _load_preflight_module():
    spec = importlib.util.spec_from_file_location("employee_schema_preflight", PREFLIGHT_SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _write_migration(path: Path, revision: str, policy: str | None) -> None:
    declaration = "" if policy is None else f"\nEMPLOYEE_AUTO_DEPLOY_POLICY = {policy}\n"
    path.write_text(
        f'revision = "{revision}"\ndown_revision = None\n{declaration}', encoding="utf-8"
    )


def test_changed_migrations_require_declared_auto_deploy_policy(tmp_path: Path) -> None:
    module = _load_preflight_module()
    source = tmp_path / "source"
    target = tmp_path / "target"
    source.mkdir()
    target.mkdir()
    _write_migration(source / "20260803_0001_missing.py", "20260803_0001", None)

    with pytest.raises(module.PreflightPolicyError, match="policy"):
        module.load_changed_migration_policies(source, target)


def test_data_change_policy_requires_a_query_validator(tmp_path: Path) -> None:
    module = _load_preflight_module()
    source = tmp_path / "source"
    target = tmp_path / "target"
    source.mkdir()
    target.mkdir()
    _write_migration(
        source / "20260803_0001_backfill.py",
        "20260803_0001",
        '{"kind": "data-change", "allowed_tables": ["items"]}',
    )

    with pytest.raises(module.PreflightPolicyError, match="validator"):
        module.load_changed_migration_policies(source, target)


def test_preflight_rejects_removing_an_employee_migration_file(tmp_path: Path) -> None:
    module = _load_preflight_module()
    source = tmp_path / "source"
    target = tmp_path / "target"
    source.mkdir()
    target.mkdir()
    _write_migration(target / "20260802_0001_existing.py", "20260802_0001", '{"kind": "schema-only"}')

    with pytest.raises(module.PreflightPolicyError, match="removed"):
        module.load_changed_migration_policies(source, target)


def test_data_preserving_snapshot_rejects_existing_row_changes(tmp_path: Path) -> None:
    module = _load_preflight_module()
    database = tmp_path / "employee.db"
    module.sqlite3.connect(database).execute(
        "CREATE TABLE shipping_requests (request_id TEXT PRIMARY KEY, status TEXT)"
    ).connection.execute(
        "INSERT INTO shipping_requests VALUES ('SR-1', 'ready')"
    ).connection.commit()

    before = module.snapshot_existing_rows(database)
    with module.sqlite3.connect(database) as connection:
        connection.execute("UPDATE shipping_requests SET status = 'shipped' WHERE request_id = 'SR-1'")

    with pytest.raises(module.PreflightDataError, match="shipping_requests"):
        module.assert_existing_rows_unchanged(database, before, allowed_tables=frozenset())


def test_data_change_policy_allows_only_declared_table_and_validator(tmp_path: Path) -> None:
    module = _load_preflight_module()
    database = tmp_path / "employee.db"
    with module.sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE items (item_id TEXT PRIMARY KEY, enabled INTEGER)")
        connection.execute("CREATE TABLE employees (employee_id TEXT PRIMARY KEY, name TEXT)")
        connection.execute("INSERT INTO items VALUES ('AF-1', 0)")
        connection.execute("INSERT INTO employees VALUES ('E-1', 'Kim')")

    before = module.snapshot_existing_rows(database)
    with module.sqlite3.connect(database) as connection:
        connection.execute("UPDATE items SET enabled = 1 WHERE item_id = 'AF-1'")

    policy = module.MigrationPolicy(
        revision="20260803_0001",
        kind="data-change",
        allowed_tables=frozenset({"items"}),
        validator_sql="SELECT COUNT(*) FROM items WHERE enabled <> 1",
        validator_expected=0,
    )
    module.assert_existing_rows_unchanged(database, before, policy.allowed_tables)
    module.assert_policy_validators(database, (policy,))


def test_manual_pf_pin_removal_declares_its_data_change_contract(tmp_path: Path) -> None:
    module = _load_preflight_module()
    database = tmp_path / "employee.db"
    with module.sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE model_pf_pins (model_symbol TEXT PRIMARY KEY)")
        connection.execute("INSERT INTO model_pf_pins VALUES ('DX-7020')")

    policy = module._policy_from_migration(
        MIGRATIONS / "20260812_0018_drop_model_pf_pins.py"
    )
    before = module.snapshot_existing_rows(database)
    with module.sqlite3.connect(database) as connection:
        connection.execute("DROP TABLE model_pf_pins")

    assert policy.kind == "data-change"
    assert policy.allowed_tables == frozenset({"model_pf_pins"})
    module.assert_existing_rows_unchanged(database, before, policy.allowed_tables)
    module.assert_policy_validators(database, (policy,))


def test_inventory_location_ledger_declares_data_preserving_employee_policy() -> None:
    module = _load_preflight_module()

    policy = module._policy_from_migration(
        MIGRATIONS / "20260831_0032_inventory_location_ledger.py"
    )

    assert policy.kind == "data-preserving"
    assert policy.allowed_tables == frozenset()


@pytest.mark.parametrize(
    "filename",
    [
        "20260727_0008_af_sales_review_defaults.py",
        "20260728_0009_shipping_prepared_actor.py",
        "20260728_0010_daily_work_reports.py",
        "20260728_0011_shipping_prepared_actor_repair.py",
        "20260804_0012_employee_sidebar_mode.py",
        "20260804_0013_data_revision.py",
        "20260807_0014_shipping_bom_candidate_selection.py",
        "20260807_0015_backfill_shipping_finalization_choice.py",
        "20260807_0016_repair_shipping_bom_candidate_schema.py",
        "20260812_0017_sync_assembly_checklist_content.py",
        "20260812_0018_drop_model_pf_pins.py",
        "20260812_0019_add_inventory_location_pending.py",
        "20260813_0020_add_activity_audit.py",
        "20260818_0021_add_bom_stock_exempt.py",
        "20260818_0022_add_io_bom_auto_tokens.py",
        "20260820_0023_add_internal_use_bom_modes.py",
        "20260821_0024_remove_shipping_requested_status.py",
        "20260824_0024_weekly_inventory_snapshots.py",
        "20260824_0025_add_transaction_stock_snapshots.py",
        "20260824_0026_add_transaction_operation_line_link.py",
        "20260824_0027_defect_quarantine_records.py",
        "20260825_0028_reconstruct_legacy_defect_records.py",
        "20260826_0029_inventory_operations.py",
        "20260827_0030_add_operator_sessions.py",
        "20260828_0031_cp4_command_integrity.py",
        "20260831_0032_inventory_location_ledger.py",
    ],
)
def test_current_employee_schema_migrations_declare_auto_deploy_policy(filename: str) -> None:
    module = _load_preflight_module()

    policy = module._policy_from_migration(MIGRATIONS / filename)

    assert policy.kind in {"schema-only", "data-preserving", "data-change"}
