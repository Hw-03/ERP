"""Retention rules for regular DEXCOWIN MES database backups."""

from __future__ import annotations

import errno
import json
import os
import re
from pathlib import Path
from uuid import uuid4

from scripts.ops.backup_manifest import BackupStatus, verify_manifest_receipt
from scripts.ops.durable_file import (
    durable_replace as _durable_replace,
    durable_unlink as _durable_unlink,
)
from scripts.ops.recovery_owner import (
    current_process_owner,
    process_owner_is_active,
    valid_process_owner,
)


DEFAULT_KEEP = 10
RECOVERY_RECEIPT_PREFIX = ".backup-retention-recovery-"
RETENTION_FENCE_NAME = ".backup-retention-fence.json"
RETENTION_FENCE_CONTRACT = "backup-retention-fence/v1"
RETENTION_LOCK_NAME = ".backup-retention.lock"
REGULAR_BACKUP_NAME = re.compile(
    r"^mes_\d{8}_\d{6}(?:_\d{6}_[0-9a-f]{32})?\.(?:db|sql)$"
)
def manifest_path_for(artifact: Path) -> Path:
    """Return the v1 companion path without importing the heavier verifier."""

    return artifact.with_name(f"{artifact.name}.manifest.json")


def _has_valid_retention_receipt(artifact: Path) -> bool:
    """Admit only a complete immutable pair into retention ranking."""

    expected_engine = {".db": "sqlite", ".sql": "postgresql"}.get(artifact.suffix)
    if expected_engine is None:
        return False
    try:
        result = verify_manifest_receipt(
            artifact,
            expected_engine=expected_engine,
        )
        return result.status in {BackupStatus.PASS, BackupStatus.STRUCTURAL_ONLY}
    except OSError:
        return False


def _load_retention_fence(path: Path) -> dict[str, object]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise OSError(f"invalid retention fence: {path}") from exc
    if (
        not isinstance(payload, dict)
        or payload.get("contract") != RETENTION_FENCE_CONTRACT
        or not isinstance(payload.get("fence_id"), str)
        or not valid_process_owner(payload.get("owner"))
    ):
        raise OSError(f"invalid retention fence: {path}")
    return payload


def _try_acquire_retention_operation_lock(directory: Path) -> int | None:
    """Acquire one crash-released OS lock shared by every retention process."""

    descriptor = os.open(
        directory / RETENTION_LOCK_NAME,
        os.O_CREAT | os.O_RDWR,
    )
    try:
        if os.name == "nt":
            import msvcrt

            if os.fstat(descriptor).st_size == 0:
                os.write(descriptor, b"\x00")
            os.lseek(descriptor, 0, os.SEEK_SET)
            msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as exc:
        os.close(descriptor)
        if exc.errno in {errno.EACCES, errno.EAGAIN} or getattr(exc, "winerror", None) == 33:
            return None
        raise
    return descriptor


