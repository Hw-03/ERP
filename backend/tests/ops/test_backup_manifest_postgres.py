"""Actual PostgreSQL 16 evidence for the IC-18 backup/restore contract."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
from uuid import uuid4

from alembic import command
from alembic.config import Config
import pytest
import sqlalchemy as sa


PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.ops import backup_db, backup_manifest, restore_db  # noqa: E402


TEST_POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
POSTGRES_ACK = "ALLOW_TEST_DB_MUTATION"


def _alembic_config(database_url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    return config


@contextmanager
def _disposable_databases() -> tuple[sa.engine.URL, str, str]:
    base_url = sa.engine.make_url(TEST_POSTGRES_URL)
    base_name = base_url.database or ""
    assert base_url.drivername.startswith("postgresql")
    assert base_name.startswith("test_") or base_name.endswith("_test")
    assert os.environ.get("DATABASE_URL") == TEST_POSTGRES_URL
    assert os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK") == POSTGRES_ACK

    admin_engine = sa.create_engine(
        base_url.set(database="postgres"),
        poolclass=sa.pool.NullPool,
    )
    source_name = f"ic18_restore_candidate_{uuid4().hex[:12]}"
    target_name = f"test_ic18_target_{uuid4().hex[:12]}"
    try:
        with admin_engine.connect().execution_options(
            isolation_level="AUTOCOMMIT"
        ) as connection:
            connection.exec_driver_sql(f'CREATE DATABASE "{source_name}"')
        yield base_url, source_name, target_name
    finally:
        with admin_engine.connect().execution_options(
            isolation_level="AUTOCOMMIT"
        ) as connection:
            for database_name in (source_name, target_name):
                connection.execute(
                    sa.text(
                        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                        "WHERE datname = :database_name AND pid <> pg_backend_pid()"
                    ),
                    {"database_name": database_name},
                )
                connection.exec_driver_sql(
                    f'DROP DATABASE IF EXISTS "{database_name}"'
                )
        admin_engine.dispose()


def _render_url(base_url: sa.engine.URL, database_name: str) -> str:
    return base_url.set(database=database_name).render_as_string(hide_password=False)


@contextmanager
def _secondary_postgres_cluster(
    root: Path,
    *,
    user: str,
) -> Iterator[tuple[int, str]]:
    """Start one isolated trust-auth cluster and stop only that exact data dir."""

    initdb = shutil.which("initdb")
    pg_ctl = shutil.which("pg_ctl")
    assert initdb is not None and pg_ctl is not None
    data_dir = root / "secondary-postgres"
    subprocess.run(
        [
            initdb,
            "-D",
            str(data_dir),
            "-A",
            "trust",
            "-U",
            user,
            "--encoding=UTF8",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True,
    )
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        port = int(listener.getsockname()[1])
    subprocess.run(
        [
            pg_ctl,
            "-D",
            str(data_dir),
            "-o",
            f"-h 127.0.0.1 -p {port}",
            "-w",
            "start",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True,
    )
    try:
        yield port, f"postgresql://{user}@127.0.0.1:{port}/postgres"
    finally:
        subprocess.run(
            [pg_ctl, "-D", str(data_dir), "-m", "fast", "-w", "stop"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )


def _candidate_database_names(database_url: str) -> set[str]:
    engine = sa.create_engine(database_url, poolclass=sa.pool.NullPool)
    try:
        with engine.connect() as connection:
            return set(
                connection.execute(
                    sa.text(
                        "SELECT datname FROM pg_database "
                        "WHERE datname LIKE 'ic18_restore_candidate_%'"
                    )
                ).scalars()
            )
    finally:
        engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgres_16_backup_restore_proves_staging_manifest_and_target_safety(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime"))
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)

    with _disposable_databases() as (base_url, source_name, target_name):
        if base_url.password:
            monkeypatch.setenv("PGPASSWORD", base_url.password)
        source_url = _render_url(base_url, source_name)
        target_url = _render_url(base_url, target_name)
        command.upgrade(_alembic_config(source_url), "head")

        source_engine = sa.create_engine(source_url, poolclass=sa.pool.NullPool)
        try:
            with source_engine.begin() as connection:
                server_version_num = int(
                    connection.exec_driver_sql(
                        "SELECT current_setting('server_version_num')"
                    ).scalar_one()
                )
                connection.execute(
                    sa.text(
                        "UPDATE data_revision "
                        "SET revision = :revision, updated_at = :updated_at WHERE id = 1"
                    ),
                    {
                        "revision": 1818,
                        "updated_at": datetime(2026, 9, 4, tzinfo=timezone.utc),
                    },
                )
                connection.execute(
                    sa.text(
                        "INSERT INTO process_types "
                        "(code, prefix, suffix, stage_order, description) "
                        "VALUES ('I8', 'I', '8', 1818, :description)"
                    ),
                    {"description": "백업 복원 증거"},
                )
                connection.exec_driver_sql(
                    "CREATE TYPE ic18_backup_state AS ENUM ('ready', 'restored')"
                )
                connection.exec_driver_sql(
                    "CREATE SEQUENCE ic18_evidence_sequence START WITH 41"
                )
                assert connection.exec_driver_sql(
                    "SELECT nextval('ic18_evidence_sequence')"
                ).scalar_one() == 41
                connection.exec_driver_sql(
                    "CREATE TABLE ic18_fk_parent (id INTEGER PRIMARY KEY)"
                )
                connection.exec_driver_sql(
                    "CREATE TABLE ic18_fk_child ("
                    "id INTEGER PRIMARY KEY, "
                    "parent_id INTEGER REFERENCES ic18_fk_parent(id))"
                )
                connection.exec_driver_sql("SET LOCAL session_replication_role = replica")
                connection.exec_driver_sql(
                    "INSERT INTO ic18_fk_child (id, parent_id) VALUES (1, 404)"
                )
                connection.exec_driver_sql("SET LOCAL session_replication_role = origin")
                with pytest.raises(
                    backup_manifest.BackupValidationError,
                    match="foreign key violations",
                ):
                    backup_manifest._foreign_key_check(connection)
                connection.exec_driver_sql("DROP TABLE ic18_fk_child")
                connection.exec_driver_sql("DROP TABLE ic18_fk_parent")
        finally:
            source_engine.dispose()
        assert 160000 <= server_version_num < 170000

        host = base_url.host or "127.0.0.1"
        port = base_url.port or 5432
        user = base_url.username or "postgres"
        artifact = backup_db.backup_postgres(
            None,
            host,
            port,
            user,
            source_name,
        )
        receipt = backup_manifest.verify_manifest_receipt(
            artifact,
            expected_engine="postgresql",
        )
        assert receipt.status is backup_manifest.BackupStatus.PASS
        assert receipt.manifest is not None
        assert str(
            receipt.manifest["database"]["snapshot_metadata"]["server_version"]
        ).startswith("16.")

        restore_db.restore_postgres(
            str(artifact),
            None,
            host,
            port,
            user,
            target_name,
            run_check=True,
            assume_yes=True,
        )
        target_engine = sa.create_engine(target_url, poolclass=sa.pool.NullPool)
        try:
            with target_engine.connect() as connection:
                assert connection.execute(
                    sa.text("SELECT revision FROM data_revision WHERE id = 1")
                ).scalar_one() == 1818
                assert connection.execute(
                    sa.text("SELECT description FROM process_types WHERE code = 'I8'")
                ).scalar_one() == "백업 복원 증거"
                assert connection.execute(
                    sa.text(
                        "SELECT enumlabel FROM pg_enum "
                        "JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
                        "WHERE typname = 'ic18_backup_state' ORDER BY enumsortorder"
                    )
                ).scalars().all() == ["ready", "restored"]
                assert connection.exec_driver_sql(
                    "SELECT nextval('ic18_evidence_sequence')"
                ).scalar_one() == 42
        finally:
            target_engine.dispose()

        target_engine = sa.create_engine(target_url, poolclass=sa.pool.NullPool)
        try:
            with target_engine.begin() as connection:
                connection.execute(
                    sa.text(
                        "UPDATE data_revision "
                        "SET revision = 1919, updated_at = :updated_at WHERE id = 1"
                    ),
                    {"updated_at": datetime(2026, 9, 4, 1, tzinfo=timezone.utc)},
                )
        finally:
            target_engine.dispose()

        original_cutover = restore_db._cutover_postgres_candidate

        def fail_installed_target(
            connection: sa.Connection,
            *,
            candidate_name: str,
            target_name: str,
            postcheck: object,
            recovery_receipt: Path | None = None,
            system_identifier: str | None = None,
            lock_already_held: bool = False,
        ) -> None:
            def fail_postcheck() -> None:
                raise backup_manifest.BackupValidationError(
                    "injected installed target postcheck failure"
                )

            original_cutover(
                connection,
                candidate_name=candidate_name,
                target_name=target_name,
                postcheck=fail_postcheck,
                recovery_receipt=recovery_receipt,
                system_identifier=system_identifier,
                lock_already_held=lock_already_held,
            )

        with monkeypatch.context() as target_failure:
            target_failure.setattr(
                restore_db,
                "_cutover_postgres_candidate",
                fail_installed_target,
            )
            with pytest.raises(SystemExit):
                restore_db.restore_postgres(
                    str(artifact),
                    None,
                    host,
                    port,
                    user,
                    target_name,
                    run_check=False,
                    assume_yes=True,
                )

        target_engine = sa.create_engine(target_url, poolclass=sa.pool.NullPool)
        try:
            with target_engine.connect() as connection:
                assert connection.execute(
                    sa.text("SELECT revision FROM data_revision WHERE id = 1")
                ).scalar_one() == 1919
        finally:
            target_engine.dispose()

        corrupted = artifact.with_name(f"mes_corrupt_{uuid4().hex}.sql")
        shutil.copyfile(artifact, corrupted)
        with corrupted.open("a", encoding="utf-8") as handle:
            handle.write("\nSELECT * FROM ic18_deliberately_missing_table;\n")
        corrupted_manifest = deepcopy(receipt.manifest)
        corrupted_manifest["artifact"] = {
            "name": corrupted.name,
            "sha256": backup_manifest.file_sha256(corrupted),
            "size": corrupted.stat().st_size,
        }
        backup_manifest.manifest_path_for(corrupted).write_text(
            json.dumps(corrupted_manifest),
            encoding="utf-8",
        )

        with pytest.raises(SystemExit):
            restore_db.restore_postgres(
                str(corrupted),
                None,
                host,
                port,
                user,
                target_name,
                run_check=False,
                assume_yes=True,
            )

        target_engine = sa.create_engine(target_url, poolclass=sa.pool.NullPool)
        admin_engine = sa.create_engine(
            base_url.set(database="postgres"),
            poolclass=sa.pool.NullPool,
        )
        try:
            with target_engine.connect() as connection:
                assert connection.execute(
                    sa.text("SELECT revision FROM data_revision WHERE id = 1")
                ).scalar_one() == 1919
            with admin_engine.connect() as connection:
                assert connection.execute(
                    sa.text(
                        "SELECT datname FROM pg_database "
                        "WHERE datname LIKE 'test_ic18_backup_verify_%'"
                    )
                ).all() == []
        finally:
            target_engine.dispose()
            admin_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgres_restore_recovers_cutover_before_missing_source_validation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A new invocation repairs a crash receipt before inspecting its new source."""

    class SimulatedProcessCrash(BaseException):
        pass

    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime"))
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    with _disposable_databases() as (base_url, candidate_name, target_name):
        if base_url.password:
            monkeypatch.setenv("PGPASSWORD", base_url.password)
        admin_url = base_url.set(database="postgres")
        admin_engine = sa.create_engine(admin_url, poolclass=sa.pool.NullPool)
        host = base_url.host or "127.0.0.1"
        port = base_url.port or 5432
        user = base_url.username or "postgres"
        original_rename = restore_db._rename_postgres_database
        try:
            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                connection.exec_driver_sql(f'CREATE DATABASE "{target_name}"')
                target_oid = restore_db._postgres_database_oid(connection, target_name)
                assert target_oid is not None
                system_identifier = restore_db._postgres_system_identifier(connection)
                receipt = restore_db._postgres_cutover_receipt_path(
                    system_identifier,
                    target_name,
                )

                def crash_after_target_rename(
                    rename_connection: sa.engine.Connection,
                    old_name: str,
                    new_name: str,
                ) -> None:
                    original_rename(rename_connection, old_name, new_name)
                    if old_name == target_name:
                        raise SimulatedProcessCrash()

                monkeypatch.setattr(
                    restore_db,
                    "_rename_postgres_database",
                    crash_after_target_rename,
                )
                with pytest.raises(SimulatedProcessCrash):
                    restore_db._cutover_postgres_candidate(
                        connection,
                        candidate_name=candidate_name,
                        target_name=target_name,
                        postcheck=lambda: None,
                        recovery_receipt=receipt,
                        system_identifier=system_identifier,
                    )
                assert receipt.is_file()
                assert restore_db._postgres_database_oid(connection, target_name) is None

            monkeypatch.setattr(
                restore_db,
                "_rename_postgres_database",
                original_rename,
            )
            with pytest.raises(SystemExit):
                restore_db.restore_postgres(
                    str(tmp_path / "missing.sql"),
                    None,
                    host,
                    port,
                    user,
                    target_name,
                    run_check=False,
                    assume_yes=True,
                    validation_url=TEST_POSTGRES_URL,
                )

            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                assert restore_db._postgres_database_oid(connection, target_name) == target_oid
                assert restore_db._postgres_database_oid(connection, candidate_name) is None
            assert not receipt.exists()
        finally:
            admin_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgres_restore_recovers_created_candidate_before_missing_source_validation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A durable pre-create allocation removes only its abandoned candidate."""

    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime"))
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    with _disposable_databases() as (base_url, _source_name, target_name):
        if base_url.password:
            monkeypatch.setenv("PGPASSWORD", base_url.password)
        admin_url = base_url.set(database="postgres")
        admin_engine = sa.create_engine(admin_url, poolclass=sa.pool.NullPool)
        candidate_name = f"ic18_restore_candidate_{uuid4().hex[:12]}"
        host = base_url.host or "127.0.0.1"
        port = base_url.port or 5432
        user = base_url.username or "postgres"
        try:
            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                system_identifier = restore_db._postgres_system_identifier(connection)
                receipt = restore_db._postgres_restore_operation_receipt_path(
                    system_identifier,
                    target_name,
                )
                connection.exec_driver_sql(f'CREATE DATABASE "{candidate_name}"')
                candidate_oid = restore_db._postgres_database_oid(
                    connection,
                    candidate_name,
                )
                assert candidate_oid is not None
                restore_db._write_postgres_cutover_receipt(
                    receipt,
                    {
                        "contract": restore_db.POSTGRES_RESTORE_OPERATION_CONTRACT,
                        "system_identifier": system_identifier,
                        "target_name": target_name,
                        "candidate_name": candidate_name,
                        "candidate_oid": candidate_oid,
                        "owner": {"pid": 2_147_483_647, "started_at_ns": 1},
                    },
                    state="candidate_created",
                )

            with pytest.raises(SystemExit):
                restore_db.restore_postgres(
                    str(tmp_path / "missing.sql"),
                    None,
                    host,
                    port,
                    user,
                    target_name,
                    run_check=False,
                    assume_yes=True,
                    validation_url=TEST_POSTGRES_URL,
                )

            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                assert restore_db._postgres_database_oid(connection, candidate_name) is None
            assert not receipt.exists()
        finally:
            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                restore_db._drop_postgres_database(connection, candidate_name)
            admin_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgres_restore_recovers_hard_crash_after_created_oid_receipt(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime_root = tmp_path / "runtime-created-oid-crash"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    with _disposable_databases() as (base_url, _source_name, target_name):
        if base_url.password:
            monkeypatch.setenv("PGPASSWORD", base_url.password)
        artifact = tmp_path / "created-oid-crash.sql"
        artifact.write_text("SELECT 1;\n", encoding="utf-8")
        evidence = {
            "engine": "postgresql",
            "alembic_revision": "20260831_0033",
            "schema_fingerprint": "0" * 64,
            "data_revision": {"revision": 1, "updated_at": "2026-09-04T00:00:00Z"},
            "snapshot_hash": "1" * 64,
            "oracle_hash": "2" * 64,
            "snapshot_metadata": {"server_version": "16.15"},
            "verification": {
                "status": "PASS",
                "schema": "PASS",
                "sqlite_integrity": "NOT_APPLICABLE",
                "foreign_keys": "PASS",
                "inventory": {
                    "contract": backup_manifest.INVENTORY_CONTRACT,
                    "status": "pass",
                    "blocking_count": 0,
                    "warning_count": 0,
                    "checks": [],
                },
            },
        }
        manifest = backup_manifest.build_manifest(
            artifact,
            published_name=artifact.name,
            evidence=evidence,
            source_snapshot={"method": "pg_dump", "transaction_snapshot": True},
        )
        backup_manifest.manifest_path_for(artifact).write_text(
            json.dumps(manifest),
            encoding="utf-8",
        )
        host = base_url.host or "127.0.0.1"
        port = base_url.port or 5432
        user = base_url.username or "postgres"
        child = f"""
