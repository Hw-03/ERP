"""Use synthetic in-memory metadata; never open operational rehearsal databases."""
from __future__ import annotations

from contextlib import contextmanager
import importlib.util
from pathlib import Path
import sys
from types import ModuleType
from typing import Iterator

import pytest
import sqlalchemy as sa
from sqlalchemy.engine import Connection

from app.models import Base
from bootstrap import schema


OLD_REVISION = "20260928_0038"
HEAD_REVISION = "20261008_0044"


def _adapter() -> ModuleType:
    path = Path(__file__).with_name("recovery_rehearsal.py")
    spec = importlib.util.spec_from_file_location("checkpoint_rehearsal", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@contextmanager
def _synthetic_checkpoint(profile_id: str = "employee_legacy_20260720") -> Iterator[Connection]:
    """Model checkpoint transitions without replaying migrations or using private data."""
    engine = sa.create_engine("sqlite:///:memory:")
    try:
        with engine.connect() as connection:
            Base.metadata.create_all(connection)
            connection.exec_driver_sql("CREATE TABLE alembic_version(version_num VARCHAR(32) NOT NULL)")
            connection.exec_driver_sql("INSERT INTO alembic_version VALUES (?)", (OLD_REVISION,))
            connection.exec_driver_sql("INSERT INTO data_revision(id, revision) VALUES (1, 0)")
            schema._record_sqlite_schema_state(connection, profile_id=profile_id, revision=OLD_REVISION)
            connection.commit()
            yield connection
    finally:
        engine.dispose()


@pytest.mark.parametrize("profile_id", ["canonical", "employee_legacy_20260720"])
def test_managed_migration_records_actual_checkpoint_and_preserves_profile(profile_id: str) -> None:
    module = _adapter()
    with _synthetic_checkpoint(profile_id) as connection:
        before = schema._read_schema_state(connection)
        with module.managed_migration(connection, HEAD_REVISION):
            if profile_id != "canonical":
                connection.exec_driver_sql("CREATE TABLE rehearsal_probe(id INTEGER PRIMARY KEY)")
            connection.exec_driver_sql("UPDATE alembic_version SET version_num=?", (HEAD_REVISION,))
            connection.commit()
            with pytest.raises(schema.RevisionStateError, match="does not match Alembic revision"):
                schema.inspect_schema(connection)
        state = schema._read_schema_state(connection)
        assert state is not None and state.profile_id == profile_id and state.revision == HEAD_REVISION
        assert state.schema_fingerprint == schema._sqlite_schema_fingerprint(connection)
        if profile_id != "canonical":
            assert before is not None and before.schema_fingerprint != state.schema_fingerprint
        assert schema.check_schema(connection=connection).ready
        assert connection.exec_driver_sql("SELECT revision FROM data_revision").scalar_one() == 0


@pytest.mark.parametrize("damage", ["fingerprint", "missing-checkpoint", "wrong-head"])
def test_managed_migration_rejects_unverified_start_before_body(damage: str) -> None:
    module = _adapter()
    with _synthetic_checkpoint() as connection:
        target = HEAD_REVISION
        if damage == "fingerprint":
            connection.exec_driver_sql("CREATE TABLE unexpected_schema_change(id INTEGER)")
        elif damage == "missing-checkpoint":
            connection.exec_driver_sql("DELETE FROM alembic_schema_state")
        else:
            target = OLD_REVISION
        connection.commit()
        before = schema._read_schema_state(connection)
        with pytest.raises(module.release.ReleaseError, match="intact managed 0038"):
            with module.managed_migration(connection, target):
                pytest.fail("Invalid starting metadata entered migration body")
        assert schema._read_schema_state(connection) == before


def test_managed_migration_does_not_checkpoint_failed_step() -> None:
    module = _adapter()
    with _synthetic_checkpoint() as connection:
        before = schema._read_schema_state(connection)
        with pytest.raises(RuntimeError, match="step failed"):
            with module.managed_migration(connection, HEAD_REVISION):
                connection.exec_driver_sql("UPDATE alembic_version SET version_num=?", (HEAD_REVISION,))
                connection.commit()
                raise RuntimeError("step failed")
        assert schema._read_schema_state(connection) == before


def test_managed_migration_rejects_invalid_head_without_committing_checkpoint() -> None:
    module = _adapter()
    with _synthetic_checkpoint() as connection:
        before = schema._read_schema_state(connection)
        with pytest.raises(schema.SchemaMismatchError, match="data_revision"):
            with module.managed_migration(connection, HEAD_REVISION):
                connection.exec_driver_sql("UPDATE alembic_version SET version_num=?", (HEAD_REVISION,))
                connection.exec_driver_sql("DELETE FROM data_revision")
                connection.commit()
        connection.rollback()
        assert schema._read_schema_state(connection) == before
