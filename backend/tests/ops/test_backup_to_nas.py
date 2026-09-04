from __future__ import annotations

import json
import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest
import sqlalchemy as sa


ROOT = Path(__file__).resolve().parents[3]
BACKEND_DIR = ROOT / "backend"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import models as _models  # noqa: E402, F401
from bootstrap.schema import ensure_schema  # noqa: E402
from scripts.ops import backup_manifest, backup_to_nas  # noqa: E402


BACKUP_TO_NAS_BAT = ROOT / "scripts" / "ops" / "backup_to_nas.bat"


def _regular_backup_name(index: int) -> str:
    return f"mes_20260826_2200{index:02d}_{index:06d}_{index:032x}.db"


def _stub_verified_pair(
    source: Path,
    *,
    template: Path | None = None,
    evidence: dict[str, object] | None = None,
) -> dict[str, object]:
    source.unlink(missing_ok=True)
    if template is None:
        engine = sa.create_engine(f"sqlite:///{source.as_posix()}")
        try:
            ensure_schema(engine=engine)
        finally:
            engine.dispose()
    else:
        shutil.copy2(template, source)

    if evidence is None:
        evidence = backup_manifest.collect_database_evidence(
            f"sqlite:///{source.as_posix()}",
            expected_engine="sqlite",
        )
    connection = sqlite3.connect(source)
    try:
        journal_mode = str(connection.execute("PRAGMA journal_mode").fetchone()[0])
    finally:
        connection.close()
    manifest = backup_manifest.build_manifest(
        source,
        published_name=source.name,
        evidence=evidence,
        source_snapshot={
            "method": "sqlite3.backup",
            "wal_included": True,
            "journal_mode": journal_mode,
            "physical_generation": backup_manifest.sqlite_file_generation(source),
        },
    )
    backup_manifest.manifest_path_for(source).write_text(
        json.dumps(manifest),
        encoding="utf-8",
    )
    receipt = backup_manifest.verify_manifest_receipt(
        source,
        expected_engine="sqlite",
    )
    assert receipt.status is backup_manifest.BackupStatus.PASS, receipt.errors
    return evidence


def test_publish_existing_backup_verifies_before_publication_and_preserves_mes_db(
    tmp_path: Path,
) -> None:
    source = tmp_path / _regular_backup_name(1)
    source.write_bytes(b"verified-local-backup")
    _stub_verified_pair(source)
    nas_dir = tmp_path / "nas"
    nas_dir.mkdir()
    legacy = nas_dir / "mes.db"
    legacy.write_bytes(b"legacy-backup")
    verified: list[Path] = []
    published_path = nas_dir / source.name

    def verify_before_publication(path: Path) -> None:
        assert path == source
        assert not published_path.exists()
        assert not backup_manifest.manifest_path_for(published_path).exists()
        assert not list(nas_dir.glob(".*.pending-*"))
        verified.append(path)

    published = backup_to_nas.publish_existing_backup(
        source,
        nas_dir,
        keep=30,
        verify=verify_before_publication,
    )

    assert published == nas_dir / source.name
    assert published.read_bytes() == source.read_bytes()
    assert verified == [source]
    assert legacy.read_bytes() == b"legacy-backup"
    assert backup_manifest.manifest_path_for(published).is_file()
    verification = backup_manifest.verify_sqlite_backup(published)
    assert verification.status is backup_manifest.BackupStatus.PASS, verification.errors
    assert not list(nas_dir.glob(".*.pending-*"))