import os
from scripts.ops import restore_db
original = restore_db._record_postgres_restore_candidate_oid
def record_then_crash(*args, **kwargs):
    original(*args, **kwargs)
    os._exit(91)
restore_db._record_postgres_restore_candidate_oid = record_then_crash
restore_db.restore_postgres(
    {str(artifact)!r}, None, {host!r}, {port!r}, {user!r}, {target_name!r},
    run_check=False, assume_yes=True, validation_url={TEST_POSTGRES_URL!r}
)
"""
        result = subprocess.run(
            [sys.executable, "-c", child],
            cwd=PROJECT_ROOT,
            env=os.environ.copy(),
            check=False,
        )
        assert result.returncode == 91

        admin_url = base_url.set(database="postgres")
        admin_engine = sa.create_engine(admin_url, poolclass=sa.pool.NullPool)
        candidate_name: str | None = None
        try:
            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                system_identifier = restore_db._postgres_system_identifier(connection)
                receipt = restore_db._postgres_restore_operation_receipt_path(
                    system_identifier,
                    target_name,
                )
                payload = json.loads(receipt.read_text(encoding="utf-8"))
                candidate_name = str(payload["candidate_name"])
                assert payload["state"] == "candidate_created"
                assert restore_db._postgres_database_oid(
                    connection,
                    candidate_name,
                ) == payload["candidate_oid"]

            monkeypatch.setenv(
                "MES_RUNTIME_ROOT",
                str(tmp_path / "runtime-created-oid-recovery"),
            )
            recovery_receipt = restore_db._postgres_restore_operation_receipt_path(
                system_identifier,
                target_name,
            )
            assert recovery_receipt != receipt
            with restore_db._postgres_restore_operation_scope(
                _render_url(base_url, "postgres"),
                target_name=target_name,
            ):
                pass

            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                assert restore_db._postgres_database_oid(
                    connection,
                    candidate_name,
                ) is None
            assert not recovery_receipt.exists()
            assert receipt.is_file()

            monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
            with restore_db._postgres_restore_operation_scope(
                _render_url(base_url, "postgres"),
                target_name=target_name,
            ):
                pass
            assert not receipt.exists()
        finally:
            if candidate_name is not None:
                with admin_engine.connect().execution_options(
                    isolation_level="AUTOCOMMIT"
                ) as connection:
                    restore_db._drop_postgres_database(connection, candidate_name)
            admin_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgres_restore_recovers_cross_root_crash_before_oid_marker(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A created database is recoverable even if the OID callback never starts."""

    original_runtime_root = tmp_path / "runtime-before-oid-crash"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(original_runtime_root))
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    with _disposable_databases() as (base_url, _source_name, target_name):
        if base_url.password:
            monkeypatch.setenv("PGPASSWORD", base_url.password)
        artifact = tmp_path / "before-oid-crash.sql"
        artifact.write_text("SELECT 1;\n", encoding="utf-8")
        evidence = {
            "engine": "postgresql",
            "alembic_revision": "20260831_0033",
            "schema_fingerprint": "0" * 64,
            "data_revision": {"revision": 1, "updated_at": "2026-09-04T00:00:00Z"},
            "snapshot_hash": "1" * 64,
            "oracle_hash": "2" * 64,
            "snapshot_metadata": {"server_version": "16.15"},
            "verification": {
                "status": "PASS",
                "schema": "PASS",
                "sqlite_integrity": "NOT_APPLICABLE",
                "foreign_keys": "PASS",
                "inventory": {
                    "contract": backup_manifest.INVENTORY_CONTRACT,
                    "status": "pass",
                    "blocking_count": 0,
                    "warning_count": 0,
                    "checks": [],
                },
            },
        }
        manifest = backup_manifest.build_manifest(
            artifact,
            published_name=artifact.name,
            evidence=evidence,
            source_snapshot={"method": "pg_dump", "transaction_snapshot": True},
        )
        backup_manifest.manifest_path_for(artifact).write_text(
            json.dumps(manifest),
            encoding="utf-8",
        )
        host = base_url.host or "127.0.0.1"
        port = base_url.port or 5432
        user = base_url.username or "postgres"
        child = f"""
import os
from scripts.ops import restore_db
restore_db._record_postgres_restore_candidate_oid = lambda *args, **kwargs: os._exit(93)
restore_db.restore_postgres(
    {str(artifact)!r}, None, {host!r}, {port!r}, {user!r}, {target_name!r},
    run_check=False, assume_yes=True, validation_url={TEST_POSTGRES_URL!r}
)
"""
        result = subprocess.run(
            [sys.executable, "-c", child],
            cwd=PROJECT_ROOT,
            env=os.environ.copy(),
            check=False,
        )
        assert result.returncode == 93

        admin_engine = sa.create_engine(
            base_url.set(database="postgres"),
            poolclass=sa.pool.NullPool,
        )
        candidate_name: str | None = None
        try:
            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                system_identifier = restore_db._postgres_system_identifier(connection)
                original_receipt = restore_db._postgres_restore_operation_receipt_path(
                    system_identifier,
                    target_name,
                )
                payload = json.loads(original_receipt.read_text(encoding="utf-8"))
                candidate_name = str(payload["candidate_name"])
                assert payload["state"] == "candidate_allocated"
                assert restore_db._postgres_database_oid(connection, candidate_name) is not None

            monkeypatch.setenv(
                "MES_RUNTIME_ROOT",
                str(tmp_path / "runtime-before-oid-recovery"),
            )
            with restore_db._postgres_restore_operation_scope(
                _render_url(base_url, "postgres"),
                target_name=target_name,
            ):
                pass

            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                assert restore_db._postgres_database_oid(connection, candidate_name) is None

            monkeypatch.setenv("MES_RUNTIME_ROOT", str(original_runtime_root))
            with restore_db._postgres_restore_operation_scope(
                _render_url(base_url, "postgres"),
                target_name=target_name,
            ):
                pass
            assert not original_receipt.exists()
        finally:
            if candidate_name is not None:
                with admin_engine.connect().execution_options(
                    isolation_level="AUTOCOMMIT"
                ) as connection:
                    restore_db._drop_postgres_database(connection, candidate_name)
            admin_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