def _release_retention_operation_lock(descriptor: int) -> None:
    try:
        if os.name == "nt":
            import msvcrt

            os.lseek(descriptor, 0, os.SEEK_SET)
            msvcrt.locking(descriptor, msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(descriptor, fcntl.LOCK_UN)
    finally:
        os.close(descriptor)


def _try_acquire_retention_fence(directory: Path) -> tuple[Path, str, int] | None:
    descriptor = _try_acquire_retention_operation_lock(directory)
    if descriptor is None:
        return None
    owned_descriptor: int | None = descriptor
    fence = directory / RETENTION_FENCE_NAME
    fence_id = uuid4().hex
    payload = {
        "contract": RETENTION_FENCE_CONTRACT,
        "fence_id": fence_id,
        "owner": current_process_owner(),
    }
    try:
        for _ in range(2):
            try:
                fence_descriptor = os.open(
                    fence,
                    os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                )
            except FileExistsError:
                try:
                    existing = _load_retention_fence(fence)
                except OSError:
                    abandoned = directory / (
                        f"{RETENTION_FENCE_NAME}.abandoned-{uuid4().hex}.tmp"
                    )
                    os.replace(fence, abandoned)
                    try:
                        abandoned.unlink(missing_ok=True)
                    except OSError:
                        pass
                    continue
                if process_owner_is_active(existing["owner"]):
                    _release_retention_operation_lock(descriptor)
                    owned_descriptor = None
                    return None
                fence.unlink()
                continue
            try:
                with os.fdopen(
                    fence_descriptor,
                    "w",
                    encoding="utf-8",
                    newline="\n",
                ) as handle:
                    json.dump(payload, handle, ensure_ascii=True, sort_keys=True)
                    handle.write("\n")
                    handle.flush()
                    os.fsync(handle.fileno())
            except BaseException as primary_error:
                try:
                    fence.unlink(missing_ok=True)
                except OSError as cleanup_error:
                    primary_error.add_note(
                        f"partial retention fence cleanup failed: {cleanup_error}"
                    )
                raise
            return fence, fence_id, descriptor
        raise OSError(f"could not acquire retention fence: {fence}")
    except BaseException:
        if owned_descriptor is not None:
            _release_retention_operation_lock(owned_descriptor)
        raise


def _release_retention_fence(fence: Path, fence_id: str, descriptor: int) -> None:
    try:
        payload = _load_retention_fence(fence)
        if payload["fence_id"] != fence_id:
            raise OSError(f"retention fence ownership changed: {fence}")
        fence.unlink()
    finally:
        _release_retention_operation_lock(descriptor)


def _write_recovery_receipt(
    receipt: Path,
    mappings: list[tuple[Path, Path]],
    *,
    state: str,
) -> None:
    """Publish cleanup intent before either half of a pair is depublished."""

    pending = receipt.with_name(f".{receipt.name}.pending-{uuid4().hex}.tmp")
    if state not in {"removing", "recovery_required", "cleanup_required"}:
        raise ValueError(f"invalid retention recovery state: {state}")
    payload = {
        "contract": "backup-retention-recovery/v1",
        "state": state,
        "owner": current_process_owner(),
        "mappings": [
            {"original": original.name, "quarantined": quarantined.name}
            for original, quarantined in mappings
        ],
    }
    operation_error: BaseException | None = None
    try:
        with pending.open("wb") as handle:
            handle.write(
                (
                    json.dumps(payload, ensure_ascii=True, sort_keys=True) + "\n"
                ).encode("utf-8")
            )
            handle.flush()
            os.fsync(handle.fileno())
        _durable_replace(pending, receipt)
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        try:
            pending.unlink(missing_ok=True)
        except OSError as cleanup_error:
            if operation_error is None:
                raise
            operation_error.add_note(
                f"retention recovery receipt cleanup failed: {cleanup_error}"
            )


def _load_recovery_receipt(
    receipt: Path,
) -> tuple[str, dict[str, object], list[tuple[Path, Path]]]:
    """Load bounded same-directory paths from one retention recovery receipt."""

    try:
        payload = json.loads(receipt.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise OSError(f"invalid retention cleanup receipt: {receipt}") from exc
    entries = payload.get("mappings") if isinstance(payload, dict) else None
    if (
        not isinstance(payload, dict)
        or payload.get("contract") != "backup-retention-recovery/v1"
        or payload.get("state")
        not in {"removing", "recovery_required", "cleanup_required"}
        or not valid_process_owner(payload.get("owner"))
        or not isinstance(entries, list)
    ):
        raise OSError(f"invalid retention cleanup receipt: {receipt}")
    receipt_match = re.fullmatch(
        rf"{re.escape(RECOVERY_RECEIPT_PREFIX)}([0-9a-f]{{32}})\.json",
        receipt.name,
    )
    if receipt_match is None:
        raise OSError(f"invalid retention cleanup receipt: {receipt}")
    token = receipt_match.group(1)
    mappings: list[tuple[Path, Path]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise OSError(f"invalid retention cleanup receipt: {receipt}")
        original_name = entry.get("original")
        quarantined_name = entry.get("quarantined")
        if (
            not isinstance(original_name, str)
            or not isinstance(quarantined_name, str)
            or Path(original_name).name != original_name
            or Path(quarantined_name).name != quarantined_name
        ):
            raise OSError(f"invalid retention cleanup receipt: {receipt}")
        mappings.append(
            (
                receipt.parent / original_name,
                receipt.parent / quarantined_name,
            )
        )
    if len(mappings) != 2:
        raise OSError(f"invalid retention cleanup receipt: {receipt}")
    originals = [original for original, _ in mappings]
    quarantined_paths = [quarantined for _, quarantined in mappings]
    artifacts = [
        original for original in originals if REGULAR_BACKUP_NAME.fullmatch(original.name)
    ]
    if len(artifacts) != 1:
        raise OSError(f"invalid retention cleanup receipt: {receipt}")
    artifact = artifacts[0]
    manifest = manifest_path_for(artifact)
    if (
        set(originals) != {artifact, manifest}
        or len(set(originals + quarantined_paths)) != 4
        or any(
            quarantined.name != f".{original.name}.removing-{token}.tmp"
            for original, quarantined in mappings
        )
    ):
        raise OSError(f"invalid retention cleanup receipt: {receipt}")
    owner = payload["owner"]
    assert isinstance(owner, dict)
    return str(payload["state"]), owner, mappings


def _recover_cleanup_receipt(receipt: Path, *, force: bool = False) -> None:
    """Resolve an interrupted pair removal and delete the receipt last."""

    state, owner, mappings = _load_recovery_receipt(receipt)
    if not force and state == "removing" and process_owner_is_active(owner):
        return
    original_count = sum(original.exists() for original, _ in mappings)
    if original_count == 0:
        for _, quarantined in mappings:
            _durable_unlink(quarantined, missing_ok=True)
    else:
        for original, quarantined in reversed(mappings):
            if original.exists():
                _durable_unlink(quarantined, missing_ok=True)
            elif quarantined.exists():
                _durable_replace(quarantined, original)
            else:
                raise OSError(
                    f"retention cleanup cannot recover missing pair member: {original}"
                )
    _durable_unlink(receipt)


def _recover_cleanup_receipts(directory: Path) -> None:
    """Retry every interrupted retention cleanup before selecting new victims."""

    for receipt in sorted(directory.glob(f"{RECOVERY_RECEIPT_PREFIX}*.json")):
        _recover_cleanup_receipt(receipt)


def _remove_backup_pair(path: Path) -> None:
    """Depublish a pair with a durable retry receipt for cleanup failures."""

    manifest = manifest_path_for(path)
    token = uuid4().hex
    quarantined_artifact = path.parent / f".{path.name}.removing-{token}.tmp"
    quarantined_manifest = path.parent / f".{manifest.name}.removing-{token}.tmp"
    receipt = path.parent / f"{RECOVERY_RECEIPT_PREFIX}{token}.json"
    mappings = [
        (manifest, quarantined_manifest),
        (path, quarantined_artifact),
    ]
    _write_recovery_receipt(receipt, mappings, state="removing")

    try:
        if manifest.exists():
            _durable_replace(manifest, quarantined_manifest)
        _durable_replace(path, quarantined_artifact)
    except OSError as primary_error:
        try:
            _write_recovery_receipt(
                receipt,
                mappings,
                state="recovery_required",
            )
        except OSError as recovery_receipt_error:
            primary_error.add_note(
                f"retention recovery receipt update failed: {recovery_receipt_error}"
            )
        try:
            _recover_cleanup_receipt(receipt, force=True)
        except BaseException as recovery_error:
            primary_error.add_note(
                f"retention pair recovery failed: {recovery_error}"
            )
        raise

    try:
        _write_recovery_receipt(
            receipt,
            mappings,
            state="cleanup_required",
        )
        for _, quarantined in mappings:
            _durable_unlink(quarantined, missing_ok=True)
        _durable_unlink(receipt)
    except OSError as exc:
        raise OSError(
            f"retention cleanup failed; retry receipt: {receipt}"
        ) from exc


def retain_latest_backups(directory: Path, *, suffix: str, keep: int = DEFAULT_KEEP) -> list[Path]:
    """Keep the newest regular backups and never include PRE snapshots."""
    if keep < 0:
        raise ValueError("keep must be zero or greater")
    if not directory.exists():
        return []
    acquired = _try_acquire_retention_fence(directory)
    if acquired is None:
        return []
    fence, fence_id, descriptor = acquired
    operation_error: BaseException | None = None
    try:
        _recover_cleanup_receipts(directory)

        snapshots: list[tuple[int, str, Path]] = []
        for path in directory.iterdir():
            try:
                if (
                    path.is_file()
                    and path.suffix == suffix
                    and REGULAR_BACKUP_NAME.fullmatch(path.name)
                    and _has_valid_retention_receipt(path)
                ):
                    snapshots.append((path.stat().st_mtime_ns, path.name, path))
            except FileNotFoundError:
                continue

        candidates = [entry[2] for entry in sorted(snapshots, reverse=True)]
        removed: list[Path] = []
        for path in candidates[keep:]:
            try:
                _remove_backup_pair(path)
            except PermissionError:
                if path.exists():
                    continue
            removed.append(path)
        return removed
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        try:
            _release_retention_fence(fence, fence_id, descriptor)
        except OSError as cleanup_error:
            if operation_error is None:
                raise
            operation_error.add_note(f"retention fence cleanup failed: {cleanup_error}")
