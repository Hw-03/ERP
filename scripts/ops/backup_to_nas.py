#!/usr/bin/env python3
"""Create a verified local SQLite backup and publish it to a NAS directory."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
from collections.abc import Callable
from pathlib import Path
from uuid import uuid4


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.ops import backup_manifest  # noqa: E402
from scripts.ops.backup_db import backup_sqlite  # noqa: E402
from scripts.ops.backup_retention import REGULAR_BACKUP_NAME, retain_latest_backups  # noqa: E402


DEFAULT_KEEP = 30
DEFAULT_DB_PATH = PROJECT_ROOT / "backend" / "mes.db"


def hash_file(path: Path) -> str:
    """Return the SHA-256 digest used to compare local and NAS backup bytes."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_backup(path: Path) -> None:
    """Reject a NAS copy unless it passes the project's backup verifier."""
    result = backup_manifest.verify_sqlite_backup(path)
    if result.status is not backup_manifest.BackupStatus.PASS:
        raise ValueError(
            f"backup status is {result.status.value}: {'; '.join(result.errors)}"
        )


def _verify_copied_receipt(
    artifact: Path,
    published_name: str,
    manifest: object,
) -> None:
    """Recheck immutable receipt fields after the NAS copy closes a TOCTOU gap."""

    if not isinstance(manifest, dict):
        raise ValueError("NAS backup manifest receipt is invalid")
    receipt = manifest.get("artifact")
    if (
        manifest.get("contract") != backup_manifest.MANIFEST_CONTRACT
        or manifest.get("runtime_recovery")
        != backup_manifest.RUNTIME_RECOVERY_CONTRACT
        or not isinstance(receipt, dict)
        or receipt.get("name") != published_name
        or receipt.get("size") != artifact.stat().st_size
        or receipt.get("sha256") != hash_file(artifact)
    ):
        raise ValueError("NAS backup manifest receipt mismatch")


def publish_existing_backup(
    source: Path,
    nas_dir: Path,
    *,
    keep: int = DEFAULT_KEEP,
    verify: Callable[[Path], None] = verify_backup,
    hash_file: Callable[[Path], str] = hash_file,
) -> Path:
    """Publish one already-verified regular backup without replacing existing NAS files."""
    if keep < 1:
        raise ValueError("keep must retain at least one backup")
    if not source.is_file() or source.suffix != ".db" or not REGULAR_BACKUP_NAME.fullmatch(source.name):
        raise ValueError(f"source must be a regular .db backup: {source}")
    source_manifest = backup_manifest.manifest_path_for(source)
    if not source_manifest.is_file():
        raise ValueError(f"source backup is LEGACY_UNVERIFIED: {source}")
    verify(source)

    nas_dir.mkdir(parents=True, exist_ok=True)
    published = nas_dir / source.name
    published_manifest = backup_manifest.manifest_path_for(published)
    token = uuid4().hex
    pending = nas_dir / f".{source.name}.pending-{token}.tmp"
    pending_manifest = backup_manifest.manifest_path_for(pending)
    if published.exists() or published_manifest.exists():
        raise FileExistsError(f"NAS backup already exists: {published}")

    operation_error: BaseException | None = None
    try:
        shutil.copy2(source, pending)
        shutil.copy2(source_manifest, pending_manifest)
        if hash_file(source) != hash_file(pending):
            raise ValueError(f"NAS backup hash mismatch: {source} != {pending}")
        if hash_file(source_manifest) != hash_file(pending_manifest):
            raise ValueError("NAS backup manifest hash mismatch")
        try:
            manifest = json.loads(pending_manifest.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise ValueError("NAS backup manifest receipt is invalid") from exc
        _verify_copied_receipt(pending, published.name, manifest)
        candidate = backup_manifest.verify_sqlite_candidate(pending, manifest)
        if candidate.status is not backup_manifest.BackupStatus.PASS:
            raise ValueError(
                "remote backup verification failed: " + "; ".join(candidate.errors)
            )
        backup_manifest.publish_backup_pair(pending, published, manifest)
        os.utime(published, None)
        os.utime(published_manifest, None)
        retain_latest_backups(nas_dir, suffix=".db", keep=keep)
        if not published.is_file() or not published_manifest.is_file():
            raise OSError("published NAS backup pair disappeared during retention")
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        cleanup_errors: list[OSError] = []
        for artifact in (pending, pending_manifest):
            try:
                artifact.unlink(missing_ok=True)
            except OSError as cleanup_error:
                cleanup_errors.append(cleanup_error)
        if operation_error is not None:
            for cleanup_error in cleanup_errors:
                operation_error.add_note(
                    f"NAS pending artifact cleanup failed: {cleanup_error}"
                )
        elif cleanup_errors:
            cleanup_error = cleanup_errors[0]
            for secondary_error in cleanup_errors[1:]:
                cleanup_error.add_note(
                    f"Additional NAS pending artifact cleanup failed: {secondary_error}"
                )
            raise cleanup_error

    print(f"[NAS BACKUP] OK: {published}")
    return published


def create_and_publish_nas_backup(nas_dir: Path, *, keep: int = DEFAULT_KEEP) -> Path:
    """Create the verified local snapshot before publishing it to the NAS."""
    source = backup_sqlite(str(DEFAULT_DB_PATH))
    return publish_existing_backup(source, nas_dir, keep=keep)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Back up DEXCOWIN MES SQLite DB to NAS")
    parser.add_argument("--nas-dir", type=Path, required=True, help="NAS directory for regular .db backups")
    parser.add_argument("--keep", type=int, default=DEFAULT_KEEP, help="regular NAS backups to retain")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        published = create_and_publish_nas_backup(args.nas_dir, keep=args.keep)
    except (OSError, ValueError) as exc:
        print(f"[NAS BACKUP] failed: {exc}", file=sys.stderr)
        return 1
    print(f"NAS_BACKUP_PATH={published}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
