"""IC-18 backup-manifest/v1 and fail-closed restore contract."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.orm import Session


ROOT = Path(__file__).resolve().parents[3]
BACKEND_DIR = ROOT / "backend"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import models as _models  # noqa: E402, F401
from app.models import Inventory, Item, ProcessType, WarehouseUnplacedItem  # noqa: E402
from bootstrap.schema import ensure_schema  # noqa: E402
from scripts.ops import (  # noqa: E402
    backup_db,
    backup_manifest,
    backup_retention,
    backup_to_nas,
    maintenance_backup,
    operational_readiness,
    preflight_30_users,
    recovery_owner,
    restore_db,
)
from scripts.ops.backup_retention import retain_latest_backups  # noqa: E402


POSTGRES_TEST_CANDIDATE = "ic18_restore_candidate_111111111111"


def _install_fake_postgres_cluster_comments(
    monkeypatch: pytest.MonkeyPatch,
    catalog: dict[str, int],
) -> dict[int, str]:
    """Model database comments by OID so they follow fake catalog renames."""

    comments: dict[int, str] = {}

    def database_comment(_connection: object, name: str) -> str | None:
        oid = catalog.get(name)
        return comments.get(oid) if oid is not None else None

    def set_database_comment(
        _connection: object,
        name: str,
        comment: str | None,
    ) -> None:
        oid = catalog.get(name)
        assert oid is not None
        if comment is None:
            comments.pop(oid, None)
        else:
            comments[oid] = comment

    monkeypatch.setattr(restore_db, "_postgres_database_comment", database_comment)
    monkeypatch.setattr(restore_db, "_set_postgres_database_comment", set_database_comment)
    return comments
POSTGRES_TEST_NEXT_CANDIDATE = "ic18_restore_candidate_222222222222"


@pytest.fixture
def runtime_dir() -> Iterator[Path]:
    root = ROOT / "_attic" / "runtime" / "ic18-tests" / uuid4().hex[:12]
    root.mkdir(parents=True)
    try:
        yield root
    finally:
        shutil.rmtree(root, ignore_errors=True)


def _create_head_db(path: Path) -> None:
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    try:
        ensure_schema(engine=engine)
    finally:
        engine.dispose()


def _seed_valid_inventory(path: Path) -> None:
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    try:
        with Session(engine) as session:
            process_type = ProcessType(
                code="TR",
                prefix="T",
                suffix="R",
                stage_order=1,
            )
            item = Item(
                item_id="00000000000000000000000000000001",
                item_name="IC18 Part",
                unit="EA",
                model_symbol="9",
                process_type_code="TR",
                serial_no=1,
            )
            session.add_all(
                [
                    process_type,
                    item,
                    Inventory(
                        inventory_id="00000000000000000000000000000002",
                        item_id=item.item_id,
                        quantity=5,
                        warehouse_qty=5,
                        pending_quantity=0,
                    ),
                    WarehouseUnplacedItem(
                        id="00000000000000000000000000000003",
                        item_id=item.item_id,
                        quantity=5,
                    ),
                ]
            )
            session.commit()
    finally:
        engine.dispose()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _load_manifest(artifact: Path) -> dict[str, object]:
    return json.loads(backup_manifest.manifest_path_for(artifact).read_text(encoding="utf-8"))


def _refresh_artifact_receipt(artifact: Path) -> None:
    path = backup_manifest.manifest_path_for(artifact)
    manifest = json.loads(path.read_text(encoding="utf-8"))
    manifest["artifact"]["sha256"] = _sha256(artifact)
    manifest["artifact"]["size"] = artifact.stat().st_size
    path.write_text(json.dumps(manifest), encoding="utf-8")


def _create_valid_retention_pair(artifact: Path) -> None:
    artifact.unlink(missing_ok=True)
    _create_head_db(artifact)
    evidence = backup_manifest.collect_database_evidence(
        f"sqlite:///{artifact.as_posix()}",
        expected_engine="sqlite",
    )
    connection = sqlite3.connect(artifact)
    try:
        journal_mode = str(connection.execute("PRAGMA journal_mode").fetchone()[0])
    finally:
        connection.close()
    manifest = backup_manifest.build_manifest(
        artifact,
        published_name=artifact.name,
        evidence=evidence,
        source_snapshot={
            "method": "sqlite3.backup",
            "wal_included": True,
            "journal_mode": journal_mode,
            "physical_generation": backup_manifest.sqlite_file_generation(artifact),
        },
    )
    backup_manifest.manifest_path_for(artifact).write_text(
        json.dumps(manifest),
        encoding="utf-8",
    )


def test_backup_manifest_module_exists() -> None:
    assert backup_manifest.MANIFEST_CONTRACT == "backup-manifest/v1"


def test_integrity_only_backup_publishes_a_structural_only_pair(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "legacy-source.db"
    with sqlite3.connect(source) as connection:
        connection.execute("CREATE TABLE legacy_items (id INTEGER PRIMARY KEY, name TEXT)")
        connection.execute("INSERT INTO legacy_items VALUES (1, 'legacy')")
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime"))

    artifact = backup_db.backup_sqlite(str(source), integrity_only=True)

    manifest = _load_manifest(artifact)
    result = backup_manifest.verify_sqlite_backup(artifact)
    assert result.status.value == "STRUCTURAL_ONLY"
    assert manifest["artifact"] == {
        "name": artifact.name,
        "sha256": _sha256(artifact),
        "size": artifact.stat().st_size,
    }
    assert set(manifest["database"]) == {
        "engine",
        "alembic_revision",
        "schema_fingerprint",
        "data_revision",
        "snapshot_hash",
        "oracle_hash",
        "snapshot_metadata",
    }
    assert manifest["verification"]["status"] == "STRUCTURAL_ONLY"


def test_structural_only_restore_rejects_foreign_key_tamper_with_refreshed_receipt(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "structural-fk-source.db"
    target = runtime_dir / "structural-fk-target.db"
    with sqlite3.connect(source) as connection:
        connection.executescript(
            """
            PRAGMA foreign_keys = ON;
            CREATE TABLE parent (id INTEGER PRIMARY KEY);
            CREATE TABLE child (
                id INTEGER PRIMARY KEY,
                parent_id INTEGER NOT NULL REFERENCES parent(id)
            );
            INSERT INTO parent VALUES (1);
            INSERT INTO child VALUES (1, 1);
            """
        )
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "r-structural-fk"))
    artifact = backup_db.backup_sqlite(str(source), integrity_only=True)
    with sqlite3.connect(artifact) as connection:
        connection.execute("PRAGMA foreign_keys = OFF")
        connection.execute("INSERT INTO child VALUES (2, 404)")
        connection.commit()
    _refresh_artifact_receipt(artifact)

    with pytest.raises(SystemExit):
        restore_db.restore_sqlite(
            str(artifact),
            str(target),
            run_check=False,
            source_integrity_only=True,
        )

    assert not target.exists()


def test_sqlite_backup_publishes_manifest_last_with_exact_evidence(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "source.db"
    _create_head_db(source)
    _seed_valid_inventory(source)
    runtime_root = runtime_dir / "runtime"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    publication_order: list[Path] = []
    original_replace = backup_manifest._durable_replace

    def record_replace(source_path: str | Path, target_path: str | Path) -> None:
        target = Path(target_path)
        if target.parent == runtime_root / "backups" / "sqlite":
            publication_order.append(target)
        original_replace(source_path, target_path)

    monkeypatch.setattr(backup_manifest, "_durable_replace", record_replace)

    artifact = backup_db.backup_sqlite(str(source))
    manifest_path = backup_manifest.manifest_path_for(artifact)
    manifest = _load_manifest(artifact)

    assert artifact.is_file()
    assert manifest_path.is_file()
    public_pair_order = [
        path for path in publication_order if path in {artifact, manifest_path}
    ]
    assert public_pair_order == [artifact, manifest_path]
    assert manifest["contract"] == "backup-manifest/v1"
    assert manifest["artifact"] == {
        "name": artifact.name,
        "sha256": _sha256(artifact),
        "size": artifact.stat().st_size,
    }
    database = manifest["database"]
    assert database["engine"] == "sqlite"
    assert database["alembic_revision"] == "20260831_0033"
    assert len(database["schema_fingerprint"]) == 64
    assert database["data_revision"]["revision"] >= 0
    assert len(database["snapshot_hash"]) == 64
    assert len(database["oracle_hash"]) == 64
    verification = manifest["verification"]
    assert verification["status"] == "PASS"
    assert verification["foreign_keys"] == "PASS"
    assert verification["schema"] == "PASS"
    assert verification["inventory"]["contract"] == "inventory-integrity/v1"
    assert verification["inventory"]["blocking_count"] == 0

    result = backup_manifest.verify_sqlite_backup(artifact)
    assert result.status == backup_manifest.BackupStatus.PASS
    assert result.errors == ()


def test_sqlite_wal_followup_commit_marks_existing_backup_stale(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "wal-source.db"
    _create_head_db(source)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime"))

    writer = sqlite3.connect(source)
    try:
        assert writer.execute("PRAGMA journal_mode=WAL").fetchone() == ("wal",)
        writer.execute("PRAGMA wal_autocheckpoint=0")
        artifact = backup_db.backup_sqlite(str(source))
        before = backup_manifest.verify_sqlite_backup(artifact, source_path=source)
        assert before.status == backup_manifest.BackupStatus.PASS

        writer.execute(
            "UPDATE data_revision SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
        )
        writer.commit()
        assert Path(f"{source}-wal").is_file()

        after = backup_manifest.verify_sqlite_backup(artifact, source_path=source)
        assert after.status == backup_manifest.BackupStatus.STALE
        assert "source physical generation changed" in after.errors
    finally:
        writer.close()


def test_wal_insert_delete_round_trip_still_marks_existing_backup_stale(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "wal-round-trip-source.db"
    _create_head_db(source)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-wal-round-trip"))

    writer = sqlite3.connect(source)
    try:
        assert writer.execute("PRAGMA journal_mode=WAL").fetchone() == ("wal",)
        writer.execute("PRAGMA wal_autocheckpoint=0")
        artifact = backup_db.backup_sqlite(str(source))
        writer.execute(
            "INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)",
            ("ic18-round-trip", "temporary"),
        )
        writer.commit()
        writer.execute(
            "DELETE FROM system_settings WHERE setting_key = ?",
            ("ic18-round-trip",),
        )
        writer.commit()

        result = backup_manifest.verify_sqlite_backup(artifact, source_path=source)
    finally:
        writer.close()

    assert result.status is backup_manifest.BackupStatus.STALE
    assert "source physical generation changed" in result.errors


def test_sqlite_source_commit_after_logical_snapshot_fails_freshness(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "source-post-logical-commit.db"
    _create_head_db(source)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "r-post-logical"))
    artifact = backup_db.backup_sqlite(str(source))
    original_hash = backup_manifest._source_snapshot_hash

    def hash_then_commit(path: Path) -> str:
        snapshot_hash = original_hash(path)
        with sqlite3.connect(source) as writer:
            writer.execute(
                "UPDATE data_revision SET revision = revision + 1, "
                "updated_at = CURRENT_TIMESTAMP WHERE id = 1"
            )
            writer.commit()
        return snapshot_hash

    monkeypatch.setattr(backup_manifest, "_source_snapshot_hash", hash_then_commit)

    result = backup_manifest.verify_sqlite_backup(artifact, source_path=source)

    assert result.status is backup_manifest.BackupStatus.STALE
    assert "source physical generation changed" in result.errors


def test_sqlite_manifest_without_physical_generation_fails_receipt_validation(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "generation-required-source.db"
    _create_head_db(source)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-generation-required"))
    artifact = backup_db.backup_sqlite(str(source))
    manifest_path = backup_manifest.manifest_path_for(artifact)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    del manifest["source_snapshot"]["physical_generation"]
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    result = backup_manifest.verify_manifest_receipt(
        artifact,
        expected_engine="sqlite",
    )

    assert result.status is backup_manifest.BackupStatus.FAIL
    assert "source physical generation is missing or invalid" in result.errors


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("method", "raw-copy"),
        ("wal_included", False),
        ("journal_mode", ""),
    ],
)
def test_sqlite_manifest_requires_complete_snapshot_capture_evidence(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
    field: str,
    value: object,
) -> None:
    source = runtime_dir / f"snapshot-shape-{field}.db"
    _create_head_db(source)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / f"r-{field}"))
    artifact = backup_db.backup_sqlite(str(source))
    manifest_path = backup_manifest.manifest_path_for(artifact)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["source_snapshot"][field] = value
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    result = backup_manifest.verify_manifest_receipt(
        artifact,
        expected_engine="sqlite",
    )

    assert result.status is backup_manifest.BackupStatus.FAIL
    assert "SQLite snapshot capture evidence is invalid" in result.errors


def test_sqlite_backup_rejects_a_generation_change_during_snapshot_capture(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "snapshot-generation-race.db"
    _create_head_db(source)
    runtime_root = runtime_dir / "runtime-generation-race"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    original_generation = backup_db.sqlite_file_generation
    generation_calls = 0

    def mutate_before_post_generation(path: Path) -> str:
        nonlocal generation_calls
        generation_calls += 1
        if generation_calls == 2:
            with sqlite3.connect(path) as connection:
                connection.execute("CREATE TABLE ic18_generation_race (id INTEGER)")
                connection.commit()
                connection.execute("DROP TABLE ic18_generation_race")
                connection.commit()
        return original_generation(path)

    monkeypatch.setattr(
        backup_db,
        "sqlite_file_generation",
        mutate_before_post_generation,
    )

    with pytest.raises(SystemExit):
        backup_db.backup_sqlite(str(source))

    backup_dir = runtime_root / "backups" / "sqlite"
    assert not list(backup_dir.glob("mes_*.db"))
    assert not list(backup_dir.glob("mes_*.manifest.json"))


def test_missing_manifest_is_legacy_unverified_without_running_inventory_check(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    artifact = runtime_dir / "mes_20260904_000000_000000_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.db"
    _create_head_db(artifact)

    def unexpected_inventory_check(_database_url: str) -> dict[str, object]:
        raise AssertionError("inventory check must not run without a manifest")

    monkeypatch.setattr(backup_manifest, "_run_inventory_integrity", unexpected_inventory_check)

    result = backup_manifest.verify_sqlite_backup(artifact)

    assert result.status == backup_manifest.BackupStatus.LEGACY_UNVERIFIED
    assert result.manifest is None
    assert not backup_manifest.manifest_path_for(artifact).exists()


def test_corrupt_manifest_fails_closed(runtime_dir: Path) -> None:
    artifact = runtime_dir / "mes_20260904_000000_000000_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.db"
    _create_head_db(artifact)
    backup_manifest.manifest_path_for(artifact).write_text("{not-json", encoding="utf-8")

    result = backup_manifest.verify_sqlite_backup(artifact)

    assert result.status == backup_manifest.BackupStatus.FAIL
    assert "manifest JSON is invalid" in result.errors


def test_artifact_tamper_fails_before_database_validation(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "source.db"
    _create_head_db(source)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime"))
    artifact = backup_db.backup_sqlite(str(source))
    with artifact.open("ab") as handle:
        handle.write(b"tamper")

    def unexpected_inventory_check(_database_url: str) -> dict[str, object]:
        raise AssertionError("inventory check must not run after artifact receipt mismatch")

    monkeypatch.setattr(backup_manifest, "_run_inventory_integrity", unexpected_inventory_check)

    result = backup_manifest.verify_sqlite_backup(artifact)

    assert result.status == backup_manifest.BackupStatus.FAIL
    assert "artifact SHA-256 mismatch" in result.errors


@pytest.mark.parametrize("damage", ["wrong-head", "missing-table", "missing-column", "missing-index"])
def test_schema_damage_fails_closed_after_artifact_receipt_is_refreshed(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
    damage: str,
) -> None:
    source = runtime_dir / f"source-{damage}.db"
    _create_head_db(source)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / f"runtime-{damage}"))
    artifact = backup_db.backup_sqlite(str(source))

    with sqlite3.connect(artifact) as connection:
        if damage == "wrong-head":
            connection.execute("UPDATE alembic_version SET version_num = '20260831_0032'")
        elif damage == "missing-table":
            connection.execute("DROP TABLE shipping_command_receipts")
        elif damage == "missing-column":
            connection.execute("ALTER TABLE data_revision DROP COLUMN updated_at")
        else:
            index_name = connection.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type='index' AND sql IS NOT NULL ORDER BY name LIMIT 1"
            ).fetchone()[0]
            connection.execute(f'DROP INDEX "{index_name}"')
        connection.commit()
    _refresh_artifact_receipt(artifact)

    result = backup_manifest.verify_sqlite_backup(artifact)

    assert result.status == backup_manifest.BackupStatus.FAIL
    assert any("schema" in error.lower() or "alembic" in error.lower() for error in result.errors)


def test_foreign_key_violation_fails_closed(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "source-fk.db"
    _create_head_db(source)
    _seed_valid_inventory(source)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-fk"))
    artifact = backup_db.backup_sqlite(str(source))

    with sqlite3.connect(artifact) as connection:
        connection.execute("PRAGMA foreign_keys=OFF")
        connection.execute("DELETE FROM items")
        connection.commit()
    _refresh_artifact_receipt(artifact)

    result = backup_manifest.verify_sqlite_backup(artifact)

    assert result.status == backup_manifest.BackupStatus.FAIL
    assert "foreign key violations detected" in result.errors


def test_w5_inventory_integrity_violation_fails_closed(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "source-integrity.db"
    _create_head_db(source)
    _seed_valid_inventory(source)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-integrity"))
    artifact = backup_db.backup_sqlite(str(source))

    with sqlite3.connect(artifact) as connection:
        connection.execute("UPDATE inventory SET quantity = quantity + 1")
        connection.commit()
    _refresh_artifact_receipt(artifact)

    result = backup_manifest.verify_sqlite_backup(artifact)

    assert result.status == backup_manifest.BackupStatus.FAIL
    assert "inventory-integrity/v1 blocking violation" in result.errors


def test_postgres_evidence_uses_one_repeatable_read_snapshot_for_inventory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []
    active = False

    class FakeConnection:
        dialect = SimpleNamespace(name="postgresql")

        def exec_driver_sql(self, statement: str) -> None:
            events.append(statement)

    connection = FakeConnection()

    @contextmanager
    def fake_readonly_connection(_database_url: str) -> Iterator[FakeConnection]:
        nonlocal active
        active = True
        try:
            yield connection
        finally:
            active = False

    inventory = {
        "contract": "inventory-integrity/v1",
        "status": "pass",
        "blocking_count": 0,
        "warning_count": 0,
        "checks": [],
    }

    def inline_inventory(candidate: object) -> dict[str, object]:
        assert candidate is connection
        assert active is True
        events.append("inventory:same-connection")
        return inventory

    def forbidden_subprocess(_database_url: str) -> dict[str, object]:
        raise AssertionError("PostgreSQL inventory must not use a later subprocess snapshot")

    monkeypatch.setattr(backup_manifest, "readonly_connection", fake_readonly_connection)
    monkeypatch.setattr(
        backup_manifest,
        "check_schema",
        lambda **_kwargs: SimpleNamespace(ready=True, revision="head", differences=()),
    )
    monkeypatch.setattr(backup_manifest, "_foreign_key_check", lambda _connection: None)
    monkeypatch.setattr(
        backup_manifest,
        "_snapshot_identity",
        lambda _connection: {
            "schema_fingerprint": "1" * 64,
            "data_revision": {"revision": 1},
            "oracle_hash": "2" * 64,
            "snapshot_hash": "3" * 64,
            "snapshot_metadata": {"server_version": "16.15"},
        },
    )
    monkeypatch.setattr(
        backup_manifest,
        "_inventory_integrity_from_connection",
        inline_inventory,
        raising=False,
    )
    monkeypatch.setattr(backup_manifest, "_run_inventory_integrity", forbidden_subprocess)

    evidence = backup_manifest.collect_database_evidence(
        "postgresql://example/test",
        expected_engine="postgresql",
    )

    assert events[0] == "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"
    assert events[-1] == "inventory:same-connection"
    assert evidence["verification"]["inventory"] == inventory


def test_manifest_receipt_rejects_missing_database_evidence(
    runtime_dir: Path,
) -> None:
    artifact = runtime_dir / "mes_20260904_000000_000000_receipt.sql"
    artifact.write_text("-- receipt shape\n", encoding="utf-8")
    manifest = backup_manifest.build_manifest(
        artifact,
        published_name=artifact.name,
        evidence=_postgres_evidence(),
        source_snapshot={"method": "pg_dump", "transaction_snapshot": True},
    )
    del manifest["database"]["snapshot_hash"]
    backup_manifest.manifest_path_for(artifact).write_text(
        json.dumps(manifest),
        encoding="utf-8",
    )

    result = backup_manifest.verify_manifest_receipt(
        artifact,
        expected_engine="postgresql",
    )

    assert result.status is backup_manifest.BackupStatus.FAIL
    assert "manifest database evidence is incomplete" in result.errors


def test_preflight_backup_check_passes_a_fully_verified_sqlite_pair(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "preflight-source.db"
    _create_head_db(source)
    runtime_root = runtime_dir / "preflight-runtime"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    backup_db.backup_sqlite(str(source))
    monkeypatch.setattr(preflight_30_users, "SQLITE_DB_PATH", source, raising=False)
    preflight_30_users.results.clear()

    asyncio.run(preflight_30_users.check_backup_exists("sqlite"))

    assert preflight_30_users.results[-1].level == "PASS"
    assert "backup-manifest/v1" in preflight_30_users.results[-1].message


def test_preflight_sqlite_backup_never_uses_mtime_as_freshness_proof(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "preflight-stale-source.db"
    _create_head_db(source)
    runtime_root = runtime_dir / "preflight-stale-runtime"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    artifact = backup_db.backup_sqlite(str(source))
    with sqlite3.connect(source) as connection:
        connection.execute(
            "UPDATE data_revision SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
        )
        connection.commit()
    future = artifact.stat().st_mtime + 3600
    os.utime(artifact, (future, future))
    monkeypatch.setattr(preflight_30_users, "SQLITE_DB_PATH", source, raising=False)
    preflight_30_users.results.clear()

    asyncio.run(preflight_30_users.check_backup_exists("sqlite"))

    assert preflight_30_users.results[-1].level == "FAIL"
    assert "STALE" in preflight_30_users.results[-1].message


def test_preflight_finds_postgres_directory_without_false_green_receipt_only(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime_root = runtime_dir / "preflight-postgres"
    backup_dir = runtime_root / "backups" / "postgres"
    backup_dir.mkdir(parents=True)
    artifact = (
        backup_dir
        / "mes_20260904_000000_000000_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.sql"
    )
    artifact.write_text("-- PostgreSQL backup\n", encoding="utf-8")
    manifest = backup_manifest.build_manifest(
        artifact,
        published_name=artifact.name,
        evidence=_postgres_evidence(),
        source_snapshot={"method": "pg_dump", "transaction_snapshot": True},
    )
    backup_manifest.manifest_path_for(artifact).write_text(
        json.dumps(manifest),
        encoding="utf-8",
    )
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    preflight_30_users.results.clear()

    asyncio.run(preflight_30_users.check_backup_exists("postgresql"))

    assert preflight_30_users.results[-1].level == "WARN"
    assert "NOT_VERIFIED" in preflight_30_users.results[-1].message
    assert str(artifact.resolve()) in preflight_30_users.results[-1].message
    assert str(backup_manifest.manifest_path_for(artifact).resolve()) in (
        preflight_30_users.results[-1].message
    )
    assert "폴더 없음" not in preflight_30_users.results[-1].message


def test_postgres_manifest_requires_pg_dump_transaction_snapshot(
    runtime_dir: Path,
) -> None:
    artifact = runtime_dir / "postgres-missing-source-contract.sql"
    artifact.write_text("-- PostgreSQL backup\n", encoding="utf-8")
    manifest = backup_manifest.build_manifest(
        artifact,
        published_name=artifact.name,
        evidence=_postgres_evidence(),
        source_snapshot={"method": "pg_dump", "transaction_snapshot": True},
    )
    manifest["source_snapshot"] = {}
    backup_manifest.manifest_path_for(artifact).write_text(
        json.dumps(manifest),
        encoding="utf-8",
    )

    result = backup_manifest.verify_manifest_receipt(
        artifact,
        expected_engine="postgresql",
    )

    assert result.status is backup_manifest.BackupStatus.FAIL
    assert "PostgreSQL" in "; ".join(result.errors)


def test_manifest_publication_failure_leaves_no_public_half_pair(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "source-atomic.db"
    _create_head_db(source)
    runtime_root = runtime_dir / "runtime-atomic"
    backup_dir = runtime_root / "backups" / "sqlite"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    original_replace = backup_manifest._durable_replace

    def fail_manifest_publication(source_path: str | Path, target_path: str | Path) -> None:
        if str(target_path).endswith(".manifest.json"):
            raise OSError("injected manifest publication failure")
        original_replace(source_path, target_path)

    monkeypatch.setattr(backup_manifest, "_durable_replace", fail_manifest_publication)

    with pytest.raises(OSError, match="manifest publication"):
        backup_db.backup_sqlite(str(source))

    assert not list(backup_dir.glob("mes_*.db"))
    assert not list(backup_dir.glob("mes_*.manifest.json"))


def test_manifest_publication_cleanup_failure_leaves_retryable_receipt(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    published = runtime_dir / "mes_20260904_120000.db"
    staged = runtime_dir / f".{published.name}.pending-{'7' * 32}.tmp"
    staged.write_bytes(b"backup")
    original_replace = backup_manifest._durable_replace
    original_unlink = Path.unlink

    def fail_manifest_publication(source_path: str | Path, target_path: str | Path) -> None:
        if str(target_path).endswith(".manifest.json"):
            raise OSError("injected manifest publication failure")
        original_replace(source_path, target_path)

    def fail_quarantine_cleanup(
        path: Path,
        missing_ok: bool = False,
    ) -> None:
        if ".backup-publication-quarantine-" in path.name:
            raise OSError("injected quarantine cleanup failure")
        original_unlink(path, missing_ok=missing_ok)

    monkeypatch.setattr(backup_manifest, "_durable_replace", fail_manifest_publication)
    monkeypatch.setattr(Path, "unlink", fail_quarantine_cleanup)

    with pytest.raises(OSError, match="publication recovery"):
        backup_manifest.publish_backup_pair(staged, published, {"contract": "test"})

    receipts = list(
        runtime_dir.glob(f"{backup_manifest.PUBLICATION_RECOVERY_PREFIX}*.json")
    )
    assert not published.exists()
    assert len(receipts) == 1

    monkeypatch.setattr(backup_manifest, "_durable_replace", original_replace)
    monkeypatch.setattr(Path, "unlink", original_unlink)
    backup_manifest.recover_publication_receipts(runtime_dir)

    assert not receipts[0].exists()
    assert not list(runtime_dir.glob(".backup-publication-quarantine-*"))


def test_artifact_publication_failure_recovers_private_staged_artifact(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    published = runtime_dir / "mes_20260904_120001.db"
    staged = runtime_dir / f".{published.name}.pending-{'8' * 32}.tmp"
    staged.write_bytes(b"backup")
    original_replace = backup_manifest._durable_replace

    def fail_artifact_publication(source_path: str | Path, target_path: str | Path) -> None:
        if Path(target_path) == published:
            raise OSError("injected artifact publication failure")
        original_replace(source_path, target_path)

    monkeypatch.setattr(backup_manifest, "_durable_replace", fail_artifact_publication)

    with pytest.raises(OSError, match="artifact publication"):
        backup_manifest.publish_backup_pair(staged, published, {"contract": "test"})

    assert not staged.exists()
    assert not published.exists()
    assert not list(
        runtime_dir.glob(f"{backup_manifest.PUBLICATION_RECOVERY_PREFIX}*.json")
    )


def test_completed_publication_reports_receipt_cleanup_as_pending(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    published = runtime_dir / "mes_20260904_120002.db"
    staged = runtime_dir / f".{published.name}.pending-{'9' * 32}.tmp"
    staged.write_bytes(b"backup")
    original_unlink = Path.unlink

    def fail_receipt_cleanup(path: Path, missing_ok: bool = False) -> None:
        if path.name.startswith(backup_manifest.PUBLICATION_RECOVERY_PREFIX):
            raise OSError("injected receipt cleanup failure")
        original_unlink(path, missing_ok=missing_ok)

    monkeypatch.setattr(Path, "unlink", fail_receipt_cleanup)

    result = backup_manifest.publish_backup_pair(
        staged,
        published,
        {"contract": "test"},
    )

    assert result == published
    assert published.is_file()
    assert backup_manifest.manifest_path_for(published).is_file()
    assert "BACKUP_PUBLICATION_RECOVERY_PENDING=" in capsys.readouterr().err


@pytest.mark.parametrize(
    "mutation",
    [
        "malformed-receipt-token",
        "duplicate-staged-path",
        "substituted-manifest",
        "mismatched-quarantine-token",
    ],
)
def test_publication_recovery_rejects_unbound_receipt_without_mutation(
    runtime_dir: Path,
    mutation: str,
) -> None:
    token = "a" * 32
    published = runtime_dir / "mes_20260904_120003.db"
    published_manifest = backup_manifest.manifest_path_for(published)
    protected = runtime_dir / "mes_20260904_120004.db"
    protected_manifest = backup_manifest.manifest_path_for(protected)
    published.write_bytes(b"published-artifact")
    published_manifest.write_bytes(b"published-manifest")
    protected.write_bytes(b"protected-artifact")
    protected_manifest.write_bytes(b"protected-manifest")
    staged = runtime_dir / f".{published.name}.pending-{'b' * 32}.tmp"
    staged_manifest = runtime_dir / (
        f".{published_manifest.name}.pending-{'c' * 32}.tmp"
    )
    quarantined = runtime_dir / (
        f"{backup_manifest.PUBLICATION_QUARANTINE_PREFIX}{token}-{published.name}"
    )
    quarantined_manifest = runtime_dir / (
        f"{backup_manifest.PUBLICATION_QUARANTINE_PREFIX}"
        f"{token}-{published_manifest.name}"
    )
    receipt_token = "not-a-token" if mutation == "malformed-receipt-token" else token
    receipt = runtime_dir / (
        f"{backup_manifest.PUBLICATION_RECOVERY_PREFIX}{receipt_token}.json"
    )
    payload = {
        "contract": backup_manifest.PUBLICATION_RECOVERY_CONTRACT,
        "state": "recovery_required",
        "owner": {"pid": 999_999_999, "started_at_ns": 1},
        "staged_artifact": staged.name,
        "published_artifact": published.name,
        "published_manifest": published_manifest.name,
        "staged_manifest": staged_manifest.name,
        "quarantined_artifact": quarantined.name,
        "quarantined_manifest": quarantined_manifest.name,
    }
    if mutation == "duplicate-staged-path":
        payload["staged_artifact"] = published.name
    elif mutation == "substituted-manifest":
        payload["published_manifest"] = protected_manifest.name
    elif mutation == "mismatched-quarantine-token":
        payload["quarantined_artifact"] = quarantined.name.replace(token, "d" * 32)
    receipt.write_text(json.dumps(payload), encoding="utf-8")
    before = {
        path: path.read_bytes()
        for path in (published, published_manifest, protected, protected_manifest)
    }

    with pytest.raises(OSError, match="invalid backup publication recovery receipt"):
        backup_manifest.recover_publication_receipts(runtime_dir)

    assert {path: path.read_bytes() for path in before} == before


def test_publication_recovery_converges_after_second_cleanup_failure(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = "e" * 32
    published = runtime_dir / "mes_20260904_120005.db"
    published_manifest = backup_manifest.manifest_path_for(published)
    staged = runtime_dir / f".{published.name}.pending-{'f' * 32}.tmp"
    staged_manifest = runtime_dir / (
        f".{published_manifest.name}.pending-{'1' * 32}.tmp"
    )
    quarantined = runtime_dir / (
        f"{backup_manifest.PUBLICATION_QUARANTINE_PREFIX}{token}-{published.name}"
    )
    quarantined_manifest = runtime_dir / (
        f"{backup_manifest.PUBLICATION_QUARANTINE_PREFIX}"
        f"{token}-{published_manifest.name}"
    )
    receipt = runtime_dir / f"{backup_manifest.PUBLICATION_RECOVERY_PREFIX}{token}.json"
    published.write_bytes(b"half-published-artifact")
    staged_manifest.write_bytes(b"private-manifest")
    backup_manifest._write_publication_recovery_receipt(
        receipt,
        state="recovery_required",
        staged_artifact=staged,
        published_artifact=published,
        published_manifest=published_manifest,
        staged_manifest=staged_manifest,
        quarantined_artifact=quarantined,
        quarantined_manifest=quarantined_manifest,
    )
    original_unlink = backup_manifest._durable_unlink
    injected = False

    def fail_second_cleanup(path: Path, *, missing_ok: bool = False) -> None:
        nonlocal injected
        if path == quarantined and not injected:
            injected = True
            raise OSError("injected second publication recovery failure")
        original_unlink(path, missing_ok=missing_ok)

    monkeypatch.setattr(backup_manifest, "_durable_unlink", fail_second_cleanup)
    with pytest.raises(OSError, match="second publication recovery failure"):
        backup_manifest._recover_publication_receipt(receipt, force=True)

    assert receipt.is_file()
    monkeypatch.setattr(backup_manifest, "_durable_unlink", original_unlink)
    backup_manifest.recover_publication_receipts(runtime_dir)

    assert not receipt.exists()
    assert not any(
        path.exists()
        for path in (
            staged,
            published,
            published_manifest,
            staged_manifest,
            quarantined,
            quarantined_manifest,
        )
    )


@pytest.mark.parametrize(
    ("observed_started_at_ns", "expected"),
    [
        (271_828, True),
        (None, False),
        (314_159, False),
    ],
    ids=["active-owner", "stale-pid", "reused-pid"],
)
def test_publication_owner_liveness_matches_process_creation_time_without_signals(
    observed_started_at_ns: int | None,
    expected: bool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def forbidden_signal(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("process liveness must never signal the process")

    monkeypatch.setattr(backup_manifest.os, "kill", forbidden_signal)
    monkeypatch.setattr(
        backup_manifest,
        "_process_started_at_ns",
        lambda _process_id: observed_started_at_ns,
        raising=False,
    )

    assert backup_manifest._process_is_running(4242, 271_828) is expected


@pytest.mark.skipif(os.name != "nt", reason="Windows process exit identity contract")
def test_windows_exited_process_owner_is_not_active() -> None:
    process = subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(0.2)"],
    )
    started_at_ns = recovery_owner.process_started_at_ns(process.pid)
    assert isinstance(started_at_ns, int)
    owner = {"pid": process.pid, "started_at_ns": started_at_ns}
    process.wait(timeout=10)

    assert recovery_owner.process_owner_is_active(owner) is False


def test_restore_rejects_legacy_unverified_and_preserves_target(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    legacy = runtime_dir / "legacy.db"
    target = runtime_dir / "target.db"
    _create_head_db(legacy)
    _create_head_db(target)
    with sqlite3.connect(target) as connection:
        connection.execute(
            "UPDATE data_revision SET revision = 41, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
        )
        connection.commit()
    before = _sha256(target)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-legacy-restore"))

    with pytest.raises(SystemExit):
        restore_db.restore_sqlite(
            str(legacy),
            str(target),
            run_check=False,
            offline_target=True,
        )

    assert _sha256(target) == before
    assert not backup_manifest.manifest_path_for(legacy).exists()


def test_failed_staged_restore_preserves_target_and_last_valid_manifest(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "source-restore-failure.db"
    target = runtime_dir / "target-restore-failure.db"
    _create_head_db(source)
    _create_head_db(target)
    runtime_root = runtime_dir / "runtime-restore-failure"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    candidate = backup_db.backup_sqlite(str(source))
    last_valid = backup_db.backup_sqlite(str(target))
    last_manifest = backup_manifest.manifest_path_for(last_valid)
    last_manifest_bytes = last_manifest.read_bytes()
    target_before = _sha256(target)

    with sqlite3.connect(candidate) as connection:
        connection.execute("DROP TABLE shipping_command_receipts")
        connection.commit()
    _refresh_artifact_receipt(candidate)

    with pytest.raises(SystemExit):
        restore_db.restore_sqlite(
            str(candidate),
            str(target),
            run_check=False,
            offline_target=True,
        )

    assert _sha256(target) == target_before
    assert last_valid.is_file()
    assert last_manifest.read_bytes() == last_manifest_bytes


def test_valid_restore_checks_staged_candidate_before_installing(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "source-restore.db"
    target = runtime_dir / "target-restore.db"
    _create_head_db(source)
    _create_head_db(target)
    with sqlite3.connect(source) as connection:
        connection.execute(
            "UPDATE data_revision SET revision = 17, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
        )
        connection.commit()
    runtime_root = runtime_dir / "runtime-valid-restore"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    candidate = backup_db.backup_sqlite(str(source))
    events: list[str] = []
    original_candidate_verify = backup_manifest.verify_sqlite_candidate
    original_install = restore_db._copy_sqlite_into_connection

    def record_candidate_verify(
        path: Path,
        manifest: dict[str, object],
    ) -> backup_manifest.BackupVerification:
        events.append("candidate-verify")
        return original_candidate_verify(path, manifest)

    def record_install(
        source_path: Path,
        destination: sqlite3.Connection,
    ) -> None:
        if ".restore-" in source_path.name:
            events.append("install")
        original_install(source_path, destination)

    monkeypatch.setattr(backup_manifest, "verify_sqlite_candidate", record_candidate_verify)
    monkeypatch.setattr(restore_db, "_copy_sqlite_into_connection", record_install)

    restore_db.restore_sqlite(
        str(candidate),
        str(target),
        run_check=False,
        offline_target=True,
    )

    assert events.index("candidate-verify") < events.index("install")
    with sqlite3.connect(target) as connection:
        assert connection.execute("SELECT revision FROM data_revision WHERE id = 1").fetchone() == (
            17,
        )
    rollback_artifacts = list((runtime_root / "backups" / "sqlite").glob("mes-before-pre-restore-*.db"))
    assert len(rollback_artifacts) == 1
    assert backup_manifest.manifest_path_for(rollback_artifacts[0]).is_file()


def test_sqlite_postcheck_failure_restores_the_previous_target(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "source-postcheck-failure.db"
    target = runtime_dir / "target-postcheck-failure.db"
    _create_head_db(source)
    _create_head_db(target)
    connection = sqlite3.connect(source)
    try:
        connection.execute(
            "UPDATE data_revision SET revision = 77, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
        )
        connection.commit()
    finally:
        connection.close()
    connection = sqlite3.connect(target)
    try:
        connection.execute(
            "UPDATE data_revision SET revision = 88, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
        )
        connection.commit()
    finally:
        connection.close()
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-postcheck-failure"))
    candidate = backup_db.backup_sqlite(str(source))
    original_verify = restore_db._verify_sqlite_install_snapshot

    def fail_only_the_installed_target(
        path: Path,
        manifest: dict[str, object],
    ) -> backup_manifest.BackupVerification:
        if ".installed-" in path.name:
            return backup_manifest.BackupVerification(
                backup_manifest.BackupStatus.FAIL,
                ("injected installed target failure",),
                manifest,
            )
        return original_verify(path, manifest)

    monkeypatch.setattr(
        restore_db,
        "_verify_sqlite_install_snapshot",
        fail_only_the_installed_target,
    )

    with pytest.raises(SystemExit):
        restore_db.restore_sqlite(
            str(candidate),
            str(target),
            run_check=False,
            offline_target=True,
        )

    connection = sqlite3.connect(target)
    try:
        assert connection.execute(
            "SELECT revision FROM data_revision WHERE id = 1"
        ).fetchone() == (88,)
    finally:
        connection.close()


def test_preverified_rollback_source_postcheck_failure_restores_current_target(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target = runtime_dir / "target-preverified-source-failure.db"
    _create_head_db(target)
    with sqlite3.connect(target) as connection:
        connection.execute(
            "UPDATE data_revision SET revision = 77, "
            "updated_at = CURRENT_TIMESTAMP WHERE id = 1"
        )
        connection.commit()
    monkeypatch.setenv(
        "MES_RUNTIME_ROOT",
        str(runtime_dir / "r"),
    )
    rollback = backup_db.backup_sqlite(str(target))
    with sqlite3.connect(target) as connection:
        connection.execute(
            "UPDATE data_revision SET revision = 88, "
            "updated_at = CURRENT_TIMESTAMP WHERE id = 1"
        )
        connection.commit()

    original_verify = restore_db._verify_sqlite_install_snapshot

    def fail_installed_snapshot(
        path: Path,
        manifest: dict[str, object],
    ) -> backup_manifest.BackupVerification:
        if ".installed-" in path.name:
            return backup_manifest.BackupVerification(
                backup_manifest.BackupStatus.FAIL,
                ("injected preverified source postcheck failure",),
                manifest,
            )
        return original_verify(path, manifest)

    monkeypatch.setattr(
        restore_db,
        "_verify_sqlite_install_snapshot",
        fail_installed_snapshot,
    )

    with pytest.raises((RuntimeError, SystemExit)):
        restore_db.restore_sqlite(
            str(rollback),
            str(target),
            run_check=False,
            preverified_rollback=str(rollback),
            offline_target=True,
        )

    with sqlite3.connect(target) as connection:
        assert connection.execute(
            "SELECT revision FROM data_revision WHERE id = 1"
        ).fetchone() == (88,)


def test_restore_operational_target_checks_runtime_tasks_before_and_after_replace(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "source-runtime-restore.db"
    target = runtime_dir / "target-runtime-restore.db"
    _create_head_db(source)
    _create_head_db(target)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-task-restore"))
    candidate = backup_db.backup_sqlite(str(source))
    events: list[str] = []
    original_replace = restore_db._replace_sqlite_atomically

    monkeypatch.setattr(restore_db, "_requires_runtime_recovery_check", lambda _path: True)
    monkeypatch.setattr(
        restore_db,
        "_verify_runtime_recovery",
        lambda: events.append("runtime-check"),
    )
    monkeypatch.setattr(
        restore_db,
        "_enter_runtime_restore_fence",
        lambda: events.append("runtime-fence"),
    )

    def record_replace(*args: object, **kwargs: object) -> None:
        events.append("replace")
        original_replace(*args, **kwargs)

    monkeypatch.setattr(restore_db, "_replace_sqlite_atomically", record_replace)

    restore_db.restore_sqlite(str(candidate), str(target), run_check=False)

    assert events == ["runtime-check", "runtime-fence", "replace", "runtime-check"]


def test_operational_restore_rejects_target_change_after_rollback_snapshot(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "source-runtime-race.db"
    target = runtime_dir / "target-runtime-race.db"
    _create_head_db(source)
    _create_head_db(target)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-race"))
    candidate = backup_db.backup_sqlite(str(source))
    original_replace = restore_db._replace_sqlite_atomically

    monkeypatch.setattr(restore_db, "_requires_runtime_recovery_check", lambda _path: True)
    monkeypatch.setattr(restore_db, "_verify_runtime_recovery", lambda: None)
    monkeypatch.setattr(restore_db, "_enter_runtime_restore_fence", lambda: None)

    def mutate_after_snapshot(*args: object, **kwargs: object) -> None:
        connection = sqlite3.connect(target)
        try:
            connection.execute(
                "UPDATE data_revision SET revision = 99, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
            )
            connection.commit()
        finally:
            connection.close()
        original_replace(*args, **kwargs)

    monkeypatch.setattr(restore_db, "_replace_sqlite_atomically", mutate_after_snapshot)

    with pytest.raises(SystemExit, match="3"):
        restore_db.restore_sqlite(str(candidate), str(target), run_check=False)

    with sqlite3.connect(target) as connection:
        assert connection.execute("SELECT revision FROM data_revision WHERE id = 1").fetchone() == (
            99,
        )


def test_restore_rejects_commit_between_rollback_snapshot_and_target_digest(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "source-rollback-gap.db"
    target = runtime_dir / "target-rollback-gap.db"
    _create_head_db(source)
    _create_head_db(target)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-rollback-gap"))
    candidate = backup_db.backup_sqlite(str(source))
    original_snapshot = restore_db._create_pre_restore_snapshot

    def snapshot_then_commit(
        target_path: Path,
        *,
        integrity_only: bool = False,
    ) -> Path:
        snapshot = original_snapshot(target_path, integrity_only=integrity_only)
        with sqlite3.connect(target) as connection:
            connection.execute(
                "UPDATE data_revision SET revision = 77, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
            )
            connection.commit()
        return snapshot

    monkeypatch.setattr(restore_db, "_create_pre_restore_snapshot", snapshot_then_commit)

    with pytest.raises(SystemExit, match="3"):
        restore_db.restore_sqlite(
            str(candidate),
            str(target),
            run_check=False,
            offline_target=True,
        )

    with sqlite3.connect(target) as connection:
        assert connection.execute("SELECT revision FROM data_revision WHERE id = 1").fetchone() == (
            77,
        )


def test_restore_rejects_commit_after_final_digest_before_writer_fence(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "source-final-digest-gap.db"
    target = runtime_dir / "target-final-digest-gap.db"
    _create_head_db(source)
    _create_head_db(target)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-final-digest-gap"))
    candidate = backup_db.backup_sqlite(str(source))
    original_fence = restore_db._sqlite_writer_fence

    @contextmanager
    def commit_immediately_before_fence(
        path: Path,
    ) -> Iterator[sqlite3.Connection]:
        with sqlite3.connect(target) as connection:
            connection.execute(
                "UPDATE data_revision SET revision = 123, "
                "updated_at = CURRENT_TIMESTAMP WHERE id = 1"
            )
            connection.commit()
        with original_fence(path) as connection:
            yield connection

    monkeypatch.setattr(
        restore_db,
        "_sqlite_writer_fence",
        commit_immediately_before_fence,
    )

    with pytest.raises(SystemExit, match="3"):
        restore_db.restore_sqlite(
            str(candidate),
            str(target),
            run_check=False,
            offline_target=True,
        )

    with sqlite3.connect(target) as connection:
        assert connection.execute(
            "SELECT revision FROM data_revision WHERE id = 1"
        ).fetchone() == (123,)


def test_restore_writer_fence_blocks_commit_between_digest_and_install(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "source-post-quarantine-digest.db"
    target = runtime_dir / "target-post-quarantine-digest.db"
    _create_head_db(source)
    _create_head_db(target)
    with sqlite3.connect(source) as source_connection:
        source_connection.execute(
            "UPDATE data_revision SET revision = 111, "
            "updated_at = CURRENT_TIMESTAMP WHERE id = 1"
        )
        source_connection.commit()
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-post-quarantine"))
    candidate = backup_db.backup_sqlite(str(source))
    original_copy = restore_db._copy_sqlite_into_connection
    writer = sqlite3.connect(target, timeout=0)
    writer.execute("PRAGMA busy_timeout = 0")
    blocked = False
    committed = False

    def attempt_commit_then_copy(
        source_path: Path,
        destination: sqlite3.Connection,
    ) -> None:
        nonlocal blocked, committed
        if not blocked and not committed:
            try:
                writer.execute(
                    "UPDATE data_revision SET revision = 321, "
                    "updated_at = CURRENT_TIMESTAMP WHERE id = 1"
                )
                writer.commit()
            except sqlite3.OperationalError:
                writer.rollback()
                blocked = True
            else:
                committed = True
        original_copy(source_path, destination)

    monkeypatch.setattr(
        restore_db,
        "_copy_sqlite_into_connection",
        attempt_commit_then_copy,
    )

    try:
        restore_db.restore_sqlite(
            str(candidate),
            str(target),
            run_check=False,
            offline_target=True,
        )
    finally:
        writer.close()

    assert blocked is True
    assert committed is False
    with sqlite3.connect(target) as connection:
        assert connection.execute(
            "SELECT revision FROM data_revision WHERE id = 1"
        ).fetchone() == (111,)


def test_new_sqlite_target_race_preserves_competing_wal_database(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    source = runtime_dir / "source-new-target-race.db"
    target = runtime_dir / "target-new-target-race.db"
    _create_head_db(source)
    with sqlite3.connect(source) as connection:
        connection.execute(
            "UPDATE data_revision SET revision = 515, "
            "updated_at = CURRENT_TIMESTAMP WHERE id = 1"
        )
        connection.commit()
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-new-target-race"))
    candidate = backup_db.backup_sqlite(str(source))
    initial_sidecars = {
        Path(f"{target}-wal"): b"initial stale wal",
        Path(f"{target}-shm"): b"initial stale shm",
        Path(f"{target}-journal"): b"initial stale journal",
    }
    for sidecar, payload in initial_sidecars.items():
        sidecar.write_bytes(payload)
    original_link = restore_db.os.link
    competing_bytes: dict[Path, bytes] = {}

    def create_competing_target_before_atomic_claim(
        source_path: str | Path,
        target_path: str | Path,
    ) -> None:
        if not competing_bytes and Path(target_path) == target:
            subprocess.run(
                [
                    sys.executable,
                    "-c",
                    (
                        "import os, sqlite3, sys\n"
                        "from pathlib import Path\n"
                        "target = Path(sys.argv[1])\n"
                        "for suffix in ('-wal', '-shm', '-journal'):\n"
                        "    Path(f'{target}{suffix}').unlink(missing_ok=True)\n"
                        "connection = sqlite3.connect(target)\n"
                        "connection.execute('PRAGMA journal_mode = WAL').fetchone()\n"
                        "connection.execute('PRAGMA wal_autocheckpoint = 0')\n"
                        "connection.execute("
                        "'CREATE TABLE race_sentinel (value TEXT NOT NULL)')\n"
                        "connection.execute("
                        "\"INSERT INTO race_sentinel VALUES ('competing-wal-commit')\")\n"
                        "connection.commit()\n"
                        "os._exit(0)\n"
                    ),
                    str(target),
                ],
                check=True,
            )
            Path(f"{target}-journal").write_bytes(b"competing journal sentinel")
            for competing_path in (
                target,
                Path(f"{target}-wal"),
                Path(f"{target}-shm"),
                Path(f"{target}-journal"),
            ):
                assert competing_path.is_file()
                competing_bytes[competing_path] = competing_path.read_bytes()
        original_link(source_path, target_path)

    monkeypatch.setattr(
        restore_db.os,
        "link",
        create_competing_target_before_atomic_claim,
    )

    with pytest.raises(SystemExit, match="3"):
        restore_db.restore_sqlite(str(candidate), str(target), run_check=False)

    assert "RESTORE_RESULT=TARGET_CHANGED_AFTER_ROLLBACK" in capsys.readouterr().err
    for competing_path, payload in competing_bytes.items():
        assert competing_path.read_bytes() == payload
    with sqlite3.connect(target) as connection:
        assert connection.execute("SELECT value FROM race_sentinel").fetchone() == (
            "competing-wal-commit",
        )


def test_new_sqlite_target_postcheck_failure_restores_initial_sidecars(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "source-new-target-postcheck.db"
    target = runtime_dir / "target-new-target-postcheck.db"
    _create_head_db(source)
    monkeypatch.setenv(
        "MES_RUNTIME_ROOT",
        str(runtime_dir / "runtime-new-target-postcheck"),
    )
    candidate = backup_db.backup_sqlite(str(source))
    initial_sidecars = {
        Path(f"{target}-wal"): b"initial stale wal",
        Path(f"{target}-shm"): b"initial stale shm",
        Path(f"{target}-journal"): b"initial stale journal",
    }
    for sidecar, payload in initial_sidecars.items():
        sidecar.write_bytes(payload)
    monkeypatch.setattr(
        restore_db,
        "_verify_sqlite_install_snapshot",
        lambda *_args: backup_manifest.BackupVerification(
            backup_manifest.BackupStatus.FAIL,
            ("injected new-target postcheck failure",),
        ),
    )

    with pytest.raises(SystemExit):
        restore_db.restore_sqlite(str(candidate), str(target), run_check=False)

    assert not target.exists()
    for sidecar, payload in initial_sidecars.items():
        assert sidecar.read_bytes() == payload


def test_new_sqlite_target_sidecar_quarantine_failure_restores_initial_state(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "source-sidecar-fail.db"
    target = runtime_dir / "target-sidecar-fail.db"
    _create_head_db(source)
    monkeypatch.setenv(
        "MES_RUNTIME_ROOT",
        str(runtime_dir / "rt-sidecar-fail"),
    )
    candidate = backup_db.backup_sqlite(str(source))
    initial_sidecars = {
        Path(f"{target}-wal"): b"initial stale wal",
        Path(f"{target}-shm"): b"initial stale shm",
        Path(f"{target}-journal"): b"initial stale journal",
    }
    for sidecar, payload in initial_sidecars.items():
        sidecar.write_bytes(payload)
    original_replace = restore_db.os.replace

    def fail_second_sidecar_quarantine(
        source_path: str | Path,
        destination_path: str | Path,
    ) -> None:
        source_candidate = Path(source_path)
        destination_candidate = Path(destination_path)
        if (
            source_candidate == Path(f"{target}-shm")
            and ".quarantine-" in destination_candidate.name
        ):
            raise OSError("injected sidecar quarantine failure")
        original_replace(source_path, destination_path)

    monkeypatch.setattr(restore_db.os, "replace", fail_second_sidecar_quarantine)

    with pytest.raises(OSError, match="injected sidecar quarantine failure"):
        restore_db.restore_sqlite(str(candidate), str(target), run_check=False)

    assert not target.exists()
    for sidecar, payload in initial_sidecars.items():
        assert sidecar.read_bytes() == payload
    assert not list(target.parent.glob(f".{target.name}.*"))


def test_sqlite_restore_installs_new_target_when_it_remains_absent(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "source-new-target.db"
    target = runtime_dir / "target-new-target.db"
    _create_head_db(source)
    with sqlite3.connect(source) as connection:
        connection.execute(
            "UPDATE data_revision SET revision = 616, "
            "updated_at = CURRENT_TIMESTAMP WHERE id = 1"
        )
        connection.commit()
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-new-target"))
    candidate = backup_db.backup_sqlite(str(source))
    stale_sidecars = [
        Path(f"{target}-wal"),
        Path(f"{target}-shm"),
        Path(f"{target}-journal"),
    ]
    for sidecar in stale_sidecars:
        sidecar.write_bytes(f"stale {sidecar.suffix}".encode())

    restore_db.restore_sqlite(str(candidate), str(target), run_check=False)

    with sqlite3.connect(target) as connection:
        assert connection.execute(
            "SELECT revision FROM data_revision WHERE id = 1"
        ).fetchone() == (616,)
    assert all(not sidecar.exists() for sidecar in stale_sidecars)


@pytest.mark.parametrize(
    "rollback_failure",
    ["copy", "digest"],
)
def test_sqlite_failed_rollback_preserves_private_recovery_snapshot(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
    rollback_failure: str,
) -> None:
    staged = runtime_dir / f"rollback-failure-{rollback_failure}-source.db"
    target = runtime_dir / f"rollback-failure-{rollback_failure}-target.db"
    _create_head_db(staged)
    _create_head_db(target)
    with sqlite3.connect(staged) as connection:
        connection.execute(
            "UPDATE data_revision SET revision = 818, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
        )
        connection.commit()
    expected_digest = restore_db._sqlite_snapshot_digest(target)

    if rollback_failure == "copy":
        original_copy = restore_db._copy_sqlite_into_connection
        copy_calls = 0

        def fail_rollback_copy(
            source_path: Path,
            destination: sqlite3.Connection,
        ) -> None:
            nonlocal copy_calls
            copy_calls += 1
            if copy_calls == 2:
                raise OSError("injected rollback copy failure")
            original_copy(source_path, destination)

        monkeypatch.setattr(
            restore_db,
            "_copy_sqlite_into_connection",
            fail_rollback_copy,
        )
    else:
        original_digest = restore_db._sqlite_connection_snapshot_digest
        digest_calls = 0

        def fail_rollback_digest(
            connection: sqlite3.Connection,
            anchor_path: Path,
        ) -> str:
            nonlocal digest_calls
            digest_calls += 1
            digest = original_digest(connection, anchor_path)
            return "0" * 64 if digest_calls == 2 else digest

        monkeypatch.setattr(
            restore_db,
            "_sqlite_connection_snapshot_digest",
            fail_rollback_digest,
        )

    def fail_postcheck(_snapshot: Path) -> None:
        raise backup_manifest.BackupValidationError("injected installed postcheck failure")

    with pytest.raises(RuntimeError, match="private rollback retained"):
        restore_db._replace_existing_sqlite_under_writer_fence(
            staged,
            target,
            expected_target_digest=expected_digest,
            postcheck=fail_postcheck,
        )

    retained = list(target.parent.glob(f".{target.name}.failure-rollback-*.tmp"))
    assert len(retained) == 1
    assert backup_manifest.file_sha256(retained[0]) == expected_digest


def test_sqlite_success_is_not_reversed_by_private_temp_cleanup_failure(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    source = runtime_dir / "cleanup-success-source.db"
    target = runtime_dir / "cleanup-success-target.db"
    _create_head_db(source)
    original_remove = restore_db._remove_sqlite_files

    def fail_staged_cleanup(path: Path) -> None:
        if ".restore-" in path.name:
            raise OSError("injected private temp cleanup failure")
        original_remove(path)

    monkeypatch.setattr(restore_db, "_remove_sqlite_files", fail_staged_cleanup)

    restore_db._replace_sqlite_atomically(
        source,
        target,
        source_integrity_only=True,
    )

    assert target.is_file()
    assert "RESTORE_CLEANUP_PENDING=" in capsys.readouterr().err


def test_structural_rollback_requires_structural_pair_and_preserves_a_rollback_pair(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    legacy = runtime_dir / "legacy-rollback-source.db"
    target = runtime_dir / "structural-rollback-target.db"
    with sqlite3.connect(legacy) as connection:
        connection.execute("CREATE TABLE legacy_items (id INTEGER PRIMARY KEY, name TEXT)")
        connection.execute("INSERT INTO legacy_items (name) VALUES ('before-migration')")
        connection.commit()
    _create_head_db(target)
    runtime_root = runtime_dir / "runtime-structural-rollback"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    structural = backup_db.backup_sqlite(str(legacy), integrity_only=True)

    restore_db.restore_sqlite(
        str(structural),
        str(target),
        run_check=False,
        structural_rollback=True,
        offline_target=True,
    )

    with sqlite3.connect(target) as connection:
        assert connection.execute("SELECT name FROM legacy_items").fetchone() == (
            "before-migration",
        )
    rollbacks = list(
        (runtime_root / "backups" / "sqlite").glob("mes-before-pre-restore-*.db")
    )
    assert len(rollbacks) == 1
    receipt = backup_manifest.verify_manifest_receipt(
        rollbacks[0],
        expected_engine="sqlite",
    )
    assert receipt.status is backup_manifest.BackupStatus.STRUCTURAL_ONLY


def test_structural_rollback_rejects_manifestless_legacy_source(
    runtime_dir: Path,
) -> None:
    legacy = runtime_dir / "manifestless-legacy.db"
    target = runtime_dir / "legacy-rejection-target.db"
    with sqlite3.connect(legacy) as connection:
        connection.execute("CREATE TABLE legacy_items (id INTEGER PRIMARY KEY)")
        connection.commit()
    _create_head_db(target)
    target_before = _sha256(target)

    with pytest.raises(SystemExit):
        restore_db.restore_sqlite(
            str(legacy),
            str(target),
            run_check=False,
            structural_rollback=True,
            offline_target=True,
        )

    assert _sha256(target) == target_before


def test_existing_noncanonical_sqlite_target_requires_offline_assertion(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "offline-assertion-source.db"
    target = runtime_dir / "offline-assertion-target.db"
    _create_head_db(source)
    _create_head_db(target)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-offline-assertion"))
    candidate = backup_db.backup_sqlite(str(source))
    target_before = _sha256(target)

    with pytest.raises(SystemExit, match="2"):
        restore_db.restore_sqlite(str(candidate), str(target), run_check=False)

    assert _sha256(target) == target_before


def test_sqlite_restore_installs_the_private_receipt_bytes_not_a_mutated_source(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "immutable-sqlite-source.db"
    target = runtime_dir / "immutable-sqlite-target.db"
    _create_head_db(source)
    _create_head_db(target)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-immutable-sqlite"))
    candidate = backup_db.backup_sqlite(str(source))
    original_copy = restore_db.shutil.copy2
    marker = b"IC18_MUTATED_AFTER_RECEIPT"

    def mutate_at_copy_boundary(
        source_path: str | Path,
        target_path: str | Path,
        *args: object,
        **kwargs: object,
    ) -> Path:
        source_file = Path(source_path)
        target_file = Path(target_path)
        if source_file == candidate:
            if target_file.parent == target.parent:
                with candidate.open("ab") as handle:
                    handle.write(marker)
                return Path(original_copy(source_file, target_file, *args, **kwargs))
            copied = Path(original_copy(source_file, target_file, *args, **kwargs))
            with candidate.open("ab") as handle:
                handle.write(marker)
            return copied
        return Path(original_copy(source_file, target_file, *args, **kwargs))

    monkeypatch.setattr(restore_db.shutil, "copy2", mutate_at_copy_boundary)

    restore_db.restore_sqlite(
        str(candidate),
        str(target),
        run_check=False,
        offline_target=True,
    )

    assert not target.read_bytes().endswith(marker)


def test_retention_removes_complete_pairs_without_orphans(runtime_dir: Path) -> None:
    backup_dir = runtime_dir / "retention"
    backup_dir.mkdir()
    artifacts: list[Path] = []
    for index in range(3):
        artifact = backup_dir / f"mes_20260904_00000{index}_000000_{index:032x}.db"
        _create_valid_retention_pair(artifact)
        assert (
            backup_manifest.verify_sqlite_backup(artifact).status
            is backup_manifest.BackupStatus.PASS
        )
        os.utime(artifact, (index + 1, index + 1))
        os.utime(backup_manifest.manifest_path_for(artifact), (index + 1, index + 1))
        artifacts.append(artifact)

    removed = retain_latest_backups(backup_dir, suffix=".db", keep=1)

    assert removed == [artifacts[1], artifacts[0]]
    assert artifacts[2].is_file()
    assert backup_manifest.manifest_path_for(artifacts[2]).is_file()
    for artifact in artifacts[:2]:
        assert not artifact.exists()
        assert not backup_manifest.manifest_path_for(artifact).exists()
    assert not [
        path
        for path in backup_dir.glob("mes_*")
        if path.name.endswith(".manifest.json")
        and not path.with_name(path.name.removesuffix(".manifest.json")).exists()
    ]


def test_retention_ignores_manifestless_legacy_or_inflight_artifact(
    runtime_dir: Path,
) -> None:
    backup_dir = runtime_dir / "retention-inflight"
    backup_dir.mkdir()
    artifact = (
        backup_dir
        / "mes_20260904_000000_000000_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.db"
    )
    artifact.write_bytes(b"artifact-awaiting-manifest")

    removed = retain_latest_backups(backup_dir, suffix=".db", keep=0)

    assert removed == []
    assert artifact.is_file()


def test_retention_invalid_newest_pair_cannot_evict_last_valid_backup(
    runtime_dir: Path,
) -> None:
    backup_dir = runtime_dir / "retention-invalid-newest"
    backup_dir.mkdir()
    valid = (
        backup_dir
        / "mes_20260904_000000_000000_dddddddddddddddddddddddddddddddd.db"
    )
    invalid = (
        backup_dir
        / "mes_20260904_000001_000000_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.db"
    )
    _create_valid_retention_pair(valid)
    _create_valid_retention_pair(invalid)
    invalid.write_bytes(b"tampered-after-receipt")
    os.utime(valid, (1, 1))
    os.utime(invalid, (2, 2))

    removed = retain_latest_backups(backup_dir, suffix=".db", keep=1)

    assert removed == []
    assert valid.is_file()
    assert backup_manifest.manifest_path_for(valid).is_file()


@pytest.mark.parametrize(
    "missing_field",
    ["database", "source_snapshot", "runtime_recovery"],
)
def test_retention_incomplete_newest_receipt_cannot_evict_valid_backup(
    runtime_dir: Path,
    missing_field: str,
) -> None:
    backup_dir = runtime_dir / f"retention-incomplete-{missing_field}"
    backup_dir.mkdir()
    valid = (
        backup_dir
        / "mes_20260904_000000_000000_ffffffffffffffffffffffffffffffff.db"
    )
    incomplete = (
        backup_dir
        / "mes_20260904_000001_000000_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.db"
    )
    _create_valid_retention_pair(valid)
    _create_valid_retention_pair(incomplete)
    incomplete_manifest = backup_manifest.manifest_path_for(incomplete)
    payload = json.loads(incomplete_manifest.read_text(encoding="utf-8"))
    del payload[missing_field]
    incomplete_manifest.write_text(json.dumps(payload), encoding="utf-8")
    os.utime(valid, (1, 1))
    os.utime(incomplete, (2, 2))

    removed = retain_latest_backups(backup_dir, suffix=".db", keep=1)

    assert removed == []
    assert valid.is_file()
    assert backup_manifest.manifest_path_for(valid).is_file()


def test_retention_cleanup_failure_leaves_a_retryable_recovery_receipt(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    backup_dir = runtime_dir / "retention-recovery"
    backup_dir.mkdir()
    artifact = (
        backup_dir
        / "mes_20260904_000000_000000_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.db"
    )
    _create_valid_retention_pair(artifact)
    original_unlink = Path.unlink
    injected = False

    def fail_first_quarantine_cleanup(
        path: Path,
        *,
        missing_ok: bool = False,
    ) -> None:
        nonlocal injected
        if ".removing-" in path.name and not injected:
            injected = True
            raise OSError("injected retention cleanup failure")
        original_unlink(path, missing_ok=missing_ok)

    monkeypatch.setattr(Path, "unlink", fail_first_quarantine_cleanup)
    with pytest.raises(OSError, match="retention cleanup"):
        retain_latest_backups(backup_dir, suffix=".db", keep=0)

    receipts = list(
        backup_dir.glob(f"{backup_retention.RECOVERY_RECEIPT_PREFIX}*.json")
    )
    assert len(receipts) == 1
    assert list(backup_dir.glob(".*.removing-*.tmp"))

    monkeypatch.setattr(Path, "unlink", original_unlink)
    retain_latest_backups(backup_dir, suffix=".db", keep=0)

    assert not list(
        backup_dir.glob(f"{backup_retention.RECOVERY_RECEIPT_PREFIX}*.json")
    )
    assert not list(backup_dir.glob(".*.removing-*.tmp"))


@pytest.mark.parametrize(
    "mutation",
    [
        "malformed-receipt-token",
        "duplicate-original",
        "substituted-original",
        "mismatched-quarantine-token",
    ],
)
def test_retention_recovery_rejects_unbound_receipt_without_mutation(
    runtime_dir: Path,
    mutation: str,
) -> None:
    backup_dir = runtime_dir / f"retention-unbound-{mutation}"
    backup_dir.mkdir()
    token = "2" * 32
    artifact = (
        backup_dir
        / "mes_20260904_000000_000000_22222222222222222222222222222222.db"
    )
    manifest = backup_retention.manifest_path_for(artifact)
    protected = (
        backup_dir
        / "mes_20260904_000001_000000_33333333333333333333333333333333.db"
    )
    protected_manifest = backup_retention.manifest_path_for(protected)
    for path, content in (
        (artifact, b"artifact"),
        (manifest, b"manifest"),
        (protected, b"protected"),
        (protected_manifest, b"protected-manifest"),
    ):
        path.write_bytes(content)
    quarantined_artifact = backup_dir / f".{artifact.name}.removing-{token}.tmp"
    quarantined_manifest = backup_dir / f".{manifest.name}.removing-{token}.tmp"
    receipt_token = "invalid" if mutation == "malformed-receipt-token" else token
    receipt = backup_dir / (
        f"{backup_retention.RECOVERY_RECEIPT_PREFIX}{receipt_token}.json"
    )
    mappings = [
        {"original": manifest.name, "quarantined": quarantined_manifest.name},
        {"original": artifact.name, "quarantined": quarantined_artifact.name},
    ]
    if mutation == "duplicate-original":
        mappings[0]["original"] = artifact.name
    elif mutation == "substituted-original":
        mappings[0]["original"] = protected_manifest.name
    elif mutation == "mismatched-quarantine-token":
        mappings[1]["quarantined"] = quarantined_artifact.name.replace(
            token,
            "4" * 32,
        )
    receipt.write_text(
        json.dumps(
            {
                "contract": "backup-retention-recovery/v1",
                "state": "cleanup_required",
                "owner": {"pid": 999_999_999, "started_at_ns": 1},
                "mappings": mappings,
            }
        ),
        encoding="utf-8",
    )
    before = {
        path: path.read_bytes()
        for path in (artifact, manifest, protected, protected_manifest)
    }

    with pytest.raises(OSError, match="invalid retention cleanup receipt"):
        backup_retention._recover_cleanup_receipts(backup_dir)

    assert {path: path.read_bytes() for path in before} == before


def test_retention_recovery_converges_after_second_cleanup_failure(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    backup_dir = runtime_dir / "retention-second-failure"
    backup_dir.mkdir()
    token = "5" * 32
    artifact = (
        backup_dir
        / "mes_20260904_000000_000000_55555555555555555555555555555555.db"
    )
    manifest = backup_retention.manifest_path_for(artifact)
    quarantined_artifact = backup_dir / f".{artifact.name}.removing-{token}.tmp"
    quarantined_manifest = backup_dir / f".{manifest.name}.removing-{token}.tmp"
    quarantined_artifact.write_bytes(b"quarantined-artifact")
    quarantined_manifest.write_bytes(b"quarantined-manifest")
    receipt = backup_dir / f"{backup_retention.RECOVERY_RECEIPT_PREFIX}{token}.json"
    backup_retention._write_recovery_receipt(
        receipt,
        [(manifest, quarantined_manifest), (artifact, quarantined_artifact)],
        state="cleanup_required",
    )
    original_unlink = backup_retention._durable_unlink
    injected = False

    def fail_second_cleanup(path: Path, *, missing_ok: bool = False) -> None:
        nonlocal injected
        if path == quarantined_artifact and not injected:
            injected = True
            raise OSError("injected second retention recovery failure")
        original_unlink(path, missing_ok=missing_ok)

    monkeypatch.setattr(backup_retention, "_durable_unlink", fail_second_cleanup)
    with pytest.raises(OSError, match="second retention recovery failure"):
        backup_retention._recover_cleanup_receipt(receipt, force=True)

    assert receipt.is_file()
    monkeypatch.setattr(backup_retention, "_durable_unlink", original_unlink)
    backup_retention._recover_cleanup_receipts(backup_dir)

    assert not receipt.exists()
    assert not quarantined_artifact.exists()
    assert not quarantined_manifest.exists()


def test_retention_interleaving_skips_active_owner_and_finishes_without_orphans(
    runtime_dir: Path,
) -> None:
    backup_dir = runtime_dir / "retention-interleaving"
    backup_dir.mkdir()
    artifact = (
        backup_dir
        / "mes_20260904_000000_000000_cccccccccccccccccccccccccccccccc.db"
    )
    manifest = backup_retention.manifest_path_for(artifact)
    artifact.write_bytes(b"active-retention-artifact")
    manifest.write_text('{"contract":"backup-manifest/v1"}', encoding="utf-8")
    token = "6" * 32
    quarantined_artifact = backup_dir / f".{artifact.name}.removing-{token}.tmp"
    quarantined_manifest = backup_dir / f".{manifest.name}.removing-{token}.tmp"
    receipt = backup_dir / f"{backup_retention.RECOVERY_RECEIPT_PREFIX}{token}.json"
    mappings = [
        (manifest, quarantined_manifest),
        (artifact, quarantined_artifact),
    ]

    backup_retention._write_recovery_receipt(receipt, mappings, state="removing")
    os.replace(manifest, quarantined_manifest)

    backup_retention._recover_cleanup_receipts(backup_dir)

    assert receipt.is_file()
    assert artifact.is_file()
    assert not manifest.exists()
    assert quarantined_manifest.is_file()

    os.replace(artifact, quarantined_artifact)
    backup_retention._write_recovery_receipt(
        receipt,
        mappings,
        state="cleanup_required",
    )
    backup_retention._recover_cleanup_receipts(backup_dir)

    assert not receipt.exists()
    assert not artifact.exists()
    assert not manifest.exists()
    assert not quarantined_artifact.exists()
    assert not quarantined_manifest.exists()


def test_retention_fence_serializes_nested_pair_removal_without_orphans(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    backup_dir = runtime_dir / "retention-fence"
    backup_dir.mkdir()
    artifacts: list[Path] = []
    for index in range(2):
        artifact = (
            backup_dir
            / f"mes_20260904_00000{index}_000000_{index:032x}.db"
        )
        _create_valid_retention_pair(artifact)
        os.utime(artifact, (index + 1, index + 1))
        artifacts.append(artifact)
    victim = artifacts[0]
    victim_manifest = backup_retention.manifest_path_for(victim)
    original_replace = backup_retention._durable_replace
    nested_removed: list[Path] | None = None

    def interleave_after_first_pair_move(source: str | Path, target: str | Path) -> None:
        nonlocal nested_removed
        original_replace(source, target)
        if Path(source) == victim_manifest and nested_removed is None:
            nested_removed = retain_latest_backups(backup_dir, suffix=".db", keep=1)

    monkeypatch.setattr(
        backup_retention,
        "_durable_replace",
        interleave_after_first_pair_move,
    )

    removed = retain_latest_backups(backup_dir, suffix=".db", keep=1)

    assert nested_removed == []
    assert removed == [victim]
    assert not victim.exists()
    assert not victim_manifest.exists()
    assert artifacts[1].is_file()
    assert backup_retention.manifest_path_for(artifacts[1]).is_file()
    assert not list(backup_dir.glob(".*.removing-*.tmp"))
    assert not list(backup_dir.glob(f"{backup_retention.RECOVERY_RECEIPT_PREFIX}*.json"))
    assert not (backup_dir / backup_retention.RETENTION_FENCE_NAME).exists()


def test_retention_os_lock_prevents_stale_fence_reclaim_race_across_processes(
    runtime_dir: Path,
) -> None:
    backup_dir = runtime_dir / "retention-process-lock"
    backup_dir.mkdir()
    stale_fence = backup_dir / backup_retention.RETENTION_FENCE_NAME
    stale_payload = {
        "contract": backup_retention.RETENTION_FENCE_CONTRACT,
        "fence_id": "stale-owner",
        "owner": {"pid": 999_999_999, "started_at_ns": 1},
    }
    stale_fence.write_text(json.dumps(stale_payload), encoding="utf-8")
    descriptor = backup_retention._try_acquire_retention_operation_lock(backup_dir)
    assert descriptor is not None
    try:
        code = (
            "from pathlib import Path; "
            "from scripts.ops.backup_retention import retain_latest_backups; "
            f"print(retain_latest_backups(Path({str(backup_dir)!r}), suffix='.db', keep=0))"
        )
        result = subprocess.run(
            [sys.executable, "-c", code],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
    finally:
        backup_retention._release_retention_operation_lock(descriptor)

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "[]"
    assert json.loads(stale_fence.read_text(encoding="utf-8"))["fence_id"] == "stale-owner"


def test_retention_reclaims_partial_fence_after_hard_crash(
    runtime_dir: Path,
) -> None:
    backup_dir = runtime_dir / "partial-retention-fence"
    backup_dir.mkdir()
    fence = backup_dir / backup_retention.RETENTION_FENCE_NAME
    fence.write_bytes(b'{"contract":"backup-retention-fence/v1"')

    assert retain_latest_backups(backup_dir, suffix=".db", keep=10) == []
    assert not fence.exists()
    assert retain_latest_backups(backup_dir, suffix=".db", keep=10) == []


def test_nas_publication_copies_artifact_and_manifest_as_one_pair(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_db = runtime_dir / "nas-source.db"
    _create_head_db(source_db)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-nas-source"))
    source = backup_db.backup_sqlite(str(source_db))
    nas_dir = runtime_dir / "nas"

    published = backup_to_nas.publish_existing_backup(source, nas_dir, keep=3)

    assert published.is_file()
    assert backup_manifest.manifest_path_for(published).is_file()
    verification = backup_manifest.verify_sqlite_backup(published)
    assert verification.status == backup_manifest.BackupStatus.PASS


def test_nas_rechecks_copied_manifest_receipt_after_source_verification(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_db = runtime_dir / "nas-receipt-source.db"
    _create_head_db(source_db)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-nas-receipt"))
    source = backup_db.backup_sqlite(str(source_db))
    source_manifest = backup_manifest.manifest_path_for(source)
    nas_dir = runtime_dir / "nas-receipt"
    original_copy = backup_to_nas.shutil.copy2

    def mutate_manifest_before_copy(
        source_path: str | Path,
        target_path: str | Path,
    ) -> str:
        if Path(source_path) == source_manifest:
            payload = json.loads(source_manifest.read_text(encoding="utf-8"))
            payload["artifact"]["sha256"] = "0" * 64
            source_manifest.write_text(json.dumps(payload), encoding="utf-8")
        return str(original_copy(source_path, target_path))

    monkeypatch.setattr(backup_to_nas.shutil, "copy2", mutate_manifest_before_copy)

    with pytest.raises(ValueError, match="receipt"):
        backup_to_nas.publish_existing_backup(source, nas_dir, keep=3)

    assert not list(nas_dir.glob("mes_*.db"))
    assert not list(nas_dir.glob("mes_*.manifest.json"))


def test_nas_manifest_publication_failure_leaves_no_public_half_pair(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_db = runtime_dir / "nas-failure-source.db"
    _create_head_db(source_db)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-nas-failure"))
    source = backup_db.backup_sqlite(str(source_db))
    nas_dir = runtime_dir / "nas-failure"
    original_replace = backup_manifest._durable_replace

    def fail_manifest_replace(source_path: str | Path, target_path: str | Path) -> None:
        if str(target_path).endswith(".manifest.json"):
            raise OSError("injected NAS manifest publication failure")
        original_replace(source_path, target_path)

    monkeypatch.setattr(backup_manifest, "_durable_replace", fail_manifest_replace)

    with pytest.raises(OSError, match="NAS manifest"):
        backup_to_nas.publish_existing_backup(source, nas_dir, keep=3)

    assert not list(nas_dir.glob("mes_*.db"))
    assert not list(nas_dir.glob("mes_*.manifest.json"))


def test_runtime_task_recovery_verifier_checks_registration_contract() -> None:
    script = ROOT / "scripts" / "dev" / "verify-runtime-tasks.ps1"

    source = script.read_text(encoding="utf-8")

    assert "Assert-RuntimeTasksConfigured" in source
    assert "runtime-task-control.ps1" in source


def _run_verify_backup(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "ops" / "_verify_backup.py"), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def test_verify_cli_reports_pass_and_legacy_with_distinct_exit_codes(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "verify-cli-source.db"
    legacy = runtime_dir / "verify-cli-legacy.db"
    _create_head_db(source)
    _create_head_db(legacy)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-verify-cli"))
    artifact = backup_db.backup_sqlite(str(source))

    passed = _run_verify_backup(str(artifact))
    legacy_result = _run_verify_backup(str(legacy))

    assert passed.returncode == 0, passed.stdout + passed.stderr
    assert "BACKUP_STATUS=PASS" in passed.stdout
    assert legacy_result.returncode == 3
    assert "BACKUP_STATUS=LEGACY_UNVERIFIED" in legacy_result.stdout


def test_verify_cli_database_mode_validates_live_db_without_a_manifest(
    runtime_dir: Path,
) -> None:
    database = runtime_dir / "live-database.db"
    _create_head_db(database)

    result = _run_verify_backup("--database", str(database))

    assert result.returncode == 0, result.stdout + result.stderr
    assert "DATABASE_STATUS=PASS" in result.stdout
    assert not backup_manifest.manifest_path_for(database).exists()


def test_verify_cli_missing_database_does_not_create_a_file(runtime_dir: Path) -> None:
    missing = runtime_dir / "missing.db"

    result = _run_verify_backup(str(missing))

    assert result.returncode == 1
    assert "BACKUP_STATUS=FAIL" in result.stdout
    assert not missing.exists()


def test_operational_readiness_detects_wal_only_stale_backup_even_when_mtime_looks_fresh(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "readiness-source.db"
    _create_head_db(source)
    runtime_root = runtime_dir / "runtime-readiness"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))

    writer = sqlite3.connect(source)
    try:
        assert writer.execute("PRAGMA journal_mode=WAL").fetchone() == ("wal",)
        writer.execute("PRAGMA wal_autocheckpoint=0")
        artifact = backup_db.backup_sqlite(str(source))
        future = artifact.stat().st_mtime + 3600
        os.utime(artifact, (future, future))
        writer.execute(
            "UPDATE data_revision SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
        )
        writer.commit()
        assert Path(f"{source}-wal").is_file()

        ready = operational_readiness.check_latest_backup(
            source,
            artifact.parent,
            max_age_hours=24 * 365,
        )
    finally:
        writer.close()

    assert ready is False


@pytest.mark.parametrize(
    "relative_path",
    [
        "scripts/ops/employee_schema_preflight.py",
        "scripts/dev/sync-to-employee.ps1",
        "scripts/dev/sync-from-employee-data.ps1",
    ],
)
def test_live_database_backup_consumers_use_explicit_database_mode(relative_path: str) -> None:
    source = (ROOT / relative_path).read_text(encoding="utf-8")

    assert "--database" in source


def test_employee_sync_deploys_runtime_restore_verifier_and_uses_structural_backup() -> None:
    source = (ROOT / "scripts" / "dev" / "sync-to-employee.ps1").read_text(
        encoding="utf-8"
    )

    assert '"verify-runtime-tasks.ps1"' in source
    assert '@($backupTool, "--sqlite", $EmpDb, "--integrity-only")' in source
    assert "--structural-rollback" in source


def test_employee_data_sync_publishes_migrated_candidate_before_install() -> None:
    source = (ROOT / "scripts" / "dev" / "sync-from-employee-data.ps1").read_text(
        encoding="utf-8"
    )

    publication = source.index("$verifiedCandidate = Invoke-DatabaseBackup")
    install = source.index("-Source $verifiedCandidate.Path")
    assert publication < install


def _postgres_evidence(snapshot_hash: str = "1" * 64) -> dict[str, object]:
    inventory = {
        "contract": "inventory-integrity/v1",
        "status": "pass",
        "blocking_count": 0,
        "warning_count": 0,
        "checks": [],
    }
    return {
        "engine": "postgresql",
        "alembic_revision": "20260831_0033",
        "schema_fingerprint": "2" * 64,
        "data_revision": {"revision": 7, "updated_at": "2026-09-04T00:00:00"},
        "snapshot_hash": snapshot_hash,
        "oracle_hash": "3" * 64,
        "snapshot_metadata": {"server_version": "16.15"},
        "verification": {
            "status": "PASS",
            "schema": "PASS",
            "sqlite_integrity": "NOT_APPLICABLE",
            "foreign_keys": "PASS",
            "inventory": inventory,
        },
    }


def test_postgres_backup_validates_temporary_restore_before_manifest_publication(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime_root = runtime_dir / "runtime-postgres-backup"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    events: list[str] = []

    def fake_pg_dump(command: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(command, 0, stdout="-- verified dump\n", stderr="")

    def validate_dump(*args: object, **kwargs: object) -> dict[str, object]:
        events.append("temporary-restore-verify")
        return _postgres_evidence()

    original_publish = backup_db.publish_backup_pair

    def record_publish(*args: object, **kwargs: object) -> Path:
        events.append("publish")
        return original_publish(*args, **kwargs)

    monkeypatch.setattr(backup_db.subprocess, "run", fake_pg_dump)
    monkeypatch.setattr(backup_db, "_validate_postgres_dump", validate_dump, raising=False)
    monkeypatch.setattr(backup_db, "publish_backup_pair", record_publish)

    artifact = backup_db.backup_postgres(None, "localhost", 5432, "mes_user", "test_source")

    assert events == ["temporary-restore-verify", "publish"]
    assert artifact.is_file()
    assert backup_manifest.manifest_path_for(artifact).is_file()
    manifest = _load_manifest(artifact)
    assert manifest["database"]["engine"] == "postgresql"
    assert manifest["verification"]["status"] == "PASS"


def test_postgres_restore_never_drops_target_before_temporary_restore_validation(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    artifact = runtime_dir / "mes_20260904_000000_000000_cccccccccccccccccccccccccccccccc.sql"
    artifact.write_text("-- staged dump\n", encoding="utf-8")
    manifest = backup_manifest.build_manifest(
        artifact,
        published_name=artifact.name,
        evidence=_postgres_evidence(),
        source_snapshot={"method": "pg_dump", "transaction_snapshot": True},
    )
    backup_manifest.manifest_path_for(artifact).write_text(
        json.dumps(manifest),
        encoding="utf-8",
    )
    commands: list[list[str]] = []

    def fail_temporary_restore(*args: object, **kwargs: object) -> dict[str, object]:
        raise backup_manifest.BackupValidationError("injected temporary restore failure")

    def record_command(command: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        commands.append(command)
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

    monkeypatch.setattr(
        restore_db,
        "_collect_fenced_postgres_candidate_evidence",
        fail_temporary_restore,
    )
    @contextmanager
    def operation_scope(*_args: object, **_kwargs: object) -> Iterator[tuple[object, str, Path, Path]]:
        yield (
            object(),
            "cluster-123",
            runtime_dir / "early-recovery.json",
            runtime_dir / "operation.json",
        )

    monkeypatch.setattr(restore_db, "_postgres_restore_operation_scope", operation_scope)
    monkeypatch.setattr(
        restore_db,
        "_claim_postgres_restore_operation_locked",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        restore_db,
        "_require_postgres_system_identifier",
        lambda *_args: None,
    )
    monkeypatch.setattr(
        restore_db,
        "_record_postgres_restore_candidate_oid",
        lambda *_args, **_kwargs: 707,
    )
    monkeypatch.setattr(
        restore_db,
        "_recover_postgres_restore_operation_receipt",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(restore_db.subprocess, "run", record_command)

    with pytest.raises(SystemExit):
        restore_db.restore_postgres(
            str(artifact),
            None,
            "localhost",
            5432,
            "mes_user",
            "test_target",
            run_check=False,
            assume_yes=True,
        )

    assert not any("dropdb" in command and "test_target" in command for command in commands)


def test_postgres_restore_claims_candidate_before_database_creation(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    artifact = (
        runtime_dir
        / "mes_20260904_000000_000000_cececececececececececececececece.sql"
    )
    artifact.write_text("-- staged dump\n", encoding="utf-8")
    manifest = backup_manifest.build_manifest(
        artifact,
        published_name=artifact.name,
        evidence=_postgres_evidence(),
        source_snapshot={"method": "pg_dump", "transaction_snapshot": True},
    )
    backup_manifest.manifest_path_for(artifact).write_text(
        json.dumps(manifest),
        encoding="utf-8",
    )
    events: list[str] = []
    operation_receipt = runtime_dir / "postgres-operation.json"

    @contextmanager
    def operation_scope(*_args: object, **_kwargs: object) -> Iterator[tuple[object, str, Path, Path]]:
        yield (
            object(),
            "cluster-123",
            runtime_dir / "cutover.json",
            operation_receipt,
        )

    monkeypatch.setattr(restore_db, "_postgres_restore_operation_scope", operation_scope)
    monkeypatch.setattr(
        restore_db,
        "_claim_postgres_restore_operation_locked",
        lambda *_args, **_kwargs: events.append("claim"),
        raising=False,
    )
    monkeypatch.setattr(
        restore_db,
        "_require_postgres_system_identifier",
        lambda *_args: None,
    )
    monkeypatch.setattr(
        restore_db,
        "_recover_postgres_restore_operation_receipt",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        restore_db,
        "_record_postgres_restore_candidate_oid",
        lambda *_args, **_kwargs: events.append("record-oid") or 707,
    )

    def fail_after_candidate_creation(
        *_args: object,
        on_database_created: object = None,
        on_importer_connected: object = None,
        expected_system_identifier: str | None = None,
        **_kwargs: object,
    ) -> None:
        assert expected_system_identifier == "cluster-123"
        events.append("createdb")
        assert callable(on_database_created)
        on_database_created()
        assert callable(on_importer_connected)
        on_importer_connected(808)
        events.append("import")
        raise backup_manifest.BackupValidationError("injected candidate failure")

    @contextmanager
    def admission_fence(*_args: object, **_kwargs: object) -> Iterator[object]:
        yield object()

    monkeypatch.setattr(
        restore_db,
        "_restore_postgres_dump_to_database",
        fail_after_candidate_creation,
    )
    monkeypatch.setattr(
        restore_db,
        "_postgres_candidate_admission_fence",
        admission_fence,
    )
    with pytest.raises(SystemExit):
        restore_db.restore_postgres(
            str(artifact),
            None,
            "localhost",
            5432,
            "mes_user",
            "test_target",
            run_check=False,
            assume_yes=True,
        )

    assert events[:4] == ["claim", "createdb", "record-oid", "import"]


def test_postgres_operation_receipt_recovers_only_its_exact_dead_candidate(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    receipt = runtime_dir / "postgres-operation-recovery.json"
    candidate_name = "ic18_restore_candidate_123456abcdef"
    unrelated_name = "ic18_restore_candidate_fedcba654321"
    receipt.write_text(
        json.dumps(
            {
                "contract": "postgres-restore-operation/v1",
                "state": "candidate_created",
                "system_identifier": "cluster-123",
                "target_name": "target",
                "candidate_name": candidate_name,
                "candidate_oid": 707,
                "owner": {"pid": 424242, "started_at_ns": 101},
            }
        ),
        encoding="utf-8",
    )
    catalog = {candidate_name, unrelated_name}

    monkeypatch.setattr(
        restore_db,
        "process_owner_is_active",
        lambda _owner: False,
        raising=False,
    )
    monkeypatch.setattr(
        restore_db,
        "_postgres_database_oid",
        lambda _connection, name: 707 if name in catalog else None,
    )

    def drop_exact_candidate(_connection: object, name: str) -> None:
        catalog.remove(name)

    monkeypatch.setattr(
        restore_db,
        "_drop_postgres_database",
        drop_exact_candidate,
    )

    restore_db._recover_postgres_restore_operation_receipt(
        object(),
        receipt,
        target_name="target",
        system_identifier="cluster-123",
    )

    assert catalog == {unrelated_name}
    assert not receipt.exists()


def test_postgres_operation_receipt_never_drops_a_reused_candidate_name(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    receipt = runtime_dir / "postgres-operation-oid-mismatch.json"
    candidate_name = "ic18_restore_candidate_123456abcdef"
    receipt.write_text(
        json.dumps(
            {
                "contract": restore_db.POSTGRES_RESTORE_OPERATION_CONTRACT,
                "state": "candidate_created",
                "system_identifier": "cluster-123",
                "target_name": "target",
                "candidate_name": candidate_name,
                "candidate_oid": 707,
                "owner": {"pid": 424242, "started_at_ns": 101},
            }
        ),
        encoding="utf-8",
    )
    dropped: list[str] = []
    monkeypatch.setattr(restore_db, "process_owner_is_active", lambda _owner: False)
    monkeypatch.setattr(restore_db, "_postgres_database_oid", lambda *_args: 808)
    monkeypatch.setattr(
        restore_db,
        "_drop_postgres_database",
        lambda _connection, name: dropped.append(name),
    )

    with pytest.raises(OSError, match="OID mismatch"):
        restore_db._recover_postgres_restore_operation_receipt(
            object(),
            receipt,
            target_name="target",
            system_identifier="cluster-123",
        )

    assert dropped == []
    assert receipt.is_file()


def test_postgres_candidate_claim_rejects_an_occupied_name(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    receipt = runtime_dir / "postgres-operation-occupied.json"
    monkeypatch.setattr(
        restore_db,
        "_require_postgres_system_identifier",
        lambda *_args: None,
    )
    monkeypatch.setattr(restore_db, "_postgres_database_oid", lambda *_args: 909)

    with pytest.raises(
        backup_manifest.BackupValidationError,
        match="already occupied",
    ):
        restore_db._claim_postgres_restore_operation_locked(
            object(),
            receipt,
            target_name="target",
            system_identifier="cluster-123",
            candidate_name="ic18_restore_candidate_abcdef123456",
        )

    assert not receipt.exists()


def test_postgres_restore_uses_an_immutable_private_artifact_pair(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    artifact = runtime_dir / "mes_20260904_000000_000000_dddddddddddddddddddddddddddddddd.sql"
    artifact.write_text("-- original dump\n", encoding="utf-8")
    manifest = backup_manifest.build_manifest(
        artifact,
        published_name=artifact.name,
        evidence=_postgres_evidence(),
        source_snapshot={"method": "pg_dump", "transaction_snapshot": True},
    )
    backup_manifest.manifest_path_for(artifact).write_text(
        json.dumps(manifest),
        encoding="utf-8",
    )
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-immutable"))

    with restore_db._stage_postgres_restore_pair(artifact) as staged:
        artifact.write_text("-- attacker changed source\n", encoding="utf-8")
        backup_manifest.manifest_path_for(artifact).write_text("{}", encoding="utf-8")

        assert staged.read_text(encoding="utf-8") == "-- original dump\n"
        receipt = backup_manifest.verify_manifest_receipt(
            staged,
            expected_engine="postgresql",
        )
        assert receipt.status is backup_manifest.BackupStatus.PASS

    assert not staged.exists()


@pytest.mark.parametrize(
    "postcheck_error",
    [
        backup_manifest.BackupValidationError("injected target postcheck failure"),
        SystemExit(9),
    ],
    ids=["validation-error", "system-exit"],
)
def test_postgres_cutover_restores_original_target_when_postcheck_fails(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
    postcheck_error: BaseException,
) -> None:
    databases = {POSTGRES_TEST_CANDIDATE, "target"}
    oids = {POSTGRES_TEST_CANDIDATE: 202, "target": 101}
    _install_fake_postgres_cluster_comments(monkeypatch, oids)
    events: list[str] = []

    def database_exists(_connection: object, name: str) -> bool:
        return name in databases

    def terminate(_connection: object, name: str) -> None:
        events.append(f"terminate:{name}")

    def rename(_connection: object, old: str, new: str) -> None:
        assert old in databases
        databases.remove(old)
        databases.add(new)
        oids[new] = oids.pop(old)
        events.append(f"rename:{old}->{new}")

    def drop(_connection: object, name: str) -> None:
        databases.discard(name)
        oids.pop(name, None)
        events.append(f"drop:{name}")

    @contextmanager
    def restore_lock(_connection: object, _target: str) -> Iterator[None]:
        yield

    monkeypatch.setattr(restore_db, "_postgres_database_exists", database_exists)
    monkeypatch.setattr(restore_db, "_terminate_postgres_connections", terminate)
    monkeypatch.setattr(restore_db, "_rename_postgres_database", rename)
    monkeypatch.setattr(restore_db, "_drop_postgres_database", drop)
    monkeypatch.setattr(restore_db, "_postgres_database_oid", lambda _c, name: oids.get(name))
    monkeypatch.setattr(
        restore_db,
        "_postgres_database_name_for_oid",
        lambda _c, oid: next((name for name, value in oids.items() if value == oid), None),
    )
    monkeypatch.setattr(restore_db, "_set_postgres_allow_connections", lambda *_args: None)
    monkeypatch.setattr(restore_db, "_postgres_restore_lock", restore_lock)
    monkeypatch.setattr(
        restore_db,
        "_require_postgres_system_identifier",
        lambda *_args: None,
    )
    monkeypatch.setattr(restore_db, "_postgres_cutover_suffix", lambda: "000000000000")

    def fail_postcheck() -> None:
        raise postcheck_error

    with pytest.raises(type(postcheck_error)):
        restore_db._cutover_postgres_candidate(
            object(),
            candidate_name=POSTGRES_TEST_CANDIDATE,
            target_name="target",
            postcheck=fail_postcheck,
            recovery_receipt=runtime_dir / "postcheck-recovery.json",
            system_identifier="cluster-123",
        )

    assert databases == {"target"}
    assert "rename:target->ic18_restore_rollback_000000000000" in events
    assert f"rename:{POSTGRES_TEST_CANDIDATE}->target" in events
    assert "rename:ic18_restore_rollback_000000000000->target" in events


def test_postgres_cutover_reports_old_database_cleanup_as_pending(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    databases = {POSTGRES_TEST_CANDIDATE, "target"}
    oids = {POSTGRES_TEST_CANDIDATE: 202, "target": 101}
    _install_fake_postgres_cluster_comments(monkeypatch, oids)

    monkeypatch.setattr(
        restore_db,
        "_postgres_database_exists",
        lambda _connection, name: name in databases,
    )
    monkeypatch.setattr(
        restore_db,
        "_terminate_postgres_connections",
        lambda _connection, _name: None,
    )

    def rename(_connection: object, old: str, new: str) -> None:
        databases.remove(old)
        databases.add(new)
        oids[new] = oids.pop(old)

    def fail_rollback_cleanup(_connection: object, name: str) -> None:
        raise OSError(f"injected cleanup failure: {name}")

    @contextmanager
    def restore_lock(_connection: object, _target: str) -> Iterator[None]:
        yield

    monkeypatch.setattr(restore_db, "_rename_postgres_database", rename)
    monkeypatch.setattr(restore_db, "_drop_postgres_database", fail_rollback_cleanup)
    monkeypatch.setattr(restore_db, "_postgres_database_oid", lambda _c, name: oids.get(name))
    monkeypatch.setattr(
        restore_db,
        "_postgres_database_name_for_oid",
        lambda _c, oid: next((name for name, value in oids.items() if value == oid), None),
    )
    monkeypatch.setattr(restore_db, "_set_postgres_allow_connections", lambda *_args: None)
    monkeypatch.setattr(restore_db, "_postgres_restore_lock", restore_lock)
    monkeypatch.setattr(
        restore_db,
        "_require_postgres_system_identifier",
        lambda *_args: None,
    )
    monkeypatch.setattr(restore_db, "_postgres_cutover_suffix", lambda: "000000000000")

    restore_db._cutover_postgres_candidate(
        object(),
        candidate_name=POSTGRES_TEST_CANDIDATE,
        target_name="target",
        postcheck=lambda: None,
        recovery_receipt=runtime_dir / "cleanup-recovery.json",
        system_identifier="cluster-123",
    )

    assert "target" in databases
    assert "ic18_restore_rollback_000000000000" in databases
    assert "RESTORE_CLEANUP_PENDING=" in capsys.readouterr().err


def test_postgres_cutover_checks_live_cluster_before_any_mutation(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mutations: list[str] = []
    monkeypatch.setattr(
        restore_db,
        "_postgres_system_identifier",
        lambda _connection: "cluster-other",
    )
    monkeypatch.setattr(
        restore_db,
        "_postgres_database_oid",
        lambda _connection, name: mutations.append(name) or None,
    )

    with pytest.raises(OSError, match="cluster identifier changed"):
        restore_db._cutover_postgres_candidate(
            object(),
            candidate_name=POSTGRES_TEST_CANDIDATE,
            target_name="target",
            postcheck=lambda: None,
            recovery_receipt=runtime_dir / "wrong-cluster.json",
            system_identifier="cluster-expected",
        )

    assert mutations == []
    assert not (runtime_dir / "wrong-cluster.json").exists()


@pytest.mark.parametrize(
    ("failure_point", "expected_target_oid", "raises"),
    [
        ("committed-before", 202, False),
        ("committed-after", 202, False),
        ("allow", 202, False),
    ],
)
def test_postgres_cutover_same_run_recovers_finalization_failures(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
    failure_point: str,
    expected_target_oid: int,
    raises: bool,
) -> None:
    catalog = {"target": 101, POSTGRES_TEST_CANDIDATE: 202}
    allow_connections = {"target": True, POSTGRES_TEST_CANDIDATE: True}
    _install_fake_postgres_cluster_comments(monkeypatch, catalog)
    receipt = runtime_dir / f"finalization-{failure_point}.json"
    failure_used = False

    def rename(_connection: object, old: str, new: str) -> None:
        catalog[new] = catalog.pop(old)
        allow_connections[new] = allow_connections.pop(old)

    def drop(_connection: object, name: str) -> None:
        catalog.pop(name, None)
        allow_connections.pop(name, None)

    original_write = restore_db._write_postgres_cutover_receipt

    def write_receipt(
        path: Path,
        payload: dict[str, object],
        *,
        state: str,
    ) -> None:
        nonlocal failure_used
        if state == "committed" and not failure_used:
            if failure_point == "committed-before":
                failure_used = True
                raise OSError("injected committed write failure")
            original_write(path, payload, state=state)
            if failure_point == "committed-after":
                failure_used = True
                raise OSError("injected post-durable committed failure")
            return
        original_write(path, payload, state=state)

    def set_allow_connections(_connection: object, name: str, allowed: bool) -> None:
        nonlocal failure_used
        if (
            failure_point == "allow"
            and name == "target"
            and allowed
            and catalog.get(name) == 202
            and not failure_used
        ):
            failure_used = True
            raise OSError("injected admission resume failure")
        allow_connections[name] = allowed

    @contextmanager
    def restore_lock(_connection: object, _target: str) -> Iterator[None]:
        yield

    monkeypatch.setattr(restore_db, "_write_postgres_cutover_receipt", write_receipt)
    monkeypatch.setattr(restore_db, "_postgres_database_exists", lambda _c, name: name in catalog)
    monkeypatch.setattr(restore_db, "_postgres_database_oid", lambda _c, name: catalog.get(name))
    monkeypatch.setattr(
        restore_db,
        "_postgres_database_name_for_oid",
        lambda _c, oid: next((name for name, value in catalog.items() if value == oid), None),
    )
    monkeypatch.setattr(restore_db, "_set_postgres_allow_connections", set_allow_connections)
    monkeypatch.setattr(restore_db, "_terminate_postgres_connections", lambda *_args: None)
    monkeypatch.setattr(restore_db, "_rename_postgres_database", rename)
    monkeypatch.setattr(restore_db, "_drop_postgres_database", drop)
    monkeypatch.setattr(restore_db, "_postgres_restore_lock", restore_lock)
    monkeypatch.setattr(restore_db, "_postgres_cutover_suffix", lambda: "000000000000")
    monkeypatch.setattr(
        restore_db,
        "_require_postgres_system_identifier",
        lambda *_args: None,
    )

    def cutover() -> None:
        restore_db._cutover_postgres_candidate(
            object(),
            candidate_name=POSTGRES_TEST_CANDIDATE,
            target_name="target",
            postcheck=lambda: None,
            recovery_receipt=receipt,
            system_identifier="cluster-123",
        )

    if raises:
        with pytest.raises(OSError, match="committed write"):
            cutover()
    else:
        cutover()

    assert failure_used is True
    assert catalog == {"target": expected_target_oid}
    assert allow_connections == {"target": True}
    assert not receipt.exists()


def test_postgres_restore_recovers_pending_cutover_before_source_validation(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[tuple[str, str]] = []

    @contextmanager
    def recover(admin_url: str, *, target_name: str) -> Iterator[tuple[object, str, Path, Path]]:
        events.append((admin_url, target_name))
        yield (
            object(),
            "cluster-123",
            runtime_dir / "cutover.json",
            runtime_dir / "operation.json",
        )

    monkeypatch.setattr(
        restore_db,
        "_postgres_restore_operation_scope",
        recover,
        raising=False,
    )

    with pytest.raises(SystemExit):
        restore_db.restore_postgres(
            str(runtime_dir / "missing.sql"),
            None,
            "localhost",
            5432,
            "mes_user",
            "target",
            run_check=False,
            assume_yes=True,
        )

    assert len(events) == 1
    assert events[0][1] == "target"


def test_postgres_cutover_receipt_scope_uses_cluster_identifier(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime"))

    first = restore_db._postgres_cutover_receipt_path("cluster-123", "target")
    same_cluster = restore_db._postgres_cutover_receipt_path("cluster-123", "target")
    other_cluster = restore_db._postgres_cutover_receipt_path("cluster-456", "target")

    assert first == same_cluster
    assert first != other_cluster


def test_postgres_operation_receipt_rejects_an_active_owner(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    receipt = runtime_dir / "active-operation.json"
    receipt.write_text(
        json.dumps(
            {
                "contract": restore_db.POSTGRES_RESTORE_OPERATION_CONTRACT,
                "state": "candidate_allocated",
                "system_identifier": "cluster-123",
                "target_name": "target",
                "candidate_name": "ic18_restore_candidate_123456abcdef",
                "owner": {"pid": 42, "started_at_ns": 99},
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        restore_db,
        "process_owner_is_active",
        lambda _owner: True,
    )
    monkeypatch.setattr(
        restore_db,
        "_postgres_database_oid",
        lambda *_args: pytest.fail("active owner candidate must not be inspected"),
    )

    with pytest.raises(
        backup_manifest.BackupValidationError,
        match="active process",
    ):
        restore_db._recover_postgres_restore_operation_receipt(
            object(),
            receipt,
            target_name="target",
            system_identifier="cluster-123",
        )

    assert receipt.is_file()


def test_postgres_cutover_receipt_rejects_cluster_identifier_mismatch(
    runtime_dir: Path,
) -> None:
    receipt = runtime_dir / "cluster-mismatch.json"
    receipt.write_text(
        json.dumps(
            {
                "contract": restore_db.POSTGRES_CUTOVER_RECOVERY_CONTRACT,
                "state": "prepared",
                "system_identifier": "cluster-123",
                "target_name": "target",
                "candidate_name": "candidate",
                "rollback_name": "rollback",
                "failed_name": "failed",
                "target_existed": True,
                "target_oid": 101,
                "candidate_oid": 202,
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(OSError, match="cluster"):
        restore_db._load_postgres_cutover_receipt(
            receipt,
            target_name="target",
            system_identifier="cluster-456",
        )


@pytest.mark.parametrize(
    "invalid_relation",
    [
        "same-oid",
        "duplicate-target-candidate",
        "candidate-prefix",
        "rollback-prefix",
        "failed-prefix",
        "cutover-suffix-mismatch",
    ],
)
def test_postgres_cutover_receipt_rejects_unsafe_identity_before_mutation(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
    invalid_relation: str,
) -> None:
    receipt = runtime_dir / f"unsafe-{invalid_relation}.json"
    suffix = "123456abcdef"
    target_name = "target"
    candidate_name = "ic18_restore_candidate_fedcba654321"
    rollback_name = f"ic18_restore_rollback_{suffix}"
    failed_name = f"ic18_restore_failed_{suffix}"
    target_oid = 101
    candidate_oid = 202
    if invalid_relation == "same-oid":
        candidate_oid = target_oid
    elif invalid_relation == "duplicate-target-candidate":
        target_name = candidate_name
    elif invalid_relation == "candidate-prefix":
        candidate_name = "candidate"
    elif invalid_relation == "rollback-prefix":
        rollback_name = "rollback"
    elif invalid_relation == "failed-prefix":
        failed_name = "failed"
    elif invalid_relation == "cutover-suffix-mismatch":
        failed_name = "ic18_restore_failed_abcdef123456"
    receipt.write_text(
        json.dumps(
            {
                "contract": restore_db.POSTGRES_CUTOVER_RECOVERY_CONTRACT,
                "state": "prepared",
                "system_identifier": "cluster-123",
                "target_name": target_name,
                "candidate_name": candidate_name,
                "rollback_name": rollback_name,
                "failed_name": failed_name,
                "target_existed": True,
                "target_oid": target_oid,
                "candidate_oid": candidate_oid,
            }
        ),
        encoding="utf-8",
    )
    mutations: list[tuple[str, ...]] = []
    monkeypatch.setattr(
        restore_db,
        "_postgres_database_name_for_oid",
        lambda _connection, _oid: target_name,
    )
    monkeypatch.setattr(
        restore_db,
        "_postgres_database_exists",
        lambda _connection, _name: False,
    )
    monkeypatch.setattr(
        restore_db,
        "_set_postgres_allow_connections",
        lambda *_args: None,
    )
    monkeypatch.setattr(
        restore_db,
        "_terminate_postgres_connections",
        lambda *_args: None,
    )
    monkeypatch.setattr(
        restore_db,
        "_rename_postgres_database",
        lambda _connection, old_name, new_name: mutations.append(
            ("rename", old_name, new_name)
        ),
    )
    monkeypatch.setattr(
        restore_db,
        "_drop_postgres_database",
        lambda _connection, name: mutations.append(("drop", name)),
    )

    with pytest.raises(OSError, match="invalid PostgreSQL cutover recovery receipt"):
        restore_db._recover_postgres_cutover_receipt(
            object(),
            receipt,
            target_name=target_name,
            system_identifier="cluster-123",
        )

    assert mutations == []
    assert receipt.is_file()


@pytest.mark.parametrize(
    "crash_transition",
    [
        ("target", "ic18_restore_rollback_000000000000"),
        (POSTGRES_TEST_CANDIDATE, "target"),
        ("target", "ic18_restore_failed_000000000000"),
        ("ic18_restore_rollback_000000000000", "target"),
    ],
    ids=[
        "after-target-to-rollback",
        "after-candidate-to-target",
        "after-target-to-failed",
        "after-rollback-to-target",
    ],
)
def test_postgres_cutover_recovers_every_rename_crash_on_next_execution(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
    crash_transition: tuple[str, str],
) -> None:
    class SimulatedProcessCrash(BaseException):
        pass

    catalog = {"target": 101, POSTGRES_TEST_CANDIDATE: 202}
    allow_connections = {"target": True, POSTGRES_TEST_CANDIDATE: True}
    _install_fake_postgres_cluster_comments(monkeypatch, catalog)
    crash_enabled = True

    def database_exists(_connection: object, name: str) -> bool:
        return name in catalog

    def database_oid(_connection: object, name: str) -> int | None:
        return catalog.get(name)

    def database_name_for_oid(_connection: object, oid: int) -> str | None:
        return next((name for name, value in catalog.items() if value == oid), None)

    def set_allow_connections(_connection: object, name: str, allowed: bool) -> None:
        assert name in catalog
        allow_connections[name] = allowed

    def rename(_connection: object, old: str, new: str) -> None:
        oid = catalog.pop(old)
        allowed = allow_connections.pop(old)
        catalog[new] = oid
        allow_connections[new] = allowed
        if crash_enabled and (old, new) == crash_transition:
            raise SimulatedProcessCrash()

    def drop(_connection: object, name: str) -> None:
        catalog.pop(name, None)
        allow_connections.pop(name, None)

    @contextmanager
    def restore_lock(_connection: object, _target: str) -> Iterator[None]:
        yield

    monkeypatch.setattr(restore_db, "_postgres_database_exists", database_exists)
    monkeypatch.setattr(restore_db, "_postgres_database_oid", database_oid, raising=False)
    monkeypatch.setattr(
        restore_db,
        "_postgres_database_name_for_oid",
        database_name_for_oid,
        raising=False,
    )
    monkeypatch.setattr(
        restore_db,
        "_set_postgres_allow_connections",
        set_allow_connections,
        raising=False,
    )
    monkeypatch.setattr(restore_db, "_terminate_postgres_connections", lambda *_args: None)
    monkeypatch.setattr(restore_db, "_rename_postgres_database", rename)
    monkeypatch.setattr(restore_db, "_drop_postgres_database", drop)
    monkeypatch.setattr(restore_db, "_postgres_restore_lock", restore_lock, raising=False)
    monkeypatch.setattr(
        restore_db,
        "_require_postgres_system_identifier",
        lambda *_args: None,
    )
    monkeypatch.setattr(restore_db, "_postgres_cutover_suffix", lambda: "000000000000")
    receipt = runtime_dir / "postgres-cutover-recovery.json"

    def first_postcheck() -> None:
        if crash_transition in {
            ("target", "ic18_restore_failed_000000000000"),
            ("ic18_restore_rollback_000000000000", "target"),
        }:
            raise backup_manifest.BackupValidationError("injected target postcheck failure")

    with pytest.raises(SimulatedProcessCrash):
        restore_db._cutover_postgres_candidate(
            object(),
            candidate_name=POSTGRES_TEST_CANDIDATE,
            target_name="target",
            postcheck=first_postcheck,
            recovery_receipt=receipt,
            system_identifier="cluster-123",
        )

    assert receipt.is_file()
    crash_enabled = False
    catalog[POSTGRES_TEST_NEXT_CANDIDATE] = 303
    allow_connections[POSTGRES_TEST_NEXT_CANDIDATE] = True

    restore_db._cutover_postgres_candidate(
        object(),
        candidate_name=POSTGRES_TEST_NEXT_CANDIDATE,
        target_name="target",
        postcheck=lambda: None,
        recovery_receipt=receipt,
        system_identifier="cluster-123",
    )

    assert catalog == {"target": 303}
    assert allow_connections == {"target": True}
    assert not receipt.exists()


@pytest.mark.skipif(os.name != "nt", reason="Windows write-through rename contract")
def test_postgres_cutover_receipt_uses_windows_write_through_replace(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    receipt = runtime_dir / "postgres-cutover-write-through.json"
    moves: list[tuple[Path, Path]] = []

    def write_through(source: Path, destination: Path) -> None:
        moves.append((source, destination))
        os.replace(source, destination)

    monkeypatch.setattr(
        restore_db,
        "_windows_write_through_replace",
        write_through,
        raising=False,
    )

    restore_db._write_postgres_cutover_receipt(
        receipt,
        {"contract": restore_db.POSTGRES_CUTOVER_RECOVERY_CONTRACT},
        state="prepared",
    )

    assert len(moves) == 1
    assert moves[0][1] == receipt
    assert json.loads(receipt.read_text(encoding="utf-8"))["state"] == "prepared"


def test_publication_receipt_fsyncs_before_durable_replace(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    receipt = runtime_dir / "publication-durable.json"
    events: list[str] = []

    monkeypatch.setattr(
        backup_manifest.os,
        "fsync",
        lambda _descriptor: events.append("fsync"),
    )

    def durable_replace(source: Path, destination: Path) -> None:
        events.append("durable-replace")
        os.replace(source, destination)

    monkeypatch.setattr(
        backup_manifest,
        "_durable_replace",
        durable_replace,
        raising=False,
    )

    backup_manifest._write_publication_recovery_receipt(
        receipt,
        state="publishing",
        staged_artifact=runtime_dir / "staged.db",
        published_artifact=runtime_dir / "published.db",
        published_manifest=runtime_dir / "published.db.manifest.json",
        staged_manifest=runtime_dir / "staged.db.manifest.json",
        quarantined_artifact=runtime_dir / "quarantined.db",
        quarantined_manifest=runtime_dir / "quarantined.db.manifest.json",
    )

    assert events == ["fsync", "durable-replace"]
    assert receipt.is_file()


def test_retention_receipt_fsyncs_before_durable_replace(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    receipt = runtime_dir / "retention-durable.json"
    events: list[str] = []

    monkeypatch.setattr(
        backup_retention.os,
        "fsync",
        lambda _descriptor: events.append("fsync"),
    )

    def durable_replace(source: Path, destination: Path) -> None:
        events.append("durable-replace")
        os.replace(source, destination)

    monkeypatch.setattr(
        backup_retention,
        "_durable_replace",
        durable_replace,
        raising=False,
    )

    backup_retention._write_recovery_receipt(
        receipt,
        [
            (runtime_dir / "artifact.db", runtime_dir / "artifact.quarantined"),
            (
                runtime_dir / "artifact.db.manifest.json",
                runtime_dir / "manifest.quarantined",
            ),
        ],
        state="removing",
    )

    assert events == ["fsync", "durable-replace"]
    assert receipt.is_file()


def test_backup_pair_fsyncs_payloads_before_durable_publication(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    published = runtime_dir / "mes_20260904_000000.db"
    staged = runtime_dir / f".{published.name}.pending-{'a' * 32}.tmp"
    staged.write_bytes(b"durable backup bytes")
    fsync_count = 0
    durable_moves: list[tuple[Path, int]] = []

    def record_fsync(_descriptor: int) -> None:
        nonlocal fsync_count
        fsync_count += 1

    def record_durable_replace(source: Path, destination: Path) -> None:
        durable_moves.append((destination, fsync_count))
        os.replace(source, destination)

    monkeypatch.setattr(backup_manifest.os, "fsync", record_fsync)
    monkeypatch.setattr(
        backup_manifest,
        "_durable_replace",
        record_durable_replace,
    )

    backup_manifest.publish_backup_pair(
        staged,
        published,
        {"contract": "test"},
    )

    moves_by_destination = dict(durable_moves)
    assert moves_by_destination[published] >= 3
    assert moves_by_destination[backup_manifest.manifest_path_for(published)] >= 3


def test_postgres_private_staging_cleanup_failure_does_not_reverse_success(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    artifact = runtime_dir / "mes_20260904_000000_000000_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.sql"
    artifact.write_text("-- staged cleanup\n", encoding="utf-8")
    manifest = backup_manifest.build_manifest(
        artifact,
        published_name=artifact.name,
        evidence=_postgres_evidence(),
        source_snapshot={"method": "pg_dump", "transaction_snapshot": True},
    )
    backup_manifest.manifest_path_for(artifact).write_text(
        json.dumps(manifest),
        encoding="utf-8",
    )
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-stage-cleanup"))
    monkeypatch.setattr(
        restore_db.shutil,
        "rmtree",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            OSError("injected staging cleanup failure")
        ),
    )

    with restore_db._stage_postgres_restore_pair(artifact) as staged:
        assert staged.is_file()

    assert "RESTORE_CLEANUP_PENDING=" in capsys.readouterr().err


def test_container_postgres_validation_uses_legacy_host_connection_defaults(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dump = runtime_dir / "container.sql"
    dump.write_text("-- dump\n", encoding="utf-8")
    observed_urls: list[str] = []

    @contextmanager
    def operation_scope(
        admin_url: str,
        *,
        target_name: str,
    ) -> Iterator[tuple[object, str, Path, Path]]:
        observed_urls.append(admin_url)
        yield (
            object(),
            "cluster-123",
            runtime_dir / "cutover.json",
            runtime_dir / "operation.json",
        )

    def restore_candidate(
        *_args: object,
        on_database_created: object = None,
        on_importer_connected: object = None,
        **_kwargs: object,
    ) -> None:
        assert callable(on_database_created)
        on_database_created()
        assert callable(on_importer_connected)
        on_importer_connected(808)

    @contextmanager
    def admission_fence(
        database_url: str,
        **_kwargs: object,
    ) -> Iterator[object]:
        observed_urls.append(database_url)
        yield object()

    monkeypatch.setattr(restore_db, "_postgres_restore_operation_scope", operation_scope)
    monkeypatch.setattr(
        restore_db,
        "_claim_postgres_restore_operation_locked",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        restore_db,
        "_record_postgres_restore_candidate_oid",
        lambda *_args, **_kwargs: 707,
    )
    monkeypatch.setattr(
        restore_db,
        "_recover_postgres_restore_operation_receipt",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        backup_db,
        "_restore_postgres_dump_to_database",
        restore_candidate,
    )

    def collect(_connection: object, **_kwargs: object) -> dict[str, object]:
        return _postgres_evidence()

    monkeypatch.setattr(
        restore_db,
        "_postgres_candidate_admission_fence",
        admission_fence,
    )
    monkeypatch.setattr(backup_db, "collect_database_evidence_from_connection", collect)

    backup_db._validate_postgres_dump(
        dump,
        container="mes-postgres",
        host="localhost",
        port=5432,
        user="mes_user",
    )

    assert len(observed_urls) == 2
    assert all(
        url.startswith("postgresql://mes_user@localhost:5432/")
        for url in observed_urls
    )


def test_postgres_backup_validation_uses_owned_fenced_candidate(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dump = runtime_dir / "owned-validation.sql"
    dump.write_text("-- dump\n", encoding="utf-8")
    events: list[str] = []
    operation_receipt = runtime_dir / "backup-validation-operation.json"

    @contextmanager
    def operation_scope(
        admin_url: str,
        *,
        target_name: str,
    ) -> Iterator[tuple[object, str, Path, Path]]:
        events.append(f"scope:{admin_url}:{target_name}")
        yield (
            object(),
            "cluster-123",
            runtime_dir / "unused-cutover.json",
            operation_receipt,
        )

    def restore_candidate(
        *_args: object,
        database_name: str,
        on_database_created: object = None,
        on_importer_connected: object = None,
        expected_system_identifier: str | None = None,
        **_kwargs: object,
    ) -> None:
        assert database_name.startswith("ic18_restore_candidate_")
        assert expected_system_identifier == "cluster-123"
        events.append("createdb")
        assert callable(on_database_created)
        on_database_created()
        events.append("importer-connected")
        assert callable(on_importer_connected)
        on_importer_connected(808)
        events.append("import")

    @contextmanager
    def admission_fence(*_args: object, **_kwargs: object) -> Iterator[object]:
        events.append("admission-fence")
        yield object()

    monkeypatch.setattr(restore_db, "_postgres_restore_operation_scope", operation_scope)
    monkeypatch.setattr(
        restore_db,
        "_claim_postgres_restore_operation_locked",
        lambda *_args, **_kwargs: events.append("claim"),
    )
    monkeypatch.setattr(
        restore_db,
        "_record_postgres_restore_candidate_oid",
        lambda *_args, **_kwargs: events.append("record-oid") or 707,
    )
    monkeypatch.setattr(
        restore_db,
        "_postgres_candidate_admission_fence",
        admission_fence,
    )
    monkeypatch.setattr(
        backup_db,
        "collect_database_evidence_from_connection",
        lambda *_args, **_kwargs: events.append("fenced-evidence")
        or _postgres_evidence(),
    )
    monkeypatch.setattr(
        restore_db,
        "_recover_postgres_restore_operation_receipt",
        lambda *_args, **_kwargs: events.append("exact-recovery"),
    )
    monkeypatch.setattr(
        backup_db,
        "_restore_postgres_dump_to_database",
        restore_candidate,
    )
    monkeypatch.setattr(
        backup_db,
        "_drop_postgres_database",
        lambda *_args, **_kwargs: pytest.fail("name-only cleanup is forbidden"),
    )

    result = backup_db._validate_postgres_dump(
        dump,
        container=None,
        host="localhost",
        port=5432,
        user="mes_user",
        validation_url="postgresql://mes_user@localhost:5432/test_validation",
    )

    assert result == _postgres_evidence()
    assert [event.split(":", 1)[0] for event in events] == [
        "scope",
        "claim",
        "createdb",
        "record-oid",
        "importer-connected",
        "admission-fence",
        "import",
        "fenced-evidence",
        "exact-recovery",
    ]


def test_container_postgres_restore_uses_unique_verified_dump_paths(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dump = runtime_dir / "container-verified.sql"
    dump.write_text("-- verified container dump\n", encoding="utf-8")
    copied_paths: list[str] = []

    def record_command(
        command: list[str],
    ) -> subprocess.CompletedProcess[str]:
        if command[:2] == ["docker", "cp"]:
            copied_paths.append(command[-1].split(":", 1)[1])
        stdout = (
            f"{backup_manifest.file_sha256(dump)}  {command[-1]}\n"
            if "sha256sum" in command
            else ""
        )
        return subprocess.CompletedProcess(command, 0, stdout=stdout, stderr="")

    monkeypatch.setattr(
        backup_db,
        "_run_postgres_validation_command",
        record_command,
    )

    for database_name in ("test_container_one", "test_container_two"):
        backup_db._restore_postgres_dump_to_database(
            dump,
            database_name=database_name,
            container="mes-postgres",
            host="localhost",
            port=5432,
            user="mes_user",
            validation_url="postgresql://mes_user@localhost:5432/mes_db",
        )

    assert len(copied_paths) == 2
    assert copied_paths[0] != copied_paths[1]
    assert all(path.startswith("/tmp/ic18-restore-") for path in copied_paths)


def test_postgres_restore_records_created_database_before_import(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dump = runtime_dir / "created-before-import.sql"
    dump.write_text("-- dump\n", encoding="utf-8")
    events: list[str] = []

    def record_command(
        command: list[str],
    ) -> subprocess.CompletedProcess[str]:
        if command[0] == "createdb":
            events.append("createdb")
        elif command[0] == "psql":
            events.append("psql")
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

    monkeypatch.setattr(
        backup_db,
        "_run_postgres_validation_command",
        record_command,
    )

    backup_db._restore_postgres_dump_to_database(
        dump,
        database_name="ic18_restore_candidate_123456abcdef",
        container=None,
        host="localhost",
        port=5432,
        user="mes_user",
        require_absent=True,
        on_database_created=lambda: events.append("durable-oid"),
    )

    assert events == ["createdb", "durable-oid", "psql"]


def test_postgres_restore_fences_importer_before_sending_dump_bytes(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dump = runtime_dir / "fenced-before-import.sql"
    dump.write_text("-- dump\n", encoding="utf-8")
    events: list[str] = []

    def record_command(
        command: list[str],
    ) -> subprocess.CompletedProcess[str]:
        events.append(command[0])
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

    def import_with_fence(
        command: list[str],
        payload: bytes,
        on_importer_connected: object,
    ) -> None:
        assert command[0] == "psql"
        assert payload == dump.read_bytes()
        assert callable(on_importer_connected)
        events.append("importer-connected")
        on_importer_connected(808)
        events.append("dump-sent")

    monkeypatch.setattr(
        backup_db,
        "_run_postgres_validation_command",
        record_command,
    )
    monkeypatch.setattr(
        backup_db,
        "_run_postgres_import_with_admission_fence",
        import_with_fence,
        raising=False,
    )

    backup_db._restore_postgres_dump_to_database(
        dump,
        database_name="ic18_restore_candidate_123456abcdef",
        container=None,
        host="127.0.0.1",
        port=55432,
        user="postgres",
        require_absent=True,
        on_database_created=lambda: events.append("durable-oid"),
        on_importer_connected=lambda pid: events.append(f"fence:{pid}"),
    )

    assert events == [
        "createdb",
        "durable-oid",
        "importer-connected",
        "fence:808",
        "dump-sent",
    ]


def test_postgres_restore_rejects_mutation_cluster_before_database_creation(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dump = runtime_dir / "wrong-mutation-cluster.sql"
    dump.write_text("-- dump\n", encoding="utf-8")
    commands: list[list[str]] = []

    def record_command(command: list[str]) -> subprocess.CompletedProcess[str]:
        commands.append(command)
        if command[0] == "psql" and "pg_control_system" in command[-1]:
            return subprocess.CompletedProcess(
                command,
                0,
                stdout="222\n",
                stderr="",
            )
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

    monkeypatch.setattr(
        backup_db,
        "_run_postgres_validation_command",
        record_command,
    )

    with pytest.raises(
        backup_manifest.BackupValidationError,
        match="cluster identifier mismatch",
    ):
        backup_db._restore_postgres_dump_to_database(
            dump,
            database_name="ic18_restore_candidate_123456abcdef",
            container=None,
            host="127.0.0.1",
            port=55433,
            user="postgres",
            require_absent=True,
            expected_system_identifier="111",
        )

    assert any("pg_control_system" in command[-1] for command in commands)
    assert not any(command[0] in {"createdb", "dropdb"} for command in commands)


def test_postgres_temporary_restore_cleanup_failure_fails_closed(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dump = runtime_dir / "staged.sql"
    dump.write_text("-- staged dump\n", encoding="utf-8")

    @contextmanager
    def operation_scope(
        *_args: object,
        **_kwargs: object,
    ) -> Iterator[tuple[object, str, Path, Path]]:
        yield (
            object(),
            "cluster-123",
            runtime_dir / "cutover.json",
            runtime_dir / "operation.json",
        )

    def restore_candidate(
        *_args: object,
        on_database_created: object = None,
        on_importer_connected: object = None,
        **_kwargs: object,
    ) -> None:
        assert callable(on_database_created)
        on_database_created()
        assert callable(on_importer_connected)
        on_importer_connected(808)

    @contextmanager
    def admission_fence(*_args: object, **_kwargs: object) -> Iterator[object]:
        yield object()

    monkeypatch.setattr(restore_db, "_postgres_restore_operation_scope", operation_scope)
    monkeypatch.setattr(
        restore_db,
        "_claim_postgres_restore_operation_locked",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        restore_db,
        "_record_postgres_restore_candidate_oid",
        lambda *_args, **_kwargs: 707,
    )
    monkeypatch.setattr(
        restore_db,
        "_postgres_candidate_admission_fence",
        admission_fence,
    )
    monkeypatch.setattr(
        backup_db,
        "collect_database_evidence_from_connection",
        lambda *_args, **_kwargs: _postgres_evidence(),
    )
    monkeypatch.setattr(
        restore_db,
        "_recover_postgres_restore_operation_receipt",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            backup_manifest.BackupValidationError("injected cleanup failure")
        ),
    )
    monkeypatch.setattr(
        backup_db,
        "_restore_postgres_dump_to_database",
        restore_candidate,
    )

    with pytest.raises(backup_manifest.BackupValidationError, match="cleanup"):
        backup_db._validate_postgres_dump(
            dump,
            container=None,
            host="localhost",
            port=5432,
            user="mes_user",
        )


def test_container_import_error_remains_primary_when_temp_cleanup_also_fails(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dump = runtime_dir / "primary-import-error.sql"
    dump.write_text("-- dump", encoding="utf-8")

    def run_command(command: list[str]) -> subprocess.CompletedProcess[str]:
        if "psql" in command:
            raise backup_manifest.BackupValidationError("primary import failure")
        if "rm" in command:
            raise backup_manifest.BackupValidationError("secondary cleanup failure")
        stdout = (
            f"{backup_manifest.file_sha256(dump)}  /tmp/dump.sql\n"
            if "sha256sum" in command
            else ""
        )
        return subprocess.CompletedProcess(command, 0, stdout=stdout, stderr="")

    monkeypatch.setattr(backup_db, "_run_postgres_validation_command", run_command)

    with pytest.raises(
        backup_manifest.BackupValidationError,
        match="primary import failure",
    ) as exc_info:
        backup_db._restore_postgres_dump_to_database(
            dump,
            database_name="test_candidate",
            container="postgres",
            host="localhost",
            port=5432,
            user="mes_user",
        )

    assert any("secondary cleanup failure" in note for note in exc_info.value.__notes__)


def test_validation_error_remains_primary_when_temporary_drop_also_fails(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dump = runtime_dir / "primary-validation-error.sql"
    dump.write_text("-- dump", encoding="utf-8")

    @contextmanager
    def operation_scope(
        *_args: object,
        **_kwargs: object,
    ) -> Iterator[tuple[object, str, Path, Path]]:
        yield (
            object(),
            "cluster-123",
            runtime_dir / "cutover.json",
            runtime_dir / "operation.json",
        )

    def restore_candidate(
        *_args: object,
        on_database_created: object = None,
        on_importer_connected: object = None,
        **_kwargs: object,
    ) -> None:
        assert callable(on_database_created)
        on_database_created()
        assert callable(on_importer_connected)
        on_importer_connected(808)

    @contextmanager
    def admission_fence(*_args: object, **_kwargs: object) -> Iterator[object]:
        yield object()

    monkeypatch.setattr(restore_db, "_postgres_restore_operation_scope", operation_scope)
    monkeypatch.setattr(
        restore_db,
        "_claim_postgres_restore_operation_locked",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        restore_db,
        "_record_postgres_restore_candidate_oid",
        lambda *_args, **_kwargs: 707,
    )
    monkeypatch.setattr(
        backup_db,
        "_restore_postgres_dump_to_database",
        restore_candidate,
    )
    monkeypatch.setattr(
        restore_db,
        "_postgres_candidate_admission_fence",
        admission_fence,
    )
    monkeypatch.setattr(
        backup_db,
        "collect_database_evidence_from_connection",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            backup_manifest.BackupValidationError("primary evidence failure")
        ),
    )
    monkeypatch.setattr(
        restore_db,
        "_recover_postgres_restore_operation_receipt",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            backup_manifest.BackupValidationError("secondary drop failure")
        ),
    )

    with pytest.raises(
        backup_manifest.BackupValidationError,
        match="primary evidence failure",
    ) as exc_info:
        backup_db._validate_postgres_dump(
            dump,
            container=None,
            host="localhost",
            port=5432,
            user="mes_user",
        )

    assert any("secondary drop failure" in note for note in exc_info.value.__notes__)


def test_sqlite_backup_error_remains_primary_when_private_cleanup_fails(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "cleanup-primary-source.db"
    _create_head_db(source)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "cleanup-primary-runtime"))
    monkeypatch.setattr(
        backup_db,
        "_verify_sqlite_backup",
        lambda _path: (_ for _ in ()).throw(
            backup_manifest.BackupValidationError("primary sqlite validation failure")
        ),
    )
    monkeypatch.setattr(
        backup_db,
        "_remove_private_sqlite_backup",
        lambda _path: (_ for _ in ()).throw(OSError("secondary sqlite cleanup failure")),
    )

    with pytest.raises(
        backup_manifest.BackupValidationError,
        match="primary sqlite validation failure",
    ) as exc_info:
        backup_db.backup_sqlite(str(source))

    assert any("secondary sqlite cleanup failure" in note for note in exc_info.value.__notes__)


def test_sqlite_snapshot_error_remains_primary_when_connections_fail_to_close(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_path = runtime_dir / "sqlite-close-primary.db"
    source_path.write_bytes(b"source")
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "runtime-close-primary"))

    class SourceConnection:
        def execute(self, _statement: str) -> object:
            return type("Cursor", (), {"fetchone": lambda self: ("wal",)})()

        def backup(self, _target: object) -> None:
            raise sqlite3.OperationalError("primary SQLite snapshot failure")

        def close(self) -> None:
            raise OSError("secondary source close failure")

    class TargetConnection:
        def close(self) -> None:
            raise OSError("secondary target close failure")

    connections = iter((SourceConnection(), TargetConnection()))
    monkeypatch.setattr(
        backup_db.sqlite3,
        "connect",
        lambda *_args, **_kwargs: next(connections),
    )

    with pytest.raises(SystemExit) as exc_info:
        backup_db.backup_sqlite(str(source_path))

    assert isinstance(exc_info.value.__cause__, sqlite3.OperationalError)
    assert "primary SQLite snapshot failure" in str(exc_info.value.__cause__)
    assert any(
        "secondary target close failure" in note
        for note in exc_info.value.__notes__
    )
    assert any(
        "secondary source close failure" in note
        for note in exc_info.value.__notes__
    )


def test_sqlite_snapshot_digest_error_remains_primary_when_cleanup_fails(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "digest-cleanup-primary.db"
    source.write_bytes(b"source")
    monkeypatch.setattr(
        restore_db,
        "_copy_live_sqlite",
        lambda *_args: (_ for _ in ()).throw(
            backup_manifest.BackupValidationError("primary digest snapshot failure")
        ),
    )
    monkeypatch.setattr(
        restore_db,
        "_remove_sqlite_files",
        lambda _path: (_ for _ in ()).throw(
            OSError("secondary digest snapshot cleanup failure")
        ),
    )

    with pytest.raises(
        backup_manifest.BackupValidationError,
        match="primary digest snapshot failure",
    ) as exc_info:
        restore_db._sqlite_snapshot_digest(source)

    assert any(
        "secondary digest snapshot cleanup failure" in note
        for note in exc_info.value.__notes__
    )


def test_postgres_backup_error_remains_primary_when_staged_cleanup_fails(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "postgres-cleanup-runtime"))
    monkeypatch.setattr(
        backup_db.subprocess,
        "run",
        lambda *_args, **_kwargs: subprocess.CompletedProcess(
            [],
            0,
            stdout=b"-- dump\n",
            stderr=b"",
        ),
    )
    monkeypatch.setattr(
        backup_db,
        "_validate_postgres_dump",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            backup_manifest.BackupValidationError("primary postgres validation failure")
        ),
    )
    original_unlink = Path.unlink

    def fail_pending_unlink(path: Path, *, missing_ok: bool = False) -> None:
        if ".pending-" in path.name:
            raise OSError("secondary postgres staged cleanup failure")
        original_unlink(path, missing_ok=missing_ok)

    monkeypatch.setattr(Path, "unlink", fail_pending_unlink)

    with pytest.raises(SystemExit) as exc_info:
        backup_db.backup_postgres(
            None,
            "localhost",
            5432,
            "mes_user",
            "test_source",
        )

    assert isinstance(exc_info.value.__cause__, backup_manifest.BackupValidationError)
    assert "primary postgres validation failure" in str(exc_info.value.__cause__)
    assert any(
        "secondary postgres staged cleanup failure" in note
        for note in exc_info.value.__notes__
    )


def test_nas_publication_error_remains_primary_when_pending_cleanup_fails(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = (
        runtime_dir
        / "mes_20260904_000000_000000_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.db"
    )
    source.write_bytes(b"source")
    backup_manifest.manifest_path_for(source).write_text("{}", encoding="utf-8")
    monkeypatch.setattr(
        backup_to_nas,
        "_verify_copied_receipt",
        lambda *_args: (_ for _ in ()).throw(
            ValueError("primary NAS receipt failure")
        ),
    )
    original_unlink = Path.unlink

    def fail_pending_unlink(path: Path, *, missing_ok: bool = False) -> None:
        if ".pending-" in path.name:
            raise OSError("secondary NAS pending cleanup failure")
        original_unlink(path, missing_ok=missing_ok)

    monkeypatch.setattr(Path, "unlink", fail_pending_unlink)

    with pytest.raises(ValueError, match="primary NAS receipt failure") as exc_info:
        backup_to_nas.publish_existing_backup(
            source,
            runtime_dir / "nas-cleanup",
            verify=lambda _path: None,
            hash_file=lambda _path: "same",
        )

    assert any("secondary NAS pending cleanup failure" in note for note in exc_info.value.__notes__)


def test_postgres_lock_body_error_remains_primary_when_unlock_fails() -> None:
    class ConnectionWithFailingUnlock:
        def __init__(self) -> None:
            self.calls = 0

        def execute(self, *_args: object, **_kwargs: object) -> None:
            self.calls += 1
            if self.calls == 2:
                raise OSError("secondary advisory unlock failure")

    connection = ConnectionWithFailingUnlock()

    with pytest.raises(
        backup_manifest.BackupValidationError,
        match="primary cutover failure",
    ) as exc_info:
        with restore_db._postgres_restore_lock(connection, "target"):
            raise backup_manifest.BackupValidationError("primary cutover failure")

    assert any("secondary advisory unlock failure" in note for note in exc_info.value.__notes__)


def test_receipt_write_error_remains_primary_when_pending_cleanup_fails(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        restore_db,
        "_durable_replace",
        lambda *_args: (_ for _ in ()).throw(
            OSError("primary durable replace failure")
        ),
    )
    original_unlink = Path.unlink

    def fail_pending_unlink(path: Path, *, missing_ok: bool = False) -> None:
        if ".pending-" in path.name:
            raise OSError("secondary receipt pending cleanup failure")
        original_unlink(path, missing_ok=missing_ok)

    monkeypatch.setattr(Path, "unlink", fail_pending_unlink)

    with pytest.raises(OSError, match="primary durable replace failure") as exc_info:
        restore_db._write_postgres_cutover_receipt(
            runtime_dir / "receipt.json",
            {"contract": restore_db.POSTGRES_CUTOVER_RECOVERY_CONTRACT},
            state="prepared",
        )

    assert any(
        "secondary receipt pending cleanup failure" in note
        for note in exc_info.value.__notes__
    )


def test_sqlite_replace_error_remains_primary_when_staged_cleanup_fails(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "replace-primary-source.db"
    target = runtime_dir / "replace-primary-target.db"
    source.write_bytes(b"source")
    monkeypatch.setattr(
        restore_db.shutil,
        "copy2",
        lambda *_args: (_ for _ in ()).throw(OSError("primary staging copy failure")),
    )
    monkeypatch.setattr(
        restore_db,
        "_remove_sqlite_files",
        lambda _path: (_ for _ in ()).throw(OSError("secondary staged cleanup failure")),
    )

    with pytest.raises(OSError, match="primary staging copy failure") as exc_info:
        restore_db._replace_sqlite_atomically(source, target)

    assert any("secondary staged cleanup failure" in note for note in exc_info.value.__notes__)


def test_maintenance_manifest_error_remains_primary_when_staged_cleanup_fails(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = runtime_dir / "maintenance-source.db"
    _create_head_db(source)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_dir / "maintenance-runtime"))
    monkeypatch.setattr(
        maintenance_backup,
        "create_sqlite_manifest",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            backup_manifest.BackupValidationError("primary maintenance manifest failure")
        ),
    )
    original_unlink = Path.unlink

    def fail_pending_unlink(path: Path, *, missing_ok: bool = False) -> None:
        if ".pending-" in path.name:
            raise OSError("secondary maintenance staged cleanup failure")
        original_unlink(path, missing_ok=missing_ok)

    monkeypatch.setattr(Path, "unlink", fail_pending_unlink)

    with pytest.raises(
        backup_manifest.BackupValidationError,
        match="primary maintenance manifest failure",
    ) as exc_info:
        maintenance_backup.create_sqlite_snapshot(source, "cleanup-primary")

    assert any(
        "secondary maintenance staged cleanup failure" in note
        for note in exc_info.value.__notes__
    )


def test_publication_receipt_error_remains_primary_when_pending_cleanup_fails(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        backup_manifest,
        "_durable_replace",
        lambda *_args: (_ for _ in ()).throw(
            OSError("primary publication receipt replace failure")
        ),
    )
    original_unlink = Path.unlink

    def fail_pending_unlink(path: Path, *, missing_ok: bool = False) -> None:
        if ".pending-" in path.name:
            raise OSError("secondary publication receipt cleanup failure")
        original_unlink(path, missing_ok=missing_ok)

    monkeypatch.setattr(Path, "unlink", fail_pending_unlink)
    receipt = runtime_dir / "publication-recovery.json"

    with pytest.raises(
        OSError,
        match="primary publication receipt replace failure",
    ) as exc_info:
        backup_manifest._write_publication_recovery_receipt(
            receipt,
            state="prepared",
            staged_artifact=runtime_dir / "staged.db",
            published_artifact=runtime_dir / "published.db",
            published_manifest=runtime_dir / "published.db.manifest.json",
            staged_manifest=runtime_dir / "staged.db.manifest.json",
            quarantined_artifact=runtime_dir / "quarantined.db",
            quarantined_manifest=runtime_dir / "quarantined.db.manifest.json",
        )

    assert any(
        "secondary publication receipt cleanup failure" in note
        for note in exc_info.value.__notes__
    )


def test_retention_receipt_error_remains_primary_when_pending_cleanup_fails(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        backup_retention,
        "_durable_replace",
        lambda *_args: (_ for _ in ()).throw(
            OSError("primary retention receipt replace failure")
        ),
    )
    original_unlink = Path.unlink

    def fail_pending_unlink(path: Path, *, missing_ok: bool = False) -> None:
        if ".pending-" in path.name:
            raise OSError("secondary retention receipt cleanup failure")
        original_unlink(path, missing_ok=missing_ok)

    monkeypatch.setattr(Path, "unlink", fail_pending_unlink)
    receipt = runtime_dir / "retention-recovery.json"

    with pytest.raises(
        OSError,
        match="primary retention receipt replace failure",
    ) as exc_info:
        backup_retention._write_recovery_receipt(
            receipt,
            [
                (runtime_dir / "one.db", runtime_dir / "one.quarantined"),
                (
                    runtime_dir / "one.db.manifest.json",
                    runtime_dir / "one.manifest.quarantined",
                ),
            ],
            state="removing",
        )

    assert any(
        "secondary retention receipt cleanup failure" in note
        for note in exc_info.value.__notes__
    )


def test_retention_depublish_error_remains_primary_when_recovery_also_fails(
    runtime_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    backup_dir = runtime_dir / "retention-primary-error"
    backup_dir.mkdir()
    artifact = (
        backup_dir
        / "mes_20260904_000000_000000_ffffffffffffffffffffffffffffffff.db"
    )
    _create_valid_retention_pair(artifact)
    original_replace = backup_retention._durable_replace

    def fail_artifact_depublish(source: str | Path, target: str | Path) -> None:
        if Path(source) == artifact:
            raise OSError("primary artifact depublish failure")
        original_replace(source, target)

    monkeypatch.setattr(backup_retention, "_durable_replace", fail_artifact_depublish)
    monkeypatch.setattr(
        backup_retention,
        "_recover_cleanup_receipt",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            OSError("secondary retention recovery failure")
        ),
    )

    with pytest.raises(OSError, match="primary artifact depublish failure") as exc_info:
        retain_latest_backups(backup_dir, suffix=".db", keep=0)

    assert any(
        "secondary retention recovery failure" in note
        for note in exc_info.value.__notes__
    )


def test_postgres_runtime_recovery_check_is_limited_to_canonical_database() -> None:
    assert restore_db._requires_postgres_runtime_recovery_check("mes_db") is True
    assert restore_db._requires_postgres_runtime_recovery_check("custom_database") is False
    assert restore_db._requires_postgres_runtime_recovery_check("test_candidate") is False


def test_canonical_postgres_restore_fences_writers_before_cutover() -> None:
    source = (ROOT / "scripts" / "ops" / "restore_db.py").read_text(encoding="utf-8")
    postgres_restore = source[source.index("def restore_postgres(") :]

    runtime_check = postgres_restore.index("_verify_runtime_recovery()")
    writer_fence = postgres_restore.index("_enter_runtime_restore_fence()")
    cutover = postgres_restore.index("_cutover_postgres_candidate(")
    assert runtime_check < writer_fence < cutover
