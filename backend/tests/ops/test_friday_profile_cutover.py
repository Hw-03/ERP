from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import sys

import pytest


ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ops import backup_manifest  # noqa: E402
from scripts.ops import friday_profile_cutover as cutover  # noqa: E402
from scripts.ops import restore_db  # noqa: E402


ITEM_ID = "11111111111111111111111111111111"
WAREHOUSE_ROW_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
WAREHOUSE_ROW_UUID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
UNPLACED_ROW_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
UNPLACED_ROW_UUID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


def _quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _database_hash(path: Path) -> str:
    with sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True) as connection:
        tables = [
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        ]
        payload = []
        for table in tables:
            columns = [row[1] for row in connection.execute(f"PRAGMA table_info({_quote(table)})")]
            projection = ",".join(_quote(column) for column in columns)
            rows = [
                json.dumps(list(row), ensure_ascii=True, separators=(",", ":"))
                for row in connection.execute(f"SELECT {projection} FROM {_quote(table)}")
            ]
            payload.append([table, columns, sorted(rows)])
    encoded = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _effect(*, include_unplaced: bool) -> list[dict[str, object]]:
    cells: list[dict[str, object]] = [
        {
            "scope": "warehouse",
            "row_id": WAREHOUSE_ROW_UUID,
            "before_quantity": 5,
            "after_quantity": 9,
            "delta": 4,
        }
    ]
    if include_unplaced:
        cells.append(
            {
                "scope": "warehouse_unplaced",
                "row_id": UNPLACED_ROW_UUID,
                "before_quantity": 5,
                "after_quantity": 9,
                "delta": 4,
            }
        )
    cells.append(
        {
            "scope": "location",
            "department": "assembly",
            "status": "PRODUCTION",
            "delta": -4,
        }
    )
    return cells


