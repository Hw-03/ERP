"""Migrated close evidence cannot be replaced, extended after sealing, or erased."""
from datetime import datetime, timedelta
import io
from pathlib import Path
import uuid

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
import pytest
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models


TABLES = ("stocktake_close_manifests", "stocktake_close_chunks", "stocktake_close_seals", "stocktake_close_commits")


def _config(url: str, output: io.StringIO | None = None) -> Config:
    """Every online migration uses a temporary database explicitly."""
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"), output_buffer=output)
    config.set_main_option("sqlalchemy.url", url)
    return config


@pytest.fixture(scope="module")
def close_engine(tmp_path_factory: pytest.TempPathFactory):
    """Exercise actual migration DDL rather than metadata-only tables."""
    path = tmp_path_factory.mktemp("stocktake-close") / "evidence.db"
    url = f"sqlite:///{path.as_posix()}"
    command.upgrade(_config(url), "head")
    engine = create_engine(url)

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record) -> None:
        connection.execute("PRAGMA foreign_keys=ON")

    yield engine
    engine.dispose()


def test_close_schema_is_installed_without_activating_inventory(close_engine: Engine) -> None:
    assert set(TABLES) <= set(inspect(close_engine).get_table_names())
    with close_engine.connect() as connection:
        assert connection.execute(text("SELECT inventory_mode, active_round_id, epoch FROM stocktake_control")).one() == ("LEGACY", None, 0)
        assert connection.execute(text("PRAGMA foreign_key_check")).fetchall() == []


def test_close_migration_matches_declared_models(close_engine: Engine) -> None:
    with close_engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={
            "include_object": lambda obj, name, type_, reflected, compare_to:
                (name if type_ == "table" else getattr(getattr(obj, "table", None), "name", None)) in TABLES,
            "compare_server_default": True,
        })
        assert compare_metadata(context, models.Base.metadata) == []


@pytest.fixture
def evidence(close_engine: Engine):
    """Create isolated IDs; failed mutation tests never consume another test's rows."""
    actor_id, round_id, preview_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    with Session(close_engine) as db:
        db.add(models.Employee(employee_id=actor_id, employee_code=f"C-{actor_id.hex[:12]}", name="Closer", role="admin"))
        db.flush()
        db.add(models.StocktakeRound(round_id=round_id, title="Close migration", epoch=1, started_by=actor_id))
        db.flush()
        db.add(models.StocktakePreview(preview_id=preview_id, kind="close", round_id=round_id,
            actor_id=actor_id, payload={}, preview_hash="a" * 64,
            expires_at=datetime.utcnow() + timedelta(minutes=10)))
        db.commit()
    return {"actor_id": actor_id, "round_id": round_id, "preview_id": preview_id}


def _manifest(connection: Connection, evidence: dict, *, chunks: int = 1) -> uuid.UUID:
    """Prepare an unpublished header with a fixed declared chunk count."""
    manifest_id = uuid.uuid4()
    connection.execute(models.StocktakeCloseManifest.__table__.insert().values(
        manifest_id=manifest_id, round_id=evidence["round_id"], header={}, manifest_hash="b" * 64,
        chunk_count=chunks, row_count=chunks))
    return manifest_id


def _chunk(connection: Connection, manifest_id: uuid.UUID, index: int) -> None:
    """Use a valid small chunk so tests isolate publication constraints."""
    connection.execute(models.StocktakeCloseChunk.__table__.insert().values(
        manifest_id=manifest_id, chunk_index=index, entries=[{"index": index}], chunk_hash="c" * 64))


def _seal(connection: Connection, evidence: dict, manifest_id: uuid.UUID) -> None:
    """Publication requires the whole declared index range to exist."""
    connection.execute(models.StocktakeCloseSeal.__table__.insert().values(
        manifest_id=manifest_id, preview_id=evidence["preview_id"]))


@pytest.mark.parametrize("table", TABLES)
@pytest.mark.parametrize("mutation", ["update", "delete", "replace"])
def test_published_close_evidence_is_immutable(close_engine: Engine, evidence: dict, table: str, mutation: str) -> None:
    with close_engine.begin() as connection:
        manifest_id = _manifest(connection, evidence)
        _chunk(connection, manifest_id, 0)
        _seal(connection, evidence, manifest_id)
        connection.execute(models.StocktakeCloseCommit.__table__.insert().values(
            round_id=evidence["round_id"], manifest_id=manifest_id, actor_id=evidence["actor_id"],
            actor_name="Closer", applications=[]))
        where = "round_id=:id" if table.endswith("commits") else "manifest_id=:id"
        ident = evidence["round_id"].hex if table.endswith("commits") else manifest_id.hex
        key = "round_id" if table.endswith("commits") else "manifest_id"
        statement = {
            "update": f"UPDATE {table} SET {key}={key} WHERE {where}",
            "delete": f"DELETE FROM {table} WHERE {where}",
            "replace": f"INSERT OR REPLACE INTO {table} SELECT * FROM {table} WHERE {where}",
        }[mutation]
        with pytest.raises(IntegrityError, match="immutable"):
            connection.execute(text(statement), {"id": ident})


