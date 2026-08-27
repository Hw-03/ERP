from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ops import backup_to_nas


BACKUP_TO_NAS_BAT = ROOT / "scripts" / "ops" / "backup_to_nas.bat"


def _regular_backup_name(index: int) -> str:
    return f"mes_20260826_2200{index:02d}_{index:06d}_{index:032x}.db"


def test_publish_existing_backup_verifies_before_publication_and_preserves_mes_db(tmp_path: Path) -> None:
    source = tmp_path / _regular_backup_name(1)
    source.write_bytes(b"verified-local-backup")
    nas_dir = tmp_path / "nas"
    nas_dir.mkdir()
    legacy = nas_dir / "mes.db"
    legacy.write_bytes(b"legacy-backup")
    verified: list[Path] = []

    published = backup_to_nas.publish_existing_backup(
        source,
        nas_dir,
        keep=30,
        verify=lambda path: verified.append(path),
    )

    assert published == nas_dir / source.name
    assert published.read_bytes() == source.read_bytes()
    assert verified == [nas_dir / f".{source.name}.pending"]
    assert legacy.read_bytes() == b"legacy-backup"
    assert not list(nas_dir.glob(".*.pending"))


def test_publish_existing_backup_removes_pending_file_when_verification_fails(tmp_path: Path) -> None:
    source = tmp_path / _regular_backup_name(1)
    source.write_bytes(b"verified-local-backup")
    nas_dir = tmp_path / "nas"
    nas_dir.mkdir()
    oldest = nas_dir / _regular_backup_name(2)
    oldest.write_bytes(b"old-backup")

    def fail_verification(_path: Path) -> None:
        raise ValueError("remote verification failed")

    with pytest.raises(ValueError, match="remote verification failed"):
        backup_to_nas.publish_existing_backup(source, nas_dir, keep=1, verify=fail_verification)

    assert oldest.exists()
    assert not (nas_dir / source.name).exists()
    assert not list(nas_dir.glob(".*.pending"))


def test_publish_existing_backup_keeps_thirty_regular_files_and_preserves_mes_db(tmp_path: Path) -> None:
    source = tmp_path / _regular_backup_name(99)
    source.write_bytes(b"verified-local-backup")
    nas_dir = tmp_path / "nas"
    nas_dir.mkdir()
    legacy = nas_dir / "mes.db"
    legacy.write_bytes(b"legacy-backup")
    for index in range(31):
        path = nas_dir / _regular_backup_name(index)
        path.write_bytes(str(index).encode())

    backup_to_nas.publish_existing_backup(source, nas_dir, keep=30, verify=lambda _path: None)

    regular_backups = [
        path for path in nas_dir.iterdir() if backup_to_nas.REGULAR_BACKUP_NAME.fullmatch(path.name)
    ]
    assert len(regular_backups) == 30
    assert (nas_dir / source.name).exists()
    assert legacy.read_bytes() == b"legacy-backup"


def test_publish_existing_backup_rejects_hash_mismatch_without_publication(tmp_path: Path) -> None:
    source = tmp_path / _regular_backup_name(1)
    source.write_bytes(b"verified-local-backup")
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
    assert not list(nas_dir.glob(".*.pending"))


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