def _create_database(path: Path, *, revision: str, modern: bool, quantity: int = 9) -> None:
    with sqlite3.connect(path) as connection:
        connection.executescript(
            """
            CREATE TABLE alembic_version(version_num TEXT PRIMARY KEY);
            CREATE TABLE alembic_schema_state(
                id INTEGER PRIMARY KEY,
                profile_id TEXT NOT NULL,
                revision TEXT NOT NULL,
                schema_fingerprint TEXT NOT NULL
            );
            CREATE TABLE data_revision(id INTEGER PRIMARY KEY, revision INTEGER, updated_at TEXT);
            CREATE TABLE admin_audit_logs(id TEXT PRIMARY KEY, event TEXT NOT NULL);
            CREATE TABLE employees(id TEXT PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE io_batches(id TEXT PRIMARY KEY, status TEXT NOT NULL);
            CREATE TABLE items(item_id TEXT PRIMARY KEY, item_name TEXT NOT NULL);
            CREATE TABLE inventory(
                inventory_id TEXT PRIMARY KEY,
                item_id TEXT UNIQUE NOT NULL REFERENCES items(item_id),
                warehouse_qty INTEGER NOT NULL
            );
            CREATE TABLE inventory_operations(operation_id TEXT PRIMARY KEY, contract_version INTEGER);
            CREATE TABLE transaction_logs(
                log_id TEXT PRIMARY KEY,
                item_id TEXT NOT NULL REFERENCES items(item_id),
                inventory_effect TEXT
            );
            CREATE TABLE shipping_request_events(id TEXT PRIMARY KEY, event TEXT NOT NULL);
            CREATE TABLE stock_requests(id TEXT PRIMARY KEY, status TEXT NOT NULL);
            CREATE TABLE warehouse_box_items(id TEXT PRIMARY KEY);
            CREATE TABLE warehouse_special_zone_items(id TEXT PRIMARY KEY);
            CREATE TABLE warehouse_special_zones(id TEXT PRIMARY KEY);
            CREATE TABLE sequence_probe(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                value TEXT NOT NULL
            );
            """
        )
        if modern:
            connection.execute(
                "ALTER TABLE admin_audit_logs ADD COLUMN bootstrap_employee_id TEXT"
            )
            connection.execute(
                "ALTER TABLE employees ADD COLUMN pin_requires_change INTEGER"
            )
            connection.execute(
                "ALTER TABLE io_batches ADD COLUMN request_fingerprint TEXT"
            )
            for column in ("actor_employee_code", "actor_employee_id", "actor_name"):
                connection.execute(
                    f"ALTER TABLE shipping_request_events ADD COLUMN {column} TEXT"
                )
            connection.execute(
                "ALTER TABLE stock_requests ADD COLUMN request_fingerprint TEXT"
            )
            connection.execute(
                "CREATE TABLE warehouse_unplaced_items("
                "id TEXT PRIMARY KEY, item_id TEXT UNIQUE NOT NULL REFERENCES items(item_id), "
                "quantity INTEGER NOT NULL)"
            )
            connection.execute(
                "CREATE TABLE operator_sessions(id TEXT PRIMARY KEY, payload TEXT NOT NULL)"
            )
            connection.execute(
                "CREATE TABLE shipping_command_receipts("
                "id TEXT PRIMARY KEY, payload TEXT NOT NULL)"
            )
        connection.execute("INSERT INTO alembic_version VALUES (?)", (revision,))
        connection.execute(
            "INSERT INTO alembic_schema_state VALUES (1,?,?,?)",
            ("canonical", revision, "schema-proof"),
        )
        connection.execute("INSERT INTO data_revision VALUES (1,7,'2026-09-14T00:00:00Z')")
        connection.execute("INSERT INTO admin_audit_logs(id,event) VALUES ('audit-1','created')")
        connection.execute("INSERT INTO employees(id,name) VALUES ('employee-1','operator')")
        connection.execute("INSERT INTO io_batches(id,status) VALUES ('batch-1','done')")
        connection.execute("INSERT INTO items VALUES (?, 'current item')", (ITEM_ID,))
        connection.execute(
            "INSERT INTO shipping_request_events(id,event) VALUES ('event-1','prepared')"
        )
        connection.execute("INSERT INTO stock_requests(id,status) VALUES ('request-1','done')")
        connection.execute("INSERT INTO sequence_probe(value) VALUES ('stable')")
        connection.execute(
            "INSERT INTO inventory VALUES (?,?,?)",
            (WAREHOUSE_ROW_ID, ITEM_ID, quantity),
        )
        connection.execute("INSERT INTO inventory_operations VALUES ('op-1',2)")
        connection.execute(
            "INSERT INTO transaction_logs VALUES ('log-1',?,?)",
            (
                ITEM_ID,
                json.dumps(
                    _effect(include_unplaced=modern),
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
            ),
        )
        if modern:
            connection.execute(
                "UPDATE admin_audit_logs SET bootstrap_employee_id='employee-1'"
            )
            connection.execute("UPDATE employees SET pin_requires_change=1")
            connection.execute("UPDATE io_batches SET request_fingerprint='io-fingerprint'")
            connection.execute(
                "UPDATE shipping_request_events SET actor_employee_code='E001', "
                "actor_employee_id='employee-1', actor_name='operator'"
            )
            connection.execute(
                "UPDATE stock_requests SET request_fingerprint='stock-fingerprint'"
            )
            connection.execute(
                "INSERT INTO warehouse_unplaced_items VALUES (?,?,?)",
                (UNPLACED_ROW_ID, ITEM_ID, quantity),
            )
            connection.execute(
                "INSERT INTO operator_sessions VALUES ('session-1','preserved in modern FULL')"
            )
            connection.execute(
                "INSERT INTO shipping_command_receipts "
                "VALUES ('command-1','preserved in modern FULL')"
            )


def _write_manifest(path: Path, *, revision: str, profile: str) -> None:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    manifest = {
        "contract": backup_manifest.MANIFEST_CONTRACT,
        "created_at": "2026-09-14T00:00:00Z",
        "artifact": {"name": path.name, "sha256": digest, "size": path.stat().st_size},
        "database": {
            "engine": "sqlite",
            "alembic_revision": revision,
            "schema_fingerprint": "1" * 64,
            "data_revision": {"revision": 7, "updated_at": "2026-09-14T00:00:00Z"},
            "snapshot_hash": _database_hash(path),
            "oracle_hash": "2" * 64,
            "snapshot_metadata": {"schema_version": 1},
        },
        "source_snapshot": {
            "method": "sqlite3.backup",
            "journal_mode": "delete",
            "wal_included": True,
            "physical_generation": backup_manifest.sqlite_file_generation(path),
        },
        "verification": {
            "status": "PASS",
            "schema": "PASS",
            "sqlite_integrity": "PASS",
            "foreign_keys": "PASS",
            "inventory": {
                "contract": backup_manifest.INVENTORY_CONTRACT,
                "profile": profile,
                "status": "pass",
                "blocking_count": 0,
                "warning_count": 0,
                "checks": [],
            },
        },
        "runtime_recovery": backup_manifest.RUNTIME_RECOVERY_CONTRACT,
    }
    backup_manifest.manifest_path_for(path).write_text(
        json.dumps(manifest, ensure_ascii=False),
        encoding="utf-8",
    )


VALIDATOR = r'''from __future__ import annotations
import argparse, hashlib, json, sqlite3
from pathlib import Path

EXPECTED_REVISION = __EXPECTED_REVISION__

def quote(name):
    return '"' + name.replace('"', '""') + '"'

def database_hash(path):
    connection = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    try:
        tables = [row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )]
        payload = []
        for table in tables:
            columns = [row[1] for row in connection.execute(f"PRAGMA table_info({quote(table)})")]
            projection = ','.join(quote(column) for column in columns)
            rows = [json.dumps(list(row), ensure_ascii=True, separators=(',', ':'))
                    for row in connection.execute(f"SELECT {projection} FROM {quote(table)}")]
            payload.append([table, columns, sorted(rows)])
        return hashlib.sha256(json.dumps(payload, ensure_ascii=True, separators=(',', ':')).encode()).hexdigest()
    finally:
        connection.close()

def file_generation(path):
    digest = hashlib.sha256()
    for label, candidate in ((b'database', path), (b'wal', Path(str(path) + '-wal'))):
        digest.update(label)
        if not candidate.is_file():
            digest.update(b'\x00')
            continue
        digest.update(b'\x01')
        digest.update(candidate.stat().st_size.to_bytes(8, 'big'))
        digest.update(candidate.read_bytes())
    return digest.hexdigest()

parser = argparse.ArgumentParser()
parser.add_argument('artifact', nargs='?')
parser.add_argument('--source-db')
parser.add_argument('--database')
args = parser.parse_args()
if args.database:
    database = Path(args.database).resolve()
    try:
        with sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True) as connection:
            revision = connection.execute('SELECT version_num FROM alembic_version').fetchone()[0]
            integrity = connection.execute('PRAGMA integrity_check').fetchall()
            foreign_keys = connection.execute('PRAGMA foreign_key_check').fetchall()
        valid = integrity == [('ok',)] and not foreign_keys and revision == EXPECTED_REVISION
    except Exception:
        valid = False
    print('DATABASE_STATUS=' + ('PASS' if valid else 'FAIL'))
    raise SystemExit(0 if valid else 1)
artifact = Path(args.artifact).resolve()
try:
    manifest = json.loads(Path(str(artifact) + '.manifest.json').read_text(encoding='utf-8'))
    with sqlite3.connect(f"file:{artifact.as_posix()}?mode=ro", uri=True) as connection:
        revision = connection.execute('SELECT version_num FROM alembic_version').fetchone()[0]
        integrity = connection.execute('PRAGMA integrity_check').fetchall()
        foreign_keys = connection.execute('PRAGMA foreign_key_check').fetchall()
    valid = (
        integrity == [('ok',)] and not foreign_keys and revision == EXPECTED_REVISION
        and manifest['database']['alembic_revision'] == EXPECTED_REVISION
        and manifest['verification']['status'] == 'PASS'
        and manifest['artifact']['sha256'] == hashlib.sha256(artifact.read_bytes()).hexdigest()
        and manifest['database']['snapshot_hash'] == database_hash(artifact)
    )
    if args.source_db:
        source = Path(args.source_db).resolve()
        valid = (
            valid
            and file_generation(source) == manifest['source_snapshot']['physical_generation']
            and database_hash(source) == manifest['database']['snapshot_hash']
        )
except Exception:
    valid = False
print('BACKUP_STATUS=' + ('PASS' if valid else 'FAIL'))
raise SystemExit(0 if valid else 1)
'''


def _create_validator_root(path: Path, revision: str) -> Path:
    files = {
        "scripts/ops/_verify_backup.py": VALIDATOR.replace(
            "__EXPECTED_REVISION__",
            repr(revision),
        ),
        "scripts/ops/backup_manifest.py": "# pinned manifest validator\n",
        "scripts/ops/backup_retention.py": "# pinned retention policy\n",
        "scripts/ops/check_inventory_integrity.py": "# pinned inventory validator\n",
        "scripts/ops/durable_file.py": "# pinned durable writer\n",
        "scripts/ops/recovery_owner.py": "# pinned recovery owner\n",
        "scripts/runtime_paths.py": "# pinned runtime paths\n",
        "backend/alembic.ini": "[alembic]\nscript_location = alembic\n",
        "backend/migration_type_compare.py": "# pinned migration comparison\n",
        "backend/bootstrap/schema.py": "# pinned schema validator\n",
        "backend/app/services/inventory_integrity.py": "# pinned inventory service\n",
        "backend/app/schemas/inventory_integrity.py": "# pinned inventory schema\n",
        "backend/app/__init__.py": "",
        "backend/alembic/versions/revision.py": f"REVISION = {revision!r}\n",
    }
    for relative, content in files.items():
        destination = path / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(content, encoding="utf-8")
    return path


def _prepare_inputs(tmp_path: Path) -> dict[str, Path | str]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    target = tmp_path / "target-modern.db"
    rollback_dir = tmp_path / "runtime" / "backups" / "sqlite"
    rollback_dir.mkdir(parents=True)
    rollback = rollback_dir / "modern-full.db"
    candidate = rollback_dir / "friday-full.db"
    _create_database(target, revision=cutover.MODERN_REVISION, modern=True)
    shutil.copy2(target, rollback)
    _create_database(candidate, revision=cutover.FRIDAY_REVISION, modern=False)
    _write_manifest(rollback, revision=cutover.MODERN_REVISION, profile="modern-0036")
    _write_manifest(candidate, revision=cutover.FRIDAY_REVISION, profile=cutover.FRIDAY_PROFILE)
    modern_root = _create_validator_root(tmp_path / "modern-validator", cutover.MODERN_REVISION)
    friday_root = _create_validator_root(tmp_path / "friday-validator", cutover.FRIDAY_REVISION)
    return {
        "target": target,
        "rollback": rollback,
        "candidate": candidate,
        "modern_root": modern_root,
        "friday_root": friday_root,
        "modern_hash": cutover.validator_bundle_sha256(modern_root),
        "friday_hash": cutover.validator_bundle_sha256(friday_root),
    }


def _create_admission(tmp_path: Path, inputs: dict[str, Path | str]) -> Path:
    receipt = tmp_path / "friday-cutover-admission.json"
    cutover.create_admission(
        candidate_path=Path(inputs["candidate"]),
        original_path=Path(inputs["rollback"]),
        target_path=Path(inputs["target"]),
        modern_validator_root=Path(inputs["modern_root"]),
        friday_validator_root=Path(inputs["friday_root"]),
        trusted_modern_validator_sha256=str(inputs["modern_hash"]),
        trusted_friday_validator_sha256=str(inputs["friday_hash"]),
        output_path=receipt,
    )
    return receipt


def _create_development_sync_admission(
    tmp_path: Path,
    inputs: dict[str, Path | str],
) -> Path:
    receipt = tmp_path / "development-sync-admission.json"
    cutover.create_development_sync_admission(
        candidate_path=Path(inputs["candidate"]),
        rollback_path=Path(inputs["rollback"]),
        target_path=Path(inputs["target"]),
        rollback_validator_root=Path(inputs["modern_root"]),
        candidate_validator_root=Path(inputs["friday_root"]),
        trusted_rollback_validator_sha256=str(inputs["modern_hash"]),
        trusted_candidate_validator_sha256=str(inputs["friday_hash"]),
        output_path=receipt,
    )
    return receipt


@pytest.mark.parametrize(
    "relative_path",
    (
        "scripts/ops/backup_retention.py",
        "scripts/runtime_paths.py",
        "scripts/ops/durable_file.py",
        "scripts/ops/recovery_owner.py",
        "backend/migration_type_compare.py",
        "backend/alembic.ini",
    ),
)
def test_validator_bundle_hash_covers_public_validator_support_closure(
    tmp_path: Path,
    relative_path: str,
) -> None:
    validator_root = _create_validator_root(tmp_path, cutover.MODERN_REVISION)
    original_hash = cutover.validator_bundle_sha256(validator_root)

    dependency = validator_root / relative_path
    dependency.write_bytes(dependency.read_bytes() + b"# tampered\n")

    assert cutover.validator_bundle_sha256(validator_root) != original_hash


def test_admission_requires_pinned_full_validators_and_actual_conversion_equality(
    tmp_path: Path,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    receipt = _create_admission(tmp_path, inputs)

    result = cutover.verify_admission(
        receipt_path=receipt,
        expected_receipt_sha256=hashlib.sha256(receipt.read_bytes()).hexdigest(),
        candidate_path=Path(inputs["candidate"]),
        original_path=Path(inputs["rollback"]),
        target_path=Path(inputs["target"]),
        friday_validator_root=Path(inputs["friday_root"]),
    )

    assert result["profile"] == cutover.CUTOVER_PROFILE
    assert result["validation"]["modern_full"] == "PASS"
    assert result["validation"]["friday_full"] == "PASS"
    assert result["conversion"]["source_projection_sha256"] == result["conversion"][
        "candidate_projection_sha256"
    ]
    assert {
        entry["table"] for entry in result["conversion"]["dropped_table_evidence"]
    } == {
        "operator_sessions",
        "shipping_command_receipts",
        "warehouse_unplaced_items",
    }
    assert {
        (entry["table"], column)
        for entry in result["conversion"]["dropped_column_evidence"]
        for column in entry["columns"]
    } == {
        ("admin_audit_logs", "bootstrap_employee_id"),
        ("employees", "pin_requires_change"),
        ("io_batches", "request_fingerprint"),
        ("shipping_request_events", "actor_employee_code"),
        ("shipping_request_events", "actor_employee_id"),
        ("shipping_request_events", "actor_name"),
        ("stock_requests", "request_fingerprint"),
    }


def test_development_sync_admission_allows_different_business_data_without_conversion(
    tmp_path: Path,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    candidate = Path(inputs["candidate"])
    with sqlite3.connect(candidate) as connection:
        connection.execute(
            "UPDATE inventory SET warehouse_qty=12 WHERE item_id=?",
            (ITEM_ID,),
        )
    _write_manifest(
        candidate,
        revision=cutover.FRIDAY_REVISION,
        profile=cutover.FRIDAY_PROFILE,
    )

    receipt = _create_development_sync_admission(tmp_path, inputs)
    receipt_hash = hashlib.sha256(receipt.read_bytes()).hexdigest()
    result = cutover.verify_development_sync_admission(
        receipt_path=receipt,
        expected_receipt_sha256=receipt_hash,
        candidate_path=candidate,
        rollback_path=Path(inputs["rollback"]),
        target_path=Path(inputs["target"]),
        candidate_validator_root=Path(inputs["friday_root"]),
    )

    assert result["contract"] == cutover.DEVELOPMENT_SYNC_CONTRACT
    assert result["profile"] == cutover.DEVELOPMENT_SYNC_PROFILE
    assert result["validation"] == {
        "candidate_full": "PASS",
        "rollback_full": "PASS",
        "rollback_freshness": "PASS",
    }
    assert "conversion" not in result


def test_development_sync_admission_rejects_stale_rollback_target(
    tmp_path: Path,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    receipt = _create_development_sync_admission(tmp_path, inputs)
    target = Path(inputs["target"])
    with sqlite3.connect(target) as connection:
        connection.execute("UPDATE data_revision SET revision=8 WHERE id=1")

    with pytest.raises(
        cutover.CutoverAdmissionError,
        match="rollback FULL freshness FULL validation failed",
    ):
        cutover.verify_development_sync_admission(
            receipt_path=receipt,
            expected_receipt_sha256=hashlib.sha256(receipt.read_bytes()).hexdigest(),
            candidate_path=Path(inputs["candidate"]),
            rollback_path=Path(inputs["rollback"]),
            target_path=target,
            candidate_validator_root=Path(inputs["friday_root"]),
        )


def test_development_sync_cli_prepares_pinned_receipt(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    inputs = _prepare_inputs(tmp_path)
    receipt = tmp_path / "development-sync-cli.json"

    assert cutover.main(
        [
            "prepare-development-sync",
            "--candidate",
            str(inputs["candidate"]),
            "--rollback",
            str(inputs["rollback"]),
            "--target",
            str(inputs["target"]),
            "--rollback-validator-root",
            str(inputs["modern_root"]),
            "--candidate-validator-root",
            str(inputs["friday_root"]),
            "--trusted-rollback-validator-sha256",
            str(inputs["modern_hash"]),
            "--trusted-candidate-validator-sha256",
            str(inputs["friday_hash"]),
            "--output",
            str(receipt),
        ]
    ) == 0

    output = json.loads(capsys.readouterr().out.strip())
    assert output["status"] == "ADMITTED"
    assert output["profile"] == cutover.DEVELOPMENT_SYNC_PROFILE
    assert output["receipt"] == str(receipt.resolve())
    assert output["receipt_sha256"] == hashlib.sha256(receipt.read_bytes()).hexdigest()


def test_validator_hash_cli_reports_trusted_bundle_without_executing_it(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = _create_validator_root(tmp_path / "validator", cutover.MODERN_REVISION)

    assert cutover.main(["hash-validator", "--root", str(root)]) == 0

    output = json.loads(capsys.readouterr().out.strip())
    assert output == {
        "root": str(root.resolve()),
        "validator_bundle_sha256": cutover.validator_bundle_sha256(root),
    }


def test_development_sync_postchecks_compare_each_installed_same_schema_source(
    tmp_path: Path,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    candidate = Path(inputs["candidate"])
    rollback = Path(inputs["rollback"])
    target = Path(inputs["target"])
    with sqlite3.connect(candidate) as connection:
        connection.execute(
            "UPDATE inventory SET warehouse_qty=12 WHERE item_id=?",
            (ITEM_ID,),
        )
    _write_manifest(
        candidate,
        revision=cutover.FRIDAY_REVISION,
        profile=cutover.FRIDAY_PROFILE,
    )
    receipt = _create_development_sync_admission(tmp_path, inputs)
    receipt_hash = hashlib.sha256(receipt.read_bytes()).hexdigest()

    shutil.copy2(candidate, target)
    candidate_hash = cutover.verify_development_sync_install(
        receipt_path=receipt,
        expected_receipt_sha256=receipt_hash,
        candidate_path=candidate,
        installed_path=target,
        candidate_validator_root=Path(inputs["friday_root"]),
    )
    assert candidate_hash == cutover.compare_exact_database(candidate, target)

    shutil.copy2(rollback, target)
    rollback_hash = cutover.verify_development_sync_recovery_install(
        receipt_path=receipt,
        expected_receipt_sha256=receipt_hash,
        rollback_path=rollback,
        installed_path=target,
    )
    assert rollback_hash == cutover.compare_exact_database(rollback, target)

    with sqlite3.connect(target) as connection:
        connection.execute("UPDATE data_revision SET revision=9 WHERE id=1")
    with pytest.raises(cutover.CutoverAdmissionError, match="recovered rollback data"):
        cutover.verify_development_sync_recovery_install(
            receipt_path=receipt,
            expected_receipt_sha256=receipt_hash,
            rollback_path=rollback,
            installed_path=target,
        )


def test_development_sync_recovery_classifies_only_exact_candidate_or_rollback(
    tmp_path: Path,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    receipt = _create_development_sync_admission(tmp_path, inputs)
    receipt_hash = hashlib.sha256(receipt.read_bytes()).hexdigest()
    target = Path(inputs["target"])

    assert cutover.classify_development_sync_recovery_target(
        receipt_path=receipt,
        expected_receipt_sha256=receipt_hash,
        target_path=target,
        candidate_validator_root=Path(inputs["friday_root"]),
    ) == "rollback"

    shutil.copy2(Path(inputs["candidate"]), target)
    assert cutover.classify_development_sync_recovery_target(
        receipt_path=receipt,
        expected_receipt_sha256=receipt_hash,
        target_path=target,
        candidate_validator_root=Path(inputs["friday_root"]),
    ) == "candidate"

    with sqlite3.connect(target) as connection:
        connection.execute("UPDATE data_revision SET revision=9 WHERE id=1")
    with pytest.raises(
        cutover.CutoverAdmissionError,
        match="neither admitted candidate nor rollback",
    ):
        cutover.classify_development_sync_recovery_target(
            receipt_path=receipt,
            expected_receipt_sha256=receipt_hash,
            target_path=target,
            candidate_validator_root=Path(inputs["friday_root"]),
        )


def test_conversion_rejects_unapproved_source_only_table(tmp_path: Path) -> None:
    inputs = _prepare_inputs(tmp_path)
    original = Path(inputs["rollback"])
    with sqlite3.connect(original) as connection:
        connection.execute("CREATE TABLE modern_only(id TEXT PRIMARY KEY, value TEXT)")
        connection.execute("INSERT INTO modern_only VALUES ('lost','must block')")

    with pytest.raises(cutover.CutoverAdmissionError, match="unapproved source-only tables"):
        cutover.compare_conversion_data(original, Path(inputs["candidate"]))


def test_conversion_rejects_unapproved_source_only_column(tmp_path: Path) -> None:
    inputs = _prepare_inputs(tmp_path)
    original = Path(inputs["rollback"])
    with sqlite3.connect(original) as connection:
        connection.execute("ALTER TABLE items ADD COLUMN modern_only_value TEXT")
        connection.execute("UPDATE items SET modern_only_value='must block'")

    with pytest.raises(cutover.CutoverAdmissionError, match="unapproved source-only columns"):
        cutover.compare_conversion_data(original, Path(inputs["candidate"]))


def test_admission_rejects_actual_conversion_mismatch(tmp_path: Path) -> None:
    inputs = _prepare_inputs(tmp_path)
    with sqlite3.connect(Path(inputs["candidate"])) as connection:
        connection.execute("UPDATE inventory SET warehouse_qty=8")
    _write_manifest(
        Path(inputs["candidate"]),
        revision=cutover.FRIDAY_REVISION,
        profile=cutover.FRIDAY_PROFILE,
    )

    with pytest.raises(cutover.CutoverAdmissionError, match="conversion data mismatch"):
        _create_admission(tmp_path, inputs)


def test_admission_rejects_target_that_changed_after_full_original_backup(
    tmp_path: Path,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    receipt = _create_admission(tmp_path, inputs)
    with sqlite3.connect(Path(inputs["target"])) as connection:
        connection.execute("UPDATE data_revision SET revision=8 WHERE id=1")

    with pytest.raises(cutover.CutoverAdmissionError, match="modern FULL freshness"):
        cutover.verify_admission(
            receipt_path=receipt,
            expected_receipt_sha256=hashlib.sha256(receipt.read_bytes()).hexdigest(),
            candidate_path=Path(inputs["candidate"]),
            original_path=Path(inputs["rollback"]),
            target_path=Path(inputs["target"]),
            friday_validator_root=Path(inputs["friday_root"]),
        )


def test_recovery_admission_accepts_online_backup_generation_drift_with_exact_rows(
    tmp_path: Path,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    receipt = _create_admission(tmp_path, inputs)
    receipt_hash = hashlib.sha256(receipt.read_bytes()).hexdigest()
    candidate = Path(inputs["candidate"])
    target = Path(inputs["target"])

    with (
        sqlite3.connect(f"file:{candidate.as_posix()}?mode=ro", uri=True) as source,
        sqlite3.connect(target) as destination,
    ):
        source.backup(destination)

    assert cutover.compare_exact_database(candidate, target)
    assert backup_manifest.sqlite_file_generation(target) != (
        backup_manifest.sqlite_file_generation(candidate)
    )
    result = cutover.verify_admission(
        receipt_path=receipt,
        expected_receipt_sha256=receipt_hash,
        candidate_path=candidate,
        original_path=Path(inputs["rollback"]),
        target_path=target,
        friday_validator_root=Path(inputs["friday_root"]),
        recovery=True,
    )

    assert result["profile"] == cutover.CUTOVER_PROFILE


def test_compare_exact_database_accepts_idle_wal_database(tmp_path: Path) -> None:
    inputs = _prepare_inputs(tmp_path)
    candidate = Path(inputs["candidate"])
    target = Path(inputs["target"])
    with (
        sqlite3.connect(f"file:{candidate.as_posix()}?mode=ro", uri=True) as source,
        sqlite3.connect(target) as destination,
    ):
        source.backup(destination)
        destination.execute("PRAGMA journal_mode=WAL")

    assert not Path(f"{target}-wal").exists()
    assert cutover.compare_exact_database(
        candidate,
        target,
        label="installed Friday target",
    )


def test_recovery_admission_rejects_new_target_row_after_online_backup(
    tmp_path: Path,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    receipt = _create_admission(tmp_path, inputs)
    candidate = Path(inputs["candidate"])
    target = Path(inputs["target"])
    with (
        sqlite3.connect(f"file:{candidate.as_posix()}?mode=ro", uri=True) as source,
        sqlite3.connect(target) as destination,
    ):
        source.backup(destination)
    with sqlite3.connect(target) as connection:
        connection.execute("UPDATE data_revision SET revision=8 WHERE id=1")

    with pytest.raises(
        cutover.CutoverAdmissionError,
        match="installed Friday target data does not match FULL source: data_revision",
    ):
        cutover.verify_admission(
            receipt_path=receipt,
            expected_receipt_sha256=hashlib.sha256(receipt.read_bytes()).hexdigest(),
            candidate_path=candidate,
            original_path=Path(inputs["rollback"]),
            target_path=target,
            friday_validator_root=Path(inputs["friday_root"]),
            recovery=True,
        )


def test_compare_exact_database_rejects_wal_commit_during_comparison(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    candidate = Path(inputs["candidate"])
    target = Path(inputs["target"])
    with (
        sqlite3.connect(f"file:{candidate.as_posix()}?mode=ro", uri=True) as source,
        sqlite3.connect(target) as destination,
    ):
        source.backup(destination)

    writer = sqlite3.connect(target)
    writer.execute("PRAGMA journal_mode=WAL")
    writer.execute("PRAGMA wal_autocheckpoint=0")
    original_shapes = cutover._shapes
    committed = False

    def shapes_with_concurrent_commit(connection: sqlite3.Connection):
        nonlocal committed
        if not committed:
            writer.execute("UPDATE data_revision SET revision=8 WHERE id=1")
            writer.commit()
            committed = True
            assert Path(f"{target}-wal").stat().st_size > 0
        return original_shapes(connection)

    monkeypatch.setattr(cutover, "_shapes", shapes_with_concurrent_commit)
    try:
        with pytest.raises(
            cutover.CutoverAdmissionError,
            match="installed Friday target inputs changed during comparison",
        ):
            cutover.compare_exact_database(
                candidate,
                target,
                label="installed Friday target",
            )
    finally:
        writer.close()


def test_compare_exact_database_rejects_wal_commit_after_target_snapshot_pin(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    candidate = Path(inputs["candidate"])
    target = Path(inputs["target"])
    with (
        sqlite3.connect(f"file:{candidate.as_posix()}?mode=ro", uri=True) as source,
        sqlite3.connect(target) as destination,
    ):
        source.backup(destination)

    writer = sqlite3.connect(target)
    writer.execute("PRAGMA journal_mode=WAL")
    writer.execute("PRAGMA wal_autocheckpoint=0")
    original_reader = cutover._read_complete_snapshot
    committed = False

    def reader_with_concurrent_commit(path: Path) -> sqlite3.Connection:
        nonlocal committed
        connection = original_reader(path)
        if path.resolve() == target.resolve() and not committed:
            writer.execute(
                "UPDATE sqlite_sequence SET seq=99 WHERE name='sequence_probe'"
            )
            writer.commit()
            committed = True
            assert Path(f"{target}-wal").stat().st_size > 0
        return connection

    monkeypatch.setattr(cutover, "_read_complete_snapshot", reader_with_concurrent_commit)
    try:
        with pytest.raises(
            cutover.CutoverAdmissionError,
            match="installed Friday target inputs changed during comparison",
        ):
            cutover.compare_exact_database(
                candidate,
                target,
                label="installed Friday target",
            )
    finally:
        writer.close()


def test_compare_exact_database_rejects_wal_commit_between_baseline_and_target_pin(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    candidate = Path(inputs["candidate"])
    target = Path(inputs["target"])
    with (
        sqlite3.connect(f"file:{candidate.as_posix()}?mode=ro", uri=True) as source,
        sqlite3.connect(target) as destination,
    ):
        source.backup(destination)

    writer = sqlite3.connect(target)
    writer.execute("PRAGMA journal_mode=WAL")
    writer.execute("PRAGMA wal_autocheckpoint=0")
    original_reader = cutover._read_complete_snapshot
    committed = False

    def reader_with_concurrent_commit(path: Path) -> sqlite3.Connection:
        nonlocal committed
        connection = original_reader(path)
        if path.resolve() == candidate.resolve() and not committed:
            writer.execute("PRAGMA user_version=99")
            writer.commit()
            committed = True
            assert Path(f"{target}-wal").stat().st_size > 0
        return connection

    monkeypatch.setattr(cutover, "_read_complete_snapshot", reader_with_concurrent_commit)
    try:
        with pytest.raises(
            cutover.CutoverAdmissionError,
            match="installed Friday target inputs changed during comparison",
        ):
            cutover.compare_exact_database(
                candidate,
                target,
                label="installed Friday target",
            )
    finally:
        writer.close()


def test_compare_exact_database_rejects_index_change_with_same_rows(
    tmp_path: Path,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    candidate = Path(inputs["candidate"])
    target = Path(inputs["target"])
    with (
        sqlite3.connect(f"file:{candidate.as_posix()}?mode=ro", uri=True) as source,
        sqlite3.connect(target) as destination,
    ):
        source.backup(destination)
        destination.execute("CREATE INDEX unexpected_item_name ON items(item_name)")

    with pytest.raises(
        cutover.CutoverAdmissionError,
        match="installed Friday target schema does not match FULL source",
    ):
        cutover.compare_exact_database(
            candidate,
            target,
            label="installed Friday target",
        )


def test_compare_exact_database_rejects_sqlite_sequence_change(
    tmp_path: Path,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    candidate = Path(inputs["candidate"])
    target = Path(inputs["target"])
    with (
        sqlite3.connect(f"file:{candidate.as_posix()}?mode=ro", uri=True) as source,
        sqlite3.connect(target) as destination,
    ):
        source.backup(destination)
        destination.execute("UPDATE sqlite_sequence SET seq=99 WHERE name='sequence_probe'")

    with pytest.raises(
        cutover.CutoverAdmissionError,
        match="installed Friday target sqlite_sequence does not match FULL source",
    ):
        cutover.compare_exact_database(
            candidate,
            target,
            label="installed Friday target",
        )


def test_admission_rejects_candidate_or_validator_tampering(
    tmp_path: Path,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    receipt = _create_admission(tmp_path, inputs)
    candidate = Path(inputs["candidate"])
    with sqlite3.connect(candidate) as connection:
        connection.execute("UPDATE data_revision SET revision=9 WHERE id=1")

    with pytest.raises(cutover.CutoverAdmissionError, match="candidate artifact hash"):
        cutover.verify_admission(
            receipt_path=receipt,
            expected_receipt_sha256=hashlib.sha256(receipt.read_bytes()).hexdigest(),
            candidate_path=candidate,
            original_path=Path(inputs["rollback"]),
            target_path=Path(inputs["target"]),
            friday_validator_root=Path(inputs["friday_root"]),
        )

    inputs = _prepare_inputs(tmp_path / "validator-tamper")
    receipt = _create_admission(tmp_path / "validator-tamper", inputs)
    verifier = Path(inputs["modern_root"]) / "scripts" / "ops" / "_verify_backup.py"
    verifier.write_text(verifier.read_text(encoding="utf-8") + "# tampered\n", encoding="utf-8")

    with pytest.raises(cutover.CutoverAdmissionError, match="modern validator bundle hash"):
        cutover.verify_admission(
            receipt_path=receipt,
            expected_receipt_sha256=hashlib.sha256(receipt.read_bytes()).hexdigest(),
            candidate_path=Path(inputs["candidate"]),
            original_path=Path(inputs["rollback"]),
            target_path=Path(inputs["target"]),
            friday_validator_root=Path(inputs["friday_root"]),
        )


def test_create_admission_rejects_validator_change_during_execution(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    friday_root = Path(inputs["friday_root"])
    original_run = cutover._run_public_full_validator

    def run_and_tamper(
        code_root: Path,
        artifact: Path,
        *,
        source_path: Path | None = None,
        label: str,
    ) -> None:
        original_run(code_root, artifact, source_path=source_path, label=label)
        if code_root == friday_root:
            support = friday_root / "scripts" / "ops" / "backup_retention.py"
            support.write_bytes(support.read_bytes() + b"# changed during create\n")

    monkeypatch.setattr(cutover, "_run_public_full_validator", run_and_tamper)

    with pytest.raises(cutover.CutoverAdmissionError, match="Friday validator bundle changed"):
        _create_admission(tmp_path, inputs)


def test_verify_admission_rejects_validator_change_during_execution(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    receipt = _create_admission(tmp_path, inputs)
    receipt_hash = hashlib.sha256(receipt.read_bytes()).hexdigest()
    friday_root = Path(inputs["friday_root"])
    original_run = cutover._run_public_full_validator

    def run_and_tamper(
        code_root: Path,
        artifact: Path,
        *,
        source_path: Path | None = None,
        label: str,
    ) -> None:
        original_run(code_root, artifact, source_path=source_path, label=label)
        if code_root == friday_root:
            support = friday_root / "scripts" / "ops" / "backup_retention.py"
            support.write_bytes(support.read_bytes() + b"# changed during verify\n")

    monkeypatch.setattr(cutover, "_run_public_full_validator", run_and_tamper)

    with pytest.raises(cutover.CutoverAdmissionError, match="Friday validator bundle changed"):
        cutover.verify_admission(
            receipt_path=receipt,
            expected_receipt_sha256=receipt_hash,
            candidate_path=Path(inputs["candidate"]),
            original_path=Path(inputs["rollback"]),
            target_path=Path(inputs["target"]),
            friday_validator_root=friday_root,
        )


def test_recovery_install_rejects_validator_change_during_execution(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    receipt = _create_admission(tmp_path, inputs)
    receipt_hash = hashlib.sha256(receipt.read_bytes()).hexdigest()
    modern_root = Path(inputs["modern_root"])
    original_run = cutover._run_public_database_validator

    def run_and_tamper(code_root: Path, database: Path, *, label: str) -> None:
        original_run(code_root, database, label=label)
        support = modern_root / "scripts" / "ops" / "backup_retention.py"
        support.write_bytes(support.read_bytes() + b"# changed during recovery\n")

    monkeypatch.setattr(cutover, "_run_public_database_validator", run_and_tamper)

    with pytest.raises(cutover.CutoverAdmissionError, match="modern validator bundle changed"):
        cutover.verify_recovery_install(
            receipt_path=receipt,
            expected_receipt_sha256=receipt_hash,
            original_path=Path(inputs["rollback"]),
            installed_path=Path(inputs["target"]),
        )


def test_public_restore_profile_postcheck_failure_restores_the_same_business_point(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    receipt = _create_admission(tmp_path, inputs)
    target = Path(inputs["target"])
    rollback = Path(inputs["rollback"])
    candidate = Path(inputs["candidate"])
    before = _database_hash(target)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime"))
    monkeypatch.setattr(cutover, "PROJECT_ROOT", Path(inputs["friday_root"]))
    monkeypatch.setattr(
        restore_db,
        "PROJECT_ROOT",
        Path(inputs["friday_root"]),
    )
    candidate_manifest = json.loads(
        backup_manifest.manifest_path_for(candidate).read_text(encoding="utf-8")
    )
    monkeypatch.setattr(restore_db, "_verify_sqlite_backup", lambda _path: candidate_manifest)
    monkeypatch.setattr(
        backup_manifest,
        "verify_sqlite_candidate",
        lambda _path, manifest: backup_manifest.BackupVerification(
            backup_manifest.BackupStatus.PASS,
            manifest=manifest,
        ),
    )

    original_postcheck = restore_db._verify_sqlite_install_snapshot

    def fail_installed(
        path: Path,
        manifest: dict[str, object],
    ) -> backup_manifest.BackupVerification:
        if ".installed-" in path.name:
            return backup_manifest.BackupVerification(
                backup_manifest.BackupStatus.FAIL,
                ("injected Friday postcheck failure",),
                manifest,
            )
        return original_postcheck(path, manifest)

    monkeypatch.setattr(restore_db, "_verify_sqlite_install_snapshot", fail_installed)

    with pytest.raises(SystemExit):
        restore_db.restore_sqlite(
            str(candidate),
            str(target),
            run_check=False,
            preverified_rollback=str(rollback),
            offline_target=True,
            friday_cutover_admission=str(receipt),
            friday_cutover_admission_sha256=hashlib.sha256(receipt.read_bytes()).hexdigest(),
        )

    assert _database_hash(target) == before
    with sqlite3.connect(target) as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == (
            cutover.MODERN_REVISION,
        )


def test_restore_profile_requires_a_full_preverified_rollback_pair(tmp_path: Path) -> None:
    inputs = _prepare_inputs(tmp_path)
    receipt = _create_admission(tmp_path, inputs)

    with pytest.raises(SystemExit, match="2"):
        restore_db.restore_sqlite(
            str(inputs["candidate"]),
            str(inputs["target"]),
            run_check=False,
            offline_target=True,
            friday_cutover_admission=str(receipt),
            friday_cutover_admission_sha256=hashlib.sha256(receipt.read_bytes()).hexdigest(),
        )


def test_development_sync_restore_rejects_noncanonical_target_without_test_opt_in(
    tmp_path: Path,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    receipt = _create_development_sync_admission(tmp_path, inputs)

    with pytest.raises(SystemExit, match="2"):
        restore_db.restore_sqlite(
            str(inputs["candidate"]),
            str(inputs["target"]),
            run_check=False,
            preverified_rollback=str(inputs["rollback"]),
            offline_target=True,
            development_sync_admission=str(receipt),
            development_sync_admission_sha256=hashlib.sha256(
                receipt.read_bytes()
            ).hexdigest(),
        )


def test_restore_cli_exposes_development_sync_without_test_target_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "restore_db.py",
            "--sqlite",
            "candidate.db",
            "--preverified-rollback",
            "rollback.db",
            "--development-sync-admission",
            "admission.json",
            "--development-sync-admission-sha256",
            "a" * 64,
            "--development-sync-recovery",
        ],
    )

    args = restore_db.parse_args()

    assert args.development_sync_admission == "admission.json"
    assert args.development_sync_admission_sha256 == "a" * 64
    assert args.development_sync_recovery is True
    assert not hasattr(args, "allow_development_sync_test_target")


def test_development_sync_restore_installs_candidate_and_recovers_original(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    candidate = Path(inputs["candidate"])
    rollback = Path(inputs["rollback"])
    target = Path(inputs["target"])
    with sqlite3.connect(candidate) as connection:
        connection.execute(
            "UPDATE inventory SET warehouse_qty=12 WHERE item_id=?",
            (ITEM_ID,),
        )
    _write_manifest(
        candidate,
        revision=cutover.FRIDAY_REVISION,
        profile=cutover.FRIDAY_PROFILE,
    )
    receipt = _create_development_sync_admission(tmp_path, inputs)
    receipt_hash = hashlib.sha256(receipt.read_bytes()).hexdigest()
    original_hash = _database_hash(rollback)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime"))
    monkeypatch.setattr(restore_db, "PROJECT_ROOT", Path(inputs["friday_root"]))

    restore_db.restore_sqlite(
        str(candidate),
        str(target),
        run_check=False,
        preverified_rollback=str(rollback),
        offline_target=True,
        development_sync_admission=str(receipt),
        development_sync_admission_sha256=receipt_hash,
        allow_development_sync_test_target=True,
    )
    assert _database_hash(target) == _database_hash(candidate)

    restore_db.restore_sqlite(
        str(rollback),
        str(target),
        run_check=False,
        preverified_rollback=str(rollback),
        offline_target=True,
        development_sync_admission=str(receipt),
        development_sync_admission_sha256=receipt_hash,
        development_sync_recovery=True,
        allow_development_sync_test_target=True,
    )
    assert _database_hash(target) == original_hash


def test_development_sync_recovery_does_not_rewrite_existing_rollback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    receipt = _create_development_sync_admission(tmp_path, inputs)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime"))
    monkeypatch.setattr(restore_db, "PROJECT_ROOT", Path(inputs["friday_root"]))
    monkeypatch.setattr(
        restore_db,
        "_replace_sqlite_atomically",
        lambda *_args, **_kwargs: pytest.fail("already-restored target must not be rewritten"),
    )

    restore_db.restore_sqlite(
        str(inputs["rollback"]),
        str(inputs["target"]),
        run_check=False,
        preverified_rollback=str(inputs["rollback"]),
        offline_target=True,
        development_sync_admission=str(receipt),
        development_sync_admission_sha256=hashlib.sha256(
            receipt.read_bytes()
        ).hexdigest(),
        development_sync_recovery=True,
        allow_development_sync_test_target=True,
    )


def test_development_sync_recovery_rejects_target_change_after_classification(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    receipt = _create_development_sync_admission(tmp_path, inputs)
    target = Path(inputs["target"])
    shutil.copy2(Path(inputs["candidate"]), target)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime"))
    monkeypatch.setattr(restore_db, "PROJECT_ROOT", Path(inputs["friday_root"]))
    original_classifier = cutover.classify_development_sync_recovery_target

    def classify_then_mutate(**kwargs: object) -> str:
        state = original_classifier(**kwargs)  # type: ignore[arg-type]
        with sqlite3.connect(target) as connection:
            connection.execute("UPDATE data_revision SET revision=9 WHERE id=1")
        return state

    monkeypatch.setattr(
        cutover,
        "classify_development_sync_recovery_target",
        classify_then_mutate,
    )

    with pytest.raises(SystemExit, match="3"):
        restore_db.restore_sqlite(
            str(inputs["rollback"]),
            str(target),
            run_check=False,
            preverified_rollback=str(inputs["rollback"]),
            offline_target=True,
            development_sync_admission=str(receipt),
            development_sync_admission_sha256=hashlib.sha256(
                receipt.read_bytes()
            ).hexdigest(),
            development_sync_recovery=True,
            allow_development_sync_test_target=True,
        )


def test_public_recovery_profile_restores_modern_after_post_cutover_health_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inputs = _prepare_inputs(tmp_path)
    receipt = _create_admission(tmp_path, inputs)
    receipt_hash = hashlib.sha256(receipt.read_bytes()).hexdigest()
    target = Path(inputs["target"])
    modern = Path(inputs["rollback"])
    friday = Path(inputs["candidate"])
    modern_point = _database_hash(modern)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime"))
    monkeypatch.setattr(restore_db, "PROJECT_ROOT", Path(inputs["friday_root"]))
    friday_manifest = json.loads(
        backup_manifest.manifest_path_for(friday).read_text(encoding="utf-8")
    )
    monkeypatch.setattr(restore_db, "_verify_sqlite_backup", lambda _path: friday_manifest)
    monkeypatch.setattr(
        backup_manifest,
        "verify_sqlite_candidate",
        lambda _path, manifest: backup_manifest.BackupVerification(
            backup_manifest.BackupStatus.PASS,
            manifest=manifest,
        ),
    )
    monkeypatch.setattr(
        restore_db,
        "_verify_sqlite_install_snapshot",
        lambda _path, manifest: backup_manifest.BackupVerification(
            backup_manifest.BackupStatus.PASS,
            manifest=manifest,
        ),
    )

    restore_db.restore_sqlite(
        str(friday),
        str(target),
        run_check=False,
        preverified_rollback=str(modern),
        offline_target=True,
        friday_cutover_admission=str(receipt),
        friday_cutover_admission_sha256=receipt_hash,
    )
    assert _database_hash(target) == _database_hash(friday)

    recovery_receipt = tmp_path / "friday-recovery.json"
    restore_db.restore_sqlite(
        str(modern),
        str(target),
        run_check=False,
        preverified_rollback=str(friday),
        offline_target=True,
        friday_cutover_admission=str(receipt),
        friday_cutover_admission_sha256=receipt_hash,
        friday_cutover_recovery=True,
        friday_cutover_recovery_output=str(recovery_receipt),
    )

    assert _database_hash(target) == modern_point
    with sqlite3.connect(target) as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == (
            cutover.MODERN_REVISION,
        )
    verified_recovery = cutover.verify_recovery_receipt(
        recovery_receipt_path=recovery_receipt,
        expected_recovery_receipt_sha256=hashlib.sha256(
            recovery_receipt.read_bytes()
        ).hexdigest(),
        cutover_receipt_path=receipt,
        expected_cutover_receipt_sha256=receipt_hash,
        original_path=modern,
        target_path=target,
    )
    assert verified_recovery["contract"] == cutover.RECOVERY_CONTRACT
    assert verified_recovery["status"] == "PASS"