@pytest.mark.parametrize("index", [-1, 1, 2])
def test_chunk_index_must_be_inside_declared_range(close_engine: Engine, evidence: dict, index: int) -> None:
    with close_engine.begin() as connection:
        manifest_id = _manifest(connection, evidence)
        with pytest.raises(IntegrityError):
            _chunk(connection, manifest_id, index)


def test_incomplete_manifest_cannot_be_sealed(close_engine: Engine, evidence: dict) -> None:
    with close_engine.begin() as connection:
        manifest_id = _manifest(connection, evidence, chunks=2)
        _chunk(connection, manifest_id, 1)
        with pytest.raises(IntegrityError, match="incomplete"):
            _seal(connection, evidence, manifest_id)
        _chunk(connection, manifest_id, 0)
        _seal(connection, evidence, manifest_id)


def test_sealed_manifest_refuses_more_chunks(close_engine: Engine, evidence: dict) -> None:
    with close_engine.begin() as connection:
        manifest_id = _manifest(connection, evidence)
        _chunk(connection, manifest_id, 0)
        _seal(connection, evidence, manifest_id)
        with pytest.raises(IntegrityError, match="sealed"):
            _chunk(connection, manifest_id, 1)


def test_close_commit_requires_published_seal(close_engine: Engine, evidence: dict) -> None:
    with close_engine.begin() as connection:
        manifest_id = _manifest(connection, evidence, chunks=0)
        values = dict(round_id=evidence["round_id"], manifest_id=manifest_id,
                      actor_id=evidence["actor_id"], actor_name="Closer", applications=[])
        with pytest.raises(IntegrityError, match="FOREIGN KEY"):
            connection.execute(models.StocktakeCloseCommit.__table__.insert().values(**values))
        _seal(connection, evidence, manifest_id)
        connection.execute(models.StocktakeCloseCommit.__table__.insert().values(**values))


def test_unsealed_header_and_chunks_are_already_immutable(close_engine: Engine, evidence: dict) -> None:
    with close_engine.begin() as connection:
        manifest_id = _manifest(connection, evidence)
        _chunk(connection, manifest_id, 0)
        for statement in (
            "UPDATE stocktake_close_manifests SET chunk_count=2 WHERE manifest_id=:id",
            "UPDATE stocktake_close_chunks SET entries='[]' WHERE manifest_id=:id",
            "DELETE FROM stocktake_close_chunks WHERE manifest_id=:id",
        ):
            with pytest.raises(IntegrityError, match="immutable"):
                connection.execute(text(statement), {"id": manifest_id.hex})


def test_preview_unique_key_cannot_replace_another_seal(close_engine: Engine, evidence: dict) -> None:
    with close_engine.begin() as connection:
        first = _manifest(connection, evidence, chunks=0)
        second = _manifest(connection, evidence, chunks=0)
        _seal(connection, evidence, first)
        with pytest.raises(IntegrityError, match="immutable"):
            connection.execute(text("INSERT OR REPLACE INTO stocktake_close_seals (manifest_id, preview_id) VALUES (:manifest, :preview)"),
                               {"manifest": second.hex, "preview": evidence["preview_id"].hex})


def test_same_round_cannot_be_closed_twice(close_engine: Engine, evidence: dict) -> None:
    with close_engine.begin() as connection:
        first = _manifest(connection, evidence, chunks=0)
        _seal(connection, evidence, first)
        values = dict(round_id=evidence["round_id"], manifest_id=first,
                      actor_id=evidence["actor_id"], actor_name="Closer", applications=[])
        connection.execute(models.StocktakeCloseCommit.__table__.insert().values(**values))
        with pytest.raises(IntegrityError):
            connection.execute(models.StocktakeCloseCommit.__table__.insert().values(**values))


def test_postgresql_close_migration_compiles_without_sqlite_statements() -> None:
    output = io.StringIO()
    command.upgrade(_config("postgresql://unused:unused@invalid/unused", output),
                    "20261006_0043:20261006_0044", sql=True)
    sql = output.getvalue()
    assert all(f"CREATE TABLE {table}" in sql for table in TABLES)
    assert "FOR UPDATE" in sql
    assert "BEFORE INSERT ON stocktake_close_chunks" in sql
    assert "BEFORE INSERT ON stocktake_close_seals" in sql
    assert "REFERENCES stocktake_close_seals (manifest_id)" in sql
    assert "RAISE(ABORT" not in sql and "PRAGMA" not in sql
