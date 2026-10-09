"""The explicit apply backup must pass the real SQLite manifest verifier."""
from __future__ import annotations

import hashlib
from pathlib import Path
import sqlite3

import pytest

from tests.ops.test_backup_manifest_contract import _create_head_db, _seed_valid_inventory
from scripts.ops import backup_db, backup_manifest
from scripts.ops.inventory_operation_admin import CliSafetyError, ensure_apply_backup


def test_explicit_apply_backup_uses_real_verifier_and_preserves_validated_pair(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Repeated admission is read-only and tampered backup bytes fail closed."""
    source = tmp_path / "source.db"
    _create_head_db(source)
    _seed_valid_inventory(source)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime"))
    artifact = backup_db.backup_sqlite(str(source))
    manifest = backup_manifest.manifest_path_for(artifact)
    originals = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in (source, artifact, manifest)}
    assert backup_manifest.verify_sqlite_backup(artifact).status == backup_manifest.BackupStatus.PASS
    for _ in range(2):
        admitted = ensure_apply_backup(database_url=f"sqlite:///{source.as_posix()}", validated_backup=artifact, label="inventory-integrity-repair")
        assert admitted == artifact.resolve()
        assert {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in originals} == originals
    with sqlite3.connect(artifact) as connection:
        connection.execute("UPDATE items SET item_name = 'tampered backup'")
    with pytest.raises(CliSafetyError, match="검증된 백업"):
        ensure_apply_backup(database_url=f"sqlite:///{source.as_posix()}", validated_backup=artifact, label="inventory-integrity-repair")
    assert hashlib.sha256(source.read_bytes()).hexdigest() == originals[source]
    assert hashlib.sha256(manifest.read_bytes()).hexdigest() == originals[manifest]