@pytest.mark.parametrize(
    ("failure_point", "exit_code", "committed"),
    [
        ("target-admission-closed", 101, False),
        ("target-renamed", 102, False),
        ("candidate-installed", 103, False),
        ("committed", 104, True),
        ("cluster-committed", 106, True),
    ],
)
def test_postgres_cutover_recovers_cross_root_hard_crash_from_cluster_marker(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    failure_point: str,
    exit_code: int,
    committed: bool,
) -> None:
    """Every catalog transition converges from a different runtime root."""

    original_runtime_root = tmp_path / f"runtime-cutover-{failure_point}"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(original_runtime_root))
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    with _disposable_databases() as (base_url, candidate_name, target_name):
        admin_url = _render_url(base_url, "postgres")
        admin_engine = sa.create_engine(admin_url, poolclass=sa.pool.NullPool)
        cleanup_names = {candidate_name, target_name}
        original_target_oid: int | None = None
        candidate_oid: int | None = None
        system_identifier = ""
        try:
            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                connection.exec_driver_sql(f'CREATE DATABASE "{target_name}"')
                original_target_oid = restore_db._postgres_database_oid(
                    connection,
                    target_name,
                )
                candidate_oid = restore_db._postgres_database_oid(
                    connection,
                    candidate_name,
                )
                system_identifier = restore_db._postgres_system_identifier(connection)
                assert original_target_oid is not None and candidate_oid is not None
                restore_db._write_postgres_restore_cluster_marker(
                    connection,
                    {
                        "contract": restore_db.POSTGRES_RESTORE_OPERATION_CONTRACT,
                        "system_identifier": system_identifier,
                        "target_name": target_name,
                        "candidate_name": candidate_name,
                        "candidate_oid": candidate_oid,
                        "owner": {"pid": 2_147_483_647, "started_at_ns": 1},
                    },
                    state="candidate_created",
                )

            child = f"""
import os
import sqlalchemy as sa
from scripts.ops import restore_db
engine = sa.create_engine({admin_url!r}, poolclass=sa.pool.NullPool)
with engine.connect().execution_options(isolation_level='AUTOCOMMIT') as connection:
    original_allow = restore_db._set_postgres_allow_connections
    original_rename = restore_db._rename_postgres_database
    original_write = restore_db._write_postgres_cutover_receipt
    original_marker = restore_db._write_postgres_restore_cluster_marker
    def allow_then_crash(conn, name, allowed):
        original_allow(conn, name, allowed)
        if {failure_point!r} == 'target-admission-closed' and name == {target_name!r} and not allowed:
            os._exit({exit_code})
    def rename_then_crash(conn, old_name, new_name):
        original_rename(conn, old_name, new_name)
        if {failure_point!r} == 'target-renamed' and old_name == {target_name!r}:
            os._exit({exit_code})
        if {failure_point!r} == 'candidate-installed' and old_name == {candidate_name!r}:
            os._exit({exit_code})
    def write_then_crash(path, payload, *, state):
        original_write(path, payload, state=state)
        if {failure_point!r} == 'committed' and state == 'committed':
            os._exit({exit_code})
    def marker_then_crash(conn, payload, *, state):
        original_marker(conn, payload, state=state)
        if {failure_point!r} == 'cluster-committed' and state == 'committed':
            os._exit({exit_code})
    restore_db._set_postgres_allow_connections = allow_then_crash
    restore_db._rename_postgres_database = rename_then_crash
    restore_db._write_postgres_cutover_receipt = write_then_crash
    restore_db._write_postgres_restore_cluster_marker = marker_then_crash
    restore_db._cutover_postgres_candidate(
        connection,
        candidate_name={candidate_name!r},
        target_name={target_name!r},
        postcheck=lambda: None,
        system_identifier={system_identifier!r},
    )
"""
            result = subprocess.run(
                [sys.executable, "-c", child],
                cwd=PROJECT_ROOT,
                env=os.environ.copy(),
                check=False,
            )
            assert result.returncode == exit_code

            original_receipt = restore_db._postgres_cutover_receipt_path(
                system_identifier,
                target_name,
            )
            if original_receipt.is_file():
                receipt_payload = json.loads(original_receipt.read_text(encoding="utf-8"))
                cleanup_names.update(
                    {
                        str(receipt_payload["rollback_name"]),
                        str(receipt_payload["failed_name"]),
                    }
                )

            monkeypatch.setenv(
                "MES_RUNTIME_ROOT",
                str(tmp_path / f"runtime-cutover-recovery-{failure_point}"),
            )
            with restore_db._postgres_restore_operation_scope(
                admin_url,
                target_name=target_name,
            ):
                pass

            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                expected_oid = candidate_oid if committed else original_target_oid
                assert restore_db._postgres_database_oid(connection, target_name) == expected_oid
                assert connection.execute(
                    sa.text(
                        "SELECT datallowconn FROM pg_database WHERE datname = :target_name"
                    ),
                    {"target_name": target_name},
                ).scalar_one() is True
                marker_prefix = restore_db._postgres_cluster_recovery_marker_prefix(
                    system_identifier,
                    target_name,
                )
                assert connection.execute(
                    sa.text(
                        "SELECT count(*) FROM pg_database WHERE "
                        "left(coalesce(shobj_description(oid, 'pg_database'), ''), :length) = :prefix"
                    ),
                    {"length": len(marker_prefix), "prefix": marker_prefix},
                ).scalar_one() == 0

            monkeypatch.setenv("MES_RUNTIME_ROOT", str(original_runtime_root))
            with restore_db._postgres_restore_operation_scope(
                admin_url,
                target_name=target_name,
            ):
                pass
            assert not original_receipt.exists()
        finally:
            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                for name in cleanup_names:
                    restore_db._drop_postgres_database(connection, name)
            admin_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