def test_publish_existing_backup_removes_pending_file_when_verification_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / _regular_backup_name(1)
    source.write_bytes(b"verified-local-backup")
    _stub_verified_pair(source)
    nas_dir = tmp_path / "nas"
    nas_dir.mkdir()
    oldest = nas_dir / _regular_backup_name(2)
    oldest.write_bytes(b"old-backup")

    attempted_candidates: list[Path] = []

    def fail_candidate(path: Path, _manifest: dict[str, object]) -> backup_manifest.BackupVerification:
        assert path.is_file()
        assert backup_manifest.manifest_path_for(path).is_file()
        attempted_candidates.append(path)
        return backup_manifest.BackupVerification(
            backup_manifest.BackupStatus.FAIL,
            ("injected candidate failure",),
        )

    monkeypatch.setattr(
        backup_to_nas.backup_manifest,
        "verify_sqlite_candidate",
        fail_candidate,
    )

    with pytest.raises(ValueError, match="remote backup verification failed"):
        backup_to_nas.publish_existing_backup(
            source,
            nas_dir,
            keep=1,
            verify=lambda _path: None,
        )

    assert len(attempted_candidates) == 1
    assert not attempted_candidates[0].exists()
    assert oldest.exists()
    assert not (nas_dir / source.name).exists()
    assert not list(nas_dir.glob(".*.pending-*"))


def test_publish_existing_backup_rejects_zero_retention_before_publication(
    tmp_path: Path,
) -> None:
    source = tmp_path / _regular_backup_name(1)
    source.write_bytes(b"verified-local-backup")
    _stub_verified_pair(source)
    nas_dir = tmp_path / "nas-zero-retention"

    with pytest.raises(ValueError, match="at least one"):
        backup_to_nas.publish_existing_backup(
            source,
            nas_dir,
            keep=0,
            verify=lambda _path: None,
        )

    assert source.is_file()
    assert backup_manifest.manifest_path_for(source).is_file()
    assert not nas_dir.exists()


def test_publish_existing_backup_keeps_thirty_regular_files_and_preserves_mes_db(
    tmp_path: Path,
) -> None:
    source = tmp_path / _regular_backup_name(99)
    source.write_bytes(b"verified-local-backup")
    source_evidence = _stub_verified_pair(source)
    nas_dir = tmp_path / "nas"
    nas_dir.mkdir()
    legacy = nas_dir / "mes.db"
    legacy.write_bytes(b"legacy-backup")
    for index in range(31):
        path = nas_dir / _regular_backup_name(index)
        _stub_verified_pair(path, template=source, evidence=source_evidence)

    backup_to_nas.publish_existing_backup(source, nas_dir, keep=30, verify=lambda _path: None)

    regular_backups = [
        path for path in nas_dir.iterdir() if backup_to_nas.REGULAR_BACKUP_NAME.fullmatch(path.name)
    ]
    assert len(regular_backups) == 30
    assert (nas_dir / source.name).exists()
    assert legacy.read_bytes() == b"legacy-backup"


def test_publish_existing_backup_rejects_hash_mismatch_without_publication(
    tmp_path: Path,
) -> None:
    source = tmp_path / _regular_backup_name(1)
    source.write_bytes(b"verified-local-backup")
    _stub_verified_pair(source)
    nas_dir = tmp_path / "nas"
    nas_dir.mkdir()
    hashes = iter(("local-hash", "remote-hash"))

    with pytest.raises(ValueError, match="hash mismatch"):
        backup_to_nas.publish_existing_backup(
            source,
            nas_dir,
            keep=30,
            verify=lambda _path: None,
            hash_file=lambda _path: next(hashes),
        )

    assert not (nas_dir / source.name).exists()
    assert not list(nas_dir.glob(".*.pending-*"))


def test_publish_existing_backup_rejects_non_sqlite_regular_backup(tmp_path: Path) -> None:
    source = tmp_path / _regular_backup_name(1).replace(".db", ".sql")
    source.write_bytes(b"not-a-sqlite-backup")
    nas_dir = tmp_path / "nas"

    with pytest.raises(ValueError, match="regular .db backup"):
        backup_to_nas.publish_existing_backup(source, nas_dir, keep=30, verify=lambda _path: None)

    assert not nas_dir.exists()


@pytest.mark.skipif(os.name != "nt", reason="Windows cmd.exe is required")
def test_backup_to_nas_batch_forwards_python_help() -> None:
    result = subprocess.run(
        ["cmd.exe", "/c", str(BACKUP_TO_NAS_BAT), "--help"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "Back up DEXCOWIN MES SQLite DB to NAS" in result.stdout
