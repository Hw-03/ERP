from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path

import pytest

import bootstrap
import bootstrap_db
from app.models import Base
from bootstrap.schema import (
    SchemaCheckResult,
    SchemaEnsureResult,
    SchemaMismatchError,
    SchemaState,
)


HEAD_REVISION = "20260720_0003"


def _ensured() -> SchemaEnsureResult:
    return SchemaEnsureResult(
        previous_state=SchemaState.VERSIONED,
        revision=HEAD_REVISION,
        changed=False,
    )


def test_all_ensures_once_then_seeds_then_runs_compatibility_backfill(
    monkeypatch: pytest.MonkeyPatch,
):
    calls: list[str] = []
    monkeypatch.setattr(
        bootstrap_db,
        "ensure_schema",
        lambda: calls.append("ensure") or _ensured(),
    )
    monkeypatch.setattr(
        bootstrap_db,
        "seed_reference_data",
        lambda: calls.append("seed") or {"employees": 0},
    )
    monkeypatch.setattr(
        bootstrap_db,
        "backfill_mes_codes",
        lambda: calls.append("backfill") or 0,
    )

    assert bootstrap_db.main(["--all"]) == 0
    assert calls == ["ensure", "seed", "backfill"]


def test_schema_and_migrate_flags_share_one_ensure_call(monkeypatch: pytest.MonkeyPatch):
    calls: list[str] = []
    monkeypatch.setattr(
        bootstrap_db,
        "ensure_schema",
        lambda: calls.append("ensure") or _ensured(),
    )

    assert bootstrap_db.main(["--schema", "--migrate"]) == 0
    assert calls == ["ensure"]


def test_cli_schema_failure_is_nonzero_and_prints_reason(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
):
    def fail_schema():
        raise SchemaMismatchError(("missing table: inventory",))

    monkeypatch.setattr(bootstrap_db, "ensure_schema", fail_schema)

    assert bootstrap_db.main(["--schema"]) == 1
    assert "missing table: inventory" in capsys.readouterr().err


def test_check_reports_schema_and_data_without_ensuring(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
):
    sentinel = object()

    @contextmanager
    def fake_readonly_connection():
        yield sentinel

    monkeypatch.setattr(bootstrap_db, "readonly_connection", fake_readonly_connection)
    monkeypatch.setattr(
        bootstrap_db,
        "check_schema",
        lambda *, connection: SchemaCheckResult(
            state=SchemaState.VERSIONED,
            revision=HEAD_REVISION,
            ready=True,
            profile_id="canonical",
        ),
    )
    monkeypatch.setattr(
        bootstrap_db,
        "check_db",
        lambda *, connection: {"items": 3, "items_missing_mes_code": 0},
    )
    monkeypatch.setattr(
        bootstrap_db,
        "ensure_schema",
        lambda: pytest.fail("--check must not mutate schema"),
    )

    assert bootstrap_db.main(["--check"]) == 0
    output = capsys.readouterr().out
    assert "versioned" in output
    assert HEAD_REVISION in output
    assert "profile=canonical" in output
    assert "items: 3" in output


def test_check_returns_nonzero_when_database_is_not_at_head(
    monkeypatch: pytest.MonkeyPatch,
):
    @contextmanager
    def fake_readonly_connection():
        yield object()

    monkeypatch.setattr(bootstrap_db, "readonly_connection", fake_readonly_connection)
    monkeypatch.setattr(
        bootstrap_db,
        "check_schema",
        lambda *, connection: SchemaCheckResult(
            state=SchemaState.EMPTY,
            revision=None,
            ready=False,
        ),
    )
    monkeypatch.setattr(bootstrap_db, "check_db", lambda *, connection: {})

    assert bootstrap_db.main(["--check"]) == 1


def test_ddl_cli_never_calls_legacy_raw_migrate_or_create_all(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(bootstrap_db, "ensure_schema", _ensured)
    monkeypatch.setattr(
        bootstrap_db._migrate_mod,
        "run_migrations",
        lambda: pytest.fail("legacy raw migrations must not run"),
    )
    monkeypatch.setattr(
        Base.metadata,
        "create_all",
        lambda *args, **kwargs: pytest.fail("create_all must not run"),
    )

    assert bootstrap_db.main(["--schema", "--migrate"]) == 0


def test_package_bootstrap_all_uses_alembic_then_seed_then_backfill(
    monkeypatch: pytest.MonkeyPatch,
):
    calls: list[str] = []
    monkeypatch.setattr(
        bootstrap,
        "ensure_schema",
        lambda: calls.append("ensure") or _ensured(),
    )
    monkeypatch.setattr(
        bootstrap,
        "seed_reference_data",
        lambda: calls.append("seed") or {"employees": 0},
    )
    monkeypatch.setattr(
        bootstrap,
        "backfill_mes_codes",
        lambda: calls.append("backfill") or 0,
    )

    result = bootstrap.bootstrap_all()

    assert calls == ["ensure", "seed", "backfill"]
    assert result["schema"].revision == HEAD_REVISION


def test_schema_output_includes_backup_path_when_unversioned(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
):
    receipt_path = tmp_path / "verified.db"
    receipt_path.touch()
    from bootstrap.schema import BackupReceipt

    monkeypatch.setattr(
        bootstrap_db,
        "ensure_schema",
        lambda: SchemaEnsureResult(
            previous_state=SchemaState.UNVERSIONED_CURRENT,
            revision=HEAD_REVISION,
            changed=True,
            backup=BackupReceipt(path=receipt_path, verified=True),
        ),
    )

    assert bootstrap_db.main(["--migrate"]) == 0
    assert str(receipt_path) in capsys.readouterr().out


def test_legacy_schema_output_reports_profile_and_unchanged_business_data(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
):
    receipt_path = tmp_path / "legacy-verified.db"
    receipt_path.touch()
    from bootstrap.schema import BackupReceipt

    monkeypatch.setattr(
        bootstrap_db,
        "ensure_schema",
        lambda: SchemaEnsureResult(
            previous_state=SchemaState.UNVERSIONED_LEGACY,
            revision=HEAD_REVISION,
            changed=True,
            backup=BackupReceipt(path=receipt_path, verified=True),
            profile_id="employee_legacy_20260720",
            business_data_unchanged=True,
        ),
    )

    assert bootstrap_db.main(["--migrate"]) == 0
    output = capsys.readouterr().out
    assert "profile=employee_legacy_20260720" in output
    assert "business_data_unchanged=true" in output