@pytest.mark.parametrize("corruption", ["local-identity", "cluster-json"])
def test_postgres_cutover_rejects_marker_mismatch_before_catalog_mutation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    corruption: str,
) -> None:
    runtime_root = tmp_path / f"runtime-marker-mismatch-{corruption}"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    with _disposable_databases() as (base_url, candidate_name, target_name):
        admin_url = _render_url(base_url, "postgres")
        admin_engine = sa.create_engine(admin_url, poolclass=sa.pool.NullPool)
        receipt: Path | None = None
        try:
            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                connection.exec_driver_sql(f'CREATE DATABASE "{target_name}"')
                candidate_oid = restore_db._postgres_database_oid(
                    connection,
                    candidate_name,
                )
                target_oid = restore_db._postgres_database_oid(connection, target_name)
                system_identifier = restore_db._postgres_system_identifier(connection)
                assert candidate_oid is not None and target_oid is not None
                suffix = uuid4().hex[:12]
                payload = {
                    "contract": restore_db.POSTGRES_CUTOVER_RECOVERY_CONTRACT,
                    "system_identifier": system_identifier,
                    "target_name": target_name,
                    "candidate_name": candidate_name,
                    "rollback_name": f"ic18_restore_rollback_{suffix}",
                    "failed_name": f"ic18_restore_failed_{suffix}",
                    "target_existed": True,
                    "target_oid": target_oid,
                    "candidate_oid": candidate_oid,
                }
                if corruption == "local-identity":
                    restore_db._write_postgres_restore_cluster_marker(
                        connection,
                        payload,
                        state="prepared",
                    )
                    receipt = restore_db._postgres_cutover_receipt_path(
                        system_identifier,
                        target_name,
                    )
                    other_suffix = uuid4().hex[:12]
                    restore_db._write_postgres_cutover_receipt(
                        receipt,
                        {
                            **payload,
                            "rollback_name": f"ic18_restore_rollback_{other_suffix}",
                            "failed_name": f"ic18_restore_failed_{other_suffix}",
                        },
                        state="prepared",
                    )
                else:
                    prefix = restore_db._postgres_cluster_recovery_marker_prefix(
                        system_identifier,
                        target_name,
                    )
                    restore_db._set_postgres_database_comment(
                        connection,
                        candidate_name,
                        prefix + "{not-json",
                    )

                before = connection.execute(
                    sa.text(
                        "SELECT datname, oid, datallowconn FROM pg_database "
                        "WHERE datname IN (:candidate_name, :target_name) ORDER BY datname"
                    ),
                    {"candidate_name": candidate_name, "target_name": target_name},
                ).all()

            with pytest.raises(OSError):
                with restore_db._postgres_restore_operation_scope(
                    admin_url,
                    target_name=target_name,
                ):
                    pass

            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                after = connection.execute(
                    sa.text(
                        "SELECT datname, oid, datallowconn FROM pg_database "
                        "WHERE datname IN (:candidate_name, :target_name) ORDER BY datname"
                    ),
                    {"candidate_name": candidate_name, "target_name": target_name},
                ).all()
                assert after == before
        finally:
            if receipt is not None:
                receipt.unlink(missing_ok=True)
            admin_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgres_cutover_rejects_local_receipt_identity_mismatch_before_mutation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime_root = tmp_path / "runtime-local-receipt-mismatch"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    with _disposable_databases() as (base_url, candidate_name, target_name):
        admin_url = _render_url(base_url, "postgres")
        admin_engine = sa.create_engine(admin_url, poolclass=sa.pool.NullPool)
        other_candidate = f"ic18_restore_candidate_{uuid4().hex[:12]}"
        cutover_receipt: Path | None = None
        operation_receipt: Path | None = None
        try:
            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                connection.exec_driver_sql(f'CREATE DATABASE "{target_name}"')
                connection.exec_driver_sql(f'CREATE DATABASE "{other_candidate}"')
                candidate_oid = restore_db._postgres_database_oid(
                    connection,
                    candidate_name,
                )
                target_oid = restore_db._postgres_database_oid(connection, target_name)
                other_oid = restore_db._postgres_database_oid(connection, other_candidate)
                system_identifier = restore_db._postgres_system_identifier(connection)
                assert candidate_oid is not None
                assert target_oid is not None
                assert other_oid is not None
                suffix = uuid4().hex[:12]
                rollback_name = f"ic18_restore_rollback_{suffix}"
                restore_db._rename_postgres_database(
                    connection,
                    target_name,
                    rollback_name,
                )
                restore_db._rename_postgres_database(
                    connection,
                    candidate_name,
                    target_name,
                )
                restore_db._drop_postgres_database(connection, rollback_name)

                cutover_receipt = restore_db._postgres_cutover_receipt_path(
                    system_identifier,
                    target_name,
                )
                operation_receipt = restore_db._postgres_restore_operation_receipt_path(
                    system_identifier,
                    target_name,
                )
                restore_db._write_postgres_cutover_receipt(
                    cutover_receipt,
                    {
                        "contract": restore_db.POSTGRES_CUTOVER_RECOVERY_CONTRACT,
                        "system_identifier": system_identifier,
                        "target_name": target_name,
                        "candidate_name": candidate_name,
                        "rollback_name": rollback_name,
                        "failed_name": f"ic18_restore_failed_{suffix}",
                        "target_existed": True,
                        "target_oid": target_oid,
                        "candidate_oid": candidate_oid,
                    },
                    state="candidate_installed",
                )
                restore_db._write_postgres_cutover_receipt(
                    operation_receipt,
                    {
                        "contract": restore_db.POSTGRES_RESTORE_OPERATION_CONTRACT,
                        "system_identifier": system_identifier,
                        "target_name": target_name,
                        "candidate_name": other_candidate,
                        "candidate_oid": other_oid,
                        "owner": {"pid": 2_147_483_647, "started_at_ns": 1},
                    },
                    state="candidate_created",
                )
                before = connection.execute(
                    sa.text(
                        "SELECT datname, oid, datallowconn FROM pg_database "
                        "WHERE datname IN (:target_name, :other_candidate) ORDER BY datname"
                    ),
                    {"target_name": target_name, "other_candidate": other_candidate},
                ).all()
                cutover_bytes = cutover_receipt.read_bytes()
                operation_bytes = operation_receipt.read_bytes()

            with pytest.raises(OSError, match="operation receipt/cutover"):
                with restore_db._postgres_restore_operation_scope(
                    admin_url,
                    target_name=target_name,
                ):
                    pass

            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                after = connection.execute(
                    sa.text(
                        "SELECT datname, oid, datallowconn FROM pg_database "
                        "WHERE datname IN (:target_name, :other_candidate) ORDER BY datname"
                    ),
                    {"target_name": target_name, "other_candidate": other_candidate},
                ).all()
                assert after == before
            assert cutover_receipt.read_bytes() == cutover_bytes
            assert operation_receipt.read_bytes() == operation_bytes
        finally:
            if cutover_receipt is not None:
                cutover_receipt.unlink(missing_ok=True)
            if operation_receipt is not None:
                operation_receipt.unlink(missing_ok=True)
            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                restore_db._drop_postgres_database(connection, other_candidate)
            admin_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgres_backup_validation_fences_writer_before_evidence(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime-backup-fence"))
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    with _disposable_databases() as (base_url, source_name, _target_name):
        if base_url.password:
            monkeypatch.setenv("PGPASSWORD", base_url.password)
        source_url = _render_url(base_url, source_name)
        command.upgrade(_alembic_config(source_url), "head")
        host = base_url.host or "127.0.0.1"
        port = base_url.port or 5432
        user = base_url.username or "postgres"
        dump = tmp_path / "backup-validation-fence.sql"
        result = subprocess.run(
            [
                "pg_dump",
                "-h",
                host,
                "-p",
                str(port),
                "-U",
                user,
                "--encoding=UTF8",
                source_name,
            ],
            capture_output=True,
            check=True,
        )
        dump.write_bytes(result.stdout)
        original_collect = backup_manifest.collect_database_evidence_from_connection
        original_import = backup_db._run_postgres_import_with_admission_fence
        fenced_candidates: list[str] = []
        import_writer_attempts: list[str] = []

        def attempt_writer_during_import(
            import_command: list[str],
            payload: bytes,
            on_importer_connected: object,
        ) -> None:
            candidate_name = import_command[import_command.index("-d") + 1]
            assert callable(on_importer_connected)

            def fence_then_attempt(importer_pid: int) -> None:
                on_importer_connected(importer_pid)
                writer_engine = sa.create_engine(
                    _render_url(base_url, candidate_name),
                    poolclass=sa.pool.NullPool,
                )
                try:
                    with pytest.raises(sa.exc.OperationalError):
                        with writer_engine.begin() as writer:
                            writer.exec_driver_sql("SELECT 1")
                    import_writer_attempts.append("blocked")
                finally:
                    writer_engine.dispose()

            original_import(import_command, payload, fence_then_attempt)

        def attempt_writer_before_evidence(
            connection: sa.Connection,
            *,
            expected_engine: str | None = None,
        ) -> dict[str, object]:
            candidate_name = str(connection.engine.url.database)
            fenced_candidates.append(candidate_name)
            writer_engine = sa.create_engine(
                _render_url(base_url, candidate_name),
                poolclass=sa.pool.NullPool,
            )
            try:
                with pytest.raises(sa.exc.OperationalError):
                    with writer_engine.begin() as writer:
                        writer.exec_driver_sql("SELECT 1")
            finally:
                writer_engine.dispose()
            return original_collect(
                connection,
                expected_engine=expected_engine,
            )

        monkeypatch.setattr(
            backup_db,
            "collect_database_evidence_from_connection",
            attempt_writer_before_evidence,
        )
        monkeypatch.setattr(
            backup_db,
            "_run_postgres_import_with_admission_fence",
            attempt_writer_during_import,
        )
        evidence = backup_db._validate_postgres_dump(
            dump,
            container=None,
            host=host,
            port=port,
            user=user,
            validation_url=TEST_POSTGRES_URL,
        )

        assert evidence["verification"]["status"] == "PASS"
        assert import_writer_attempts == ["blocked"]
        assert len(fenced_candidates) == 1
        admin_engine = sa.create_engine(
            base_url.set(database="postgres"),
            poolclass=sa.pool.NullPool,
        )
        try:
            with admin_engine.connect() as connection:
                assert restore_db._postgres_database_oid(
                    connection,
                    fenced_candidates[0],
                ) is None
        finally:
            admin_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgres_backup_validation_rejects_different_mutation_cluster(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime-cluster-mismatch"))
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    base_url = sa.engine.make_url(TEST_POSTGRES_URL)
    user = base_url.username or "postgres"
    primary_admin_url = _render_url(base_url, "postgres")
    dump = tmp_path / "different-cluster.sql"
    dump.write_text("SELECT 1;\n", encoding="utf-8")

    with _secondary_postgres_cluster(tmp_path, user=user) as (
        secondary_port,
        secondary_admin_url,
    ):
        before_primary = _candidate_database_names(primary_admin_url)
        before_secondary = _candidate_database_names(secondary_admin_url)

        with pytest.raises(
            backup_manifest.BackupValidationError,
            match="cluster identifier mismatch",
        ):
            backup_db._validate_postgres_dump(
                dump,
                container=None,
                host="127.0.0.1",
                port=secondary_port,
                user=user,
                validation_url=TEST_POSTGRES_URL,
            )

        assert _candidate_database_names(primary_admin_url) == before_primary
        assert _candidate_database_names(secondary_admin_url) == before_secondary


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgres_backup_validation_recovers_hard_crash_exact_candidate(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime_root = tmp_path / "runtime-backup-crash"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    with _disposable_databases() as (base_url, _source_name, _target_name):
        if base_url.password:
            monkeypatch.setenv("PGPASSWORD", base_url.password)
        host = base_url.host or "127.0.0.1"
        port = base_url.port or 5432
        user = base_url.username or "postgres"
        dump = tmp_path / "backup-validation-crash.sql"
        dump.write_text("SELECT 1;\n", encoding="utf-8")
        child = f"""
import os
from scripts.ops import backup_db, restore_db
original = restore_db._record_postgres_restore_candidate_oid
def record_then_crash(*args, **kwargs):
    original(*args, **kwargs)
    os._exit(92)
restore_db._record_postgres_restore_candidate_oid = record_then_crash
backup_db._validate_postgres_dump(
    __import__('pathlib').Path({str(dump)!r}), container=None,
    host={host!r}, port={port!r}, user={user!r}, validation_url={TEST_POSTGRES_URL!r}
)
"""
        result = subprocess.run(
            [sys.executable, "-c", child],
            cwd=PROJECT_ROOT,
            env=os.environ.copy(),
            check=False,
        )
        assert result.returncode == 92

        admin_engine = sa.create_engine(
            base_url.set(database="postgres"),
            poolclass=sa.pool.NullPool,
        )
        candidate_name: str | None = None
        try:
            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                system_identifier = restore_db._postgres_system_identifier(connection)
                receipt = restore_db._postgres_restore_operation_receipt_path(
                    system_identifier,
                    backup_db.POSTGRES_BACKUP_VALIDATION_TARGET,
                )
                payload = json.loads(receipt.read_text(encoding="utf-8"))
                candidate_name = str(payload["candidate_name"])
                assert payload["state"] == "candidate_created"
                assert restore_db._postgres_database_oid(
                    connection,
                    candidate_name,
                ) == payload["candidate_oid"]

            with restore_db._postgres_restore_operation_scope(
                _render_url(base_url, "postgres"),
                target_name=backup_db.POSTGRES_BACKUP_VALIDATION_TARGET,
            ):
                pass

            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                assert restore_db._postgres_database_oid(
                    connection,
                    candidate_name,
                ) is None
            assert not receipt.exists()
        finally:
            if candidate_name is not None:
                with admin_engine.connect().execution_options(
                    isolation_level="AUTOCOMMIT"
                ) as connection:
                    restore_db._drop_postgres_database(connection, candidate_name)
            admin_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgres_backup_validation_recovers_cross_root_crash_before_oid_marker(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_runtime_root = tmp_path / "runtime-backup-before-oid"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(original_runtime_root))
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    with _disposable_databases() as (base_url, _source_name, _target_name):
        if base_url.password:
            monkeypatch.setenv("PGPASSWORD", base_url.password)
        host = base_url.host or "127.0.0.1"
        port = base_url.port or 5432
        user = base_url.username or "postgres"
        dump = tmp_path / "backup-before-oid.sql"
        dump.write_text("SELECT 1;\n", encoding="utf-8")
        child = f"""
import os
from pathlib import Path
from scripts.ops import backup_db, restore_db
restore_db._record_postgres_restore_candidate_oid = lambda *args, **kwargs: os._exit(105)
backup_db._validate_postgres_dump(
    Path({str(dump)!r}), container=None, host={host!r}, port={port!r}, user={user!r},
    validation_url={TEST_POSTGRES_URL!r}
)
"""
        result = subprocess.run(
            [sys.executable, "-c", child],
            cwd=PROJECT_ROOT,
            env=os.environ.copy(),
            check=False,
        )
        assert result.returncode == 105

        admin_url = _render_url(base_url, "postgres")
        admin_engine = sa.create_engine(admin_url, poolclass=sa.pool.NullPool)
        candidate_name: str | None = None
        try:
            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                system_identifier = restore_db._postgres_system_identifier(connection)
                original_receipt = restore_db._postgres_restore_operation_receipt_path(
                    system_identifier,
                    backup_db.POSTGRES_BACKUP_VALIDATION_TARGET,
                )
                payload = json.loads(original_receipt.read_text(encoding="utf-8"))
                candidate_name = str(payload["candidate_name"])
                assert payload["state"] == "candidate_allocated"
                assert restore_db._postgres_database_oid(connection, candidate_name) is not None

            monkeypatch.setenv(
                "MES_RUNTIME_ROOT",
                str(tmp_path / "runtime-backup-before-oid-recovery"),
            )
            with restore_db._postgres_restore_operation_scope(
                admin_url,
                target_name=backup_db.POSTGRES_BACKUP_VALIDATION_TARGET,
            ):
                pass

            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                assert restore_db._postgres_database_oid(connection, candidate_name) is None

            monkeypatch.setenv("MES_RUNTIME_ROOT", str(original_runtime_root))
            with restore_db._postgres_restore_operation_scope(
                admin_url,
                target_name=backup_db.POSTGRES_BACKUP_VALIDATION_TARGET,
            ):
                pass
            assert not original_receipt.exists()
        finally:
            if candidate_name is not None:
                with admin_engine.connect().execution_options(
                    isolation_level="AUTOCOMMIT"
                ) as connection:
                    restore_db._drop_postgres_database(connection, candidate_name)
            admin_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgres_evidence_inventory_uses_one_repeatable_read_snapshot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A committed writer between identity and inventory stays outside evidence."""

    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    with _disposable_databases() as (base_url, source_name, _target_name):
        source_url = _render_url(base_url, source_name)
        command.upgrade(_alembic_config(source_url), "head")
        writer_engine = sa.create_engine(source_url, poolclass=sa.pool.NullPool)
        setting_key = f"ic18_snapshot_{uuid4().hex}"
        original_identity = backup_manifest._snapshot_identity
        original_inventory = backup_manifest._inventory_integrity_from_connection
        snapshot_observations: list[int] = []

        def identity_then_commit_writer(
            connection: sa.Connection,
        ) -> dict[str, object]:
            identity = original_identity(connection)
            with writer_engine.begin() as writer:
                writer.execute(
                    sa.text(
                        "INSERT INTO system_settings (setting_key, setting_value) "
                        "VALUES (:setting_key, 'committed-after-snapshot')"
                    ),
                    {"setting_key": setting_key},
                )
            return identity

        def inventory_in_same_snapshot(
            connection: sa.Connection,
        ) -> dict[str, object]:
            snapshot_observations.append(
                int(
                    connection.execute(
                        sa.text(
                            "SELECT count(*) FROM system_settings "
                            "WHERE setting_key = :setting_key"
                        ),
                        {"setting_key": setting_key},
                    ).scalar_one()
                )
            )
            return original_inventory(connection)

        try:
            monkeypatch.setattr(
                backup_manifest,
                "_snapshot_identity",
                identity_then_commit_writer,
            )
            monkeypatch.setattr(
                backup_manifest,
                "_inventory_integrity_from_connection",
                inventory_in_same_snapshot,
            )
            evidence = backup_manifest.collect_database_evidence(
                source_url,
                expected_engine="postgresql",
            )
            assert evidence["verification"]["status"] == "PASS"
            assert snapshot_observations == [0]
            with writer_engine.connect() as connection:
                assert connection.execute(
                    sa.text(
                        "SELECT count(*) FROM system_settings "
                        "WHERE setting_key = :setting_key"
                    ),
                    {"setting_key": setting_key},
                ).scalar_one() == 1
        finally:
            writer_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgres_candidate_is_admission_fenced_before_evidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    with _disposable_databases() as (base_url, candidate_name, _target_name):
        candidate_url = _render_url(base_url, candidate_name)
        admin_url = _render_url(base_url, "postgres")
        command.upgrade(_alembic_config(candidate_url), "head")
        writer_engine = sa.create_engine(candidate_url, poolclass=sa.pool.NullPool)
        original_collect = backup_manifest.collect_database_evidence_from_connection
        writer_attempts: list[str] = []

        def attempt_writer_before_evidence(
            connection: sa.Connection,
            *,
            expected_engine: str | None = None,
        ) -> dict[str, object]:
            with pytest.raises(sa.exc.OperationalError):
                with writer_engine.begin() as writer:
                    writer.exec_driver_sql(
                        "INSERT INTO system_settings (setting_key, setting_value) "
                        "VALUES ('ic18_candidate_race', 'blocked')"
                    )
            writer_attempts.append("blocked")
            return original_collect(
                connection,
                expected_engine=expected_engine,
            )

        try:
            monkeypatch.setattr(
                backup_manifest,
                "collect_database_evidence_from_connection",
                attempt_writer_before_evidence,
            )
            evidence = restore_db._collect_fenced_postgres_candidate_evidence(
                candidate_url,
                admin_url=admin_url,
                candidate_name=candidate_name,
            )
            assert evidence["verification"]["status"] == "PASS"
            assert writer_attempts == ["blocked"]
        finally:
            writer_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgres_cutover_holds_admission_and_advisory_fences(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No new target session or competing cutover can enter during postcheck."""

    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    with _disposable_databases() as (base_url, candidate_name, target_name):
        admin_url = base_url.set(database="postgres")
        admin_engine = sa.create_engine(admin_url, poolclass=sa.pool.NullPool)
        target_url = _render_url(base_url, target_name)
        target_engine = sa.create_engine(target_url, poolclass=sa.pool.NullPool)
        receipt = tmp_path / "postgres-cutover-recovery.json"
        try:
            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                connection.exec_driver_sql(f'CREATE DATABASE "{target_name}"')

                def assert_fences() -> None:
                    with pytest.raises(sa.exc.OperationalError):
                        with target_engine.connect():
                            pass
                    with admin_engine.connect() as competitor:
                        acquired = bool(
                            competitor.execute(
                                sa.text("SELECT pg_try_advisory_lock(:lock_key)"),
                                {
                                    "lock_key": restore_db._postgres_restore_lock_key(
                                        target_name
                                    )
                                },
                            ).scalar_one()
                        )
                        if acquired:
                            competitor.execute(
                                sa.text("SELECT pg_advisory_unlock(:lock_key)"),
                                {
                                    "lock_key": restore_db._postgres_restore_lock_key(
                                        target_name
                                    )
                                },
                            )
                        assert acquired is False

                restore_db._cutover_postgres_candidate(
                    connection,
                    candidate_name=candidate_name,
                    target_name=target_name,
                    postcheck=assert_fences,
                    recovery_receipt=receipt,
                )

            assert not receipt.exists()
            with target_engine.connect() as connection:
                assert connection.exec_driver_sql("SELECT 1").scalar_one() == 1
        finally:
            target_engine.dispose()
            admin_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgres_operation_scope_holds_cluster_lock_across_runtime_roots(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    monkeypatch.setenv("DEXCOWIN_POSTGRES_TEST_ACK", POSTGRES_ACK)
    with _disposable_databases() as (base_url, _source_name, target_name):
        admin_url = _render_url(base_url, "postgres")
        candidate_name = f"ic18_restore_candidate_{uuid4().hex[:12]}"
        monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime-a"))

        with restore_db._postgres_restore_operation_scope(
            admin_url,
            target_name=target_name,
        ) as (connection, system_identifier, _cutover_receipt, operation_receipt):
            restore_db._claim_postgres_restore_operation_locked(
                connection,
                operation_receipt,
                target_name=target_name,
                system_identifier=system_identifier,
                candidate_name=candidate_name,
            )
            monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime-b"))
            other_root_receipt = restore_db._postgres_restore_operation_receipt_path(
                system_identifier,
                target_name,
            )
            assert other_root_receipt != operation_receipt
            competitor_engine = sa.create_engine(
                base_url.set(database="postgres"),
                poolclass=sa.pool.NullPool,
            )
            try:
                with competitor_engine.connect() as competitor:
                    acquired = bool(
                        competitor.execute(
                            sa.text("SELECT pg_try_advisory_lock(:key)"),
                            {"key": restore_db._postgres_restore_lock_key(target_name)},
                        ).scalar_one()
                    )
                    assert acquired is False
            finally:
                competitor_engine.dispose()
            restore_db._recover_postgres_restore_operation_receipt(
                connection,
                operation_receipt,
                target_name=target_name,
                system_identifier=system_identifier,
                allow_current_owner=True,
            )

        competitor_engine = sa.create_engine(
            base_url.set(database="postgres"),
            poolclass=sa.pool.NullPool,
        )
        try:
            with competitor_engine.connect() as competitor:
                acquired = bool(
                    competitor.execute(
                        sa.text("SELECT pg_try_advisory_lock(:key)"),
                        {"key": restore_db._postgres_restore_lock_key(target_name)},
                    ).scalar_one()
                )
                assert acquired is True
                competitor.execute(
                    sa.text("SELECT pg_advisory_unlock(:key)"),
                    {"key": restore_db._postgres_restore_lock_key(target_name)},
                )
        finally:
            competitor_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgres_cutover_rejects_wrong_live_cluster_before_mutation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    monkeypatch.setenv("DEXCOWIN_POSTGRES_TEST_ACK", POSTGRES_ACK)
    with _disposable_databases() as (base_url, candidate_name, target_name):
        admin_engine = sa.create_engine(
            base_url.set(database="postgres"),
            poolclass=sa.pool.NullPool,
        )
        receipt = tmp_path / "wrong-cluster-cutover.json"
        try:
            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                connection.exec_driver_sql(f'CREATE DATABASE "{target_name}"')
                candidate_oid = restore_db._postgres_database_oid(connection, candidate_name)
                target_oid = restore_db._postgres_database_oid(connection, target_name)

                with pytest.raises(OSError, match="cluster identifier changed"):
                    restore_db._cutover_postgres_candidate(
                        connection,
                        candidate_name=candidate_name,
                        target_name=target_name,
                        postcheck=lambda: None,
                        recovery_receipt=receipt,
                        system_identifier="0",
                    )

                assert restore_db._postgres_database_oid(connection, candidate_name) == candidate_oid
                assert restore_db._postgres_database_oid(connection, target_name) == target_oid
                assert connection.execute(
                    sa.text("SELECT datallowconn FROM pg_database WHERE datname = :name"),
                    {"name": target_name},
                ).scalar_one() is True
                assert not receipt.exists()
        finally:
            admin_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
@pytest.mark.parametrize("invalid_relation", ["same-oid", "duplicate-name"])
def test_postgres_cutover_rejects_unsafe_receipt_before_catalog_mutation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    invalid_relation: str,
) -> None:
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    monkeypatch.setenv("DEXCOWIN_POSTGRES_TEST_ACK", POSTGRES_ACK)
    with _disposable_databases() as (base_url, candidate_name, target_name):
        admin_engine = sa.create_engine(
            base_url.set(database="postgres"),
            poolclass=sa.pool.NullPool,
        )
        receipt = tmp_path / f"unsafe-cutover-{invalid_relation}.json"
        try:
            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                connection.exec_driver_sql(f'CREATE DATABASE "{target_name}"')
                candidate_oid = restore_db._postgres_database_oid(
                    connection,
                    candidate_name,
                )
                target_oid = restore_db._postgres_database_oid(connection, target_name)
                assert candidate_oid is not None
                assert target_oid is not None
                receipt_target = (
                    candidate_name if invalid_relation == "duplicate-name" else target_name
                )
                receipt_candidate_oid = (
                    target_oid if invalid_relation == "same-oid" else candidate_oid
                )
                system_identifier = restore_db._postgres_system_identifier(connection)
                suffix = uuid4().hex[:12]
                restore_db._write_postgres_cutover_receipt(
                    receipt,
                    {
                        "contract": restore_db.POSTGRES_CUTOVER_RECOVERY_CONTRACT,
                        "system_identifier": system_identifier,
                        "target_name": receipt_target,
                        "candidate_name": candidate_name,
                        "rollback_name": f"ic18_restore_rollback_{suffix}",
                        "failed_name": f"ic18_restore_failed_{suffix}",
                        "target_existed": True,
                        "target_oid": target_oid,
                        "candidate_oid": receipt_candidate_oid,
                    },
                    state="prepared",
                )

                with pytest.raises(
                    OSError,
                    match="invalid PostgreSQL cutover recovery receipt",
                ):
                    restore_db._recover_postgres_cutover_receipt(
                        connection,
                        receipt,
                        target_name=receipt_target,
                        system_identifier=system_identifier,
                    )

                assert restore_db._postgres_database_oid(
                    connection,
                    candidate_name,
                ) == candidate_oid
                assert restore_db._postgres_database_oid(
                    connection,
                    target_name,
                ) == target_oid
                assert connection.execute(
                    sa.text(
                        "SELECT bool_and(datallowconn) FROM pg_database "
                        "WHERE datname IN (:candidate_name, :target_name)"
                    ),
                    {
                        "candidate_name": candidate_name,
                        "target_name": target_name,
                    },
                ).scalar_one() is True
                assert receipt.is_file()
        finally:
            receipt.unlink(missing_ok=True)
            admin_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
@pytest.mark.parametrize(
    ("failure_point", "expect_candidate"),
    [
        ("committed-before", True),
        ("committed-after", True),
        ("allow", True),
    ],
)
def test_postgres_cutover_recovers_finalization_failure_in_same_run(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    failure_point: str,
    expect_candidate: bool,
) -> None:
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    monkeypatch.setenv("DEXCOWIN_POSTGRES_TEST_ACK", POSTGRES_ACK)
    with _disposable_databases() as (base_url, candidate_name, target_name):
        admin_engine = sa.create_engine(
            base_url.set(database="postgres"),
            poolclass=sa.pool.NullPool,
        )
        receipt = tmp_path / f"actual-finalization-{failure_point}.json"
        original_write = restore_db._write_postgres_cutover_receipt
        original_allow = restore_db._set_postgres_allow_connections
        failure_used = False

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
                    raise OSError("injected actual committed failure")
                original_write(path, payload, state=state)
                if failure_point == "committed-after":
                    failure_used = True
                    raise OSError("injected actual post-durable failure")
                return
            original_write(path, payload, state=state)

        def set_allow(
            connection: sa.Connection,
            name: str,
            allowed: bool,
        ) -> None:
            nonlocal failure_used
            if failure_point == "allow" and name == target_name and allowed and not failure_used:
                failure_used = True
                raise OSError("injected actual admission resume failure")
            original_allow(connection, name, allowed)

        try:
            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                connection.exec_driver_sql(f'CREATE DATABASE "{target_name}"')
                candidate_oid = restore_db._postgres_database_oid(connection, candidate_name)
                original_oid = restore_db._postgres_database_oid(connection, target_name)
                system_identifier = restore_db._postgres_system_identifier(connection)
                monkeypatch.setattr(restore_db, "_write_postgres_cutover_receipt", write_receipt)
                monkeypatch.setattr(restore_db, "_set_postgres_allow_connections", set_allow)

                restore_db._cutover_postgres_candidate(
                    connection,
                    candidate_name=candidate_name,
                    target_name=target_name,
                    postcheck=lambda: None,
                    recovery_receipt=receipt,
                    system_identifier=system_identifier,
                )

                expected_oid = candidate_oid if expect_candidate else original_oid
                assert restore_db._postgres_database_oid(connection, target_name) == expected_oid
                assert connection.execute(
                    sa.text("SELECT datallowconn FROM pg_database WHERE datname = :name"),
                    {"name": target_name},
                ).scalar_one() is True
                assert not receipt.exists()
                assert failure_used is True
        finally:
            admin_engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgres_prepared_marker_recovers_when_first_local_receipt_publish_failed(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", TEST_POSTGRES_URL)
    monkeypatch.setenv("DEXCOWIN_POSTGRES_TEST_ACK", POSTGRES_ACK)
    with _disposable_databases() as (base_url, candidate_name, target_name):
        admin_engine = sa.create_engine(
            base_url.set(database="postgres"),
            poolclass=sa.pool.NullPool,
        )
        cutover_receipt = tmp_path / "prepared-before-first-local-receipt.json"

        def fail_first_local_receipt_publish(
            _path: Path,
            _payload: dict[str, object],
            *,
            state: str,
        ) -> None:
            assert state == "prepared"
            raise OSError("primary first local receipt publish failure")

        try:
            with admin_engine.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as connection:
                connection.exec_driver_sql(f'CREATE DATABASE "{target_name}"')
                candidate_oid = restore_db._postgres_database_oid(connection, candidate_name)
                target_oid = restore_db._postgres_database_oid(connection, target_name)
                system_identifier = restore_db._postgres_system_identifier(connection)
                assert candidate_oid is not None
                assert target_oid is not None
                monkeypatch.setattr(
                    restore_db,
                    "_write_postgres_cutover_receipt",
                    fail_first_local_receipt_publish,
                )

                with pytest.raises(
                    OSError,
                    match="primary first local receipt publish failure",
                ):
                    restore_db._cutover_postgres_candidate(
                        connection,
                        candidate_name=candidate_name,
                        target_name=target_name,
                        postcheck=lambda: None,
                        recovery_receipt=cutover_receipt,
                        system_identifier=system_identifier,
                    )

                assert not cutover_receipt.exists()
                assert restore_db._postgres_database_oid(connection, candidate_name) is None
                assert restore_db._postgres_database_oid(connection, target_name) == target_oid
                assert restore_db._load_postgres_restore_cluster_marker(
                    connection,
                    target_name=target_name,
                    system_identifier=system_identifier,
                ) is None
                assert not cutover_receipt.exists()
        finally:
            admin_engine.dispose()
