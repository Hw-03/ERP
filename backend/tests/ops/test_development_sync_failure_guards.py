from __future__ import annotations

import hashlib
from pathlib import Path
import shutil
import sqlite3
import sys
from typing import Callable

import pytest


ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.tests.ops import test_friday_profile_cutover as support  # noqa: E402
from scripts.ops import friday_profile_cutover as cutover  # noqa: E402
from scripts.ops import restore_db  # noqa: E402


def _create_receipt(tmp_path: Path, inputs: dict[str, Path | str]) -> Path:
    return support._create_development_sync_admission(tmp_path, inputs)


@pytest.mark.parametrize(
    ("bad_pin", "error"),
    (
        ("rollback", "rollback validator bundle hash mismatch"),
        ("candidate", "candidate validator bundle hash mismatch"),
    ),
)
def test_development_sync_admission_rejects_wrong_trusted_validator_pin(
    tmp_path: Path,
    bad_pin: str,
    error: str,
) -> None:
    inputs = support._prepare_inputs(tmp_path)
    rollback_pin = str(inputs["modern_hash"])
    candidate_pin = str(inputs["friday_hash"])
    if bad_pin == "rollback":
        rollback_pin = "0" * 64
    else:
        candidate_pin = "0" * 64

    with pytest.raises(cutover.CutoverAdmissionError, match=error):
        cutover.create_development_sync_admission(
            candidate_path=Path(inputs["candidate"]),
            rollback_path=Path(inputs["rollback"]),
            target_path=Path(inputs["target"]),
            rollback_validator_root=Path(inputs["modern_root"]),
            candidate_validator_root=Path(inputs["friday_root"]),
            trusted_rollback_validator_sha256=rollback_pin,
            trusted_candidate_validator_sha256=candidate_pin,
            output_path=tmp_path / "must-not-exist.json",
        )


def test_development_sync_admission_rejects_wrong_receipt_pin(tmp_path: Path) -> None:
    inputs = support._prepare_inputs(tmp_path)
    receipt = _create_receipt(tmp_path, inputs)

    with pytest.raises(
        cutover.CutoverAdmissionError,
        match="development sync admission SHA-256 mismatch",
    ):
        cutover.verify_development_sync_admission(
            receipt_path=receipt,
            expected_receipt_sha256="0" * 64,
            candidate_path=Path(inputs["candidate"]),
            rollback_path=Path(inputs["rollback"]),
            target_path=Path(inputs["target"]),
            candidate_validator_root=Path(inputs["friday_root"]),
        )


@pytest.mark.parametrize(
    ("root_key", "error"),
    (
        ("modern_root", "rollback validator bundle hash mismatch"),
        ("friday_root", "candidate validator bundle hash mismatch"),
    ),
)
def test_development_sync_admission_rejects_validator_bundle_drift(
    tmp_path: Path,
    root_key: str,
    error: str,
) -> None:
    inputs = support._prepare_inputs(tmp_path)
    receipt = _create_receipt(tmp_path, inputs)
    support_file = Path(inputs[root_key]) / "scripts" / "ops" / "backup_retention.py"
    support_file.write_bytes(support_file.read_bytes() + b"# changed after admission\n")

    with pytest.raises(cutover.CutoverAdmissionError, match=error):
        cutover.verify_development_sync_admission(
            receipt_path=receipt,
            expected_receipt_sha256=hashlib.sha256(receipt.read_bytes()).hexdigest(),
            candidate_path=Path(inputs["candidate"]),
            rollback_path=Path(inputs["rollback"]),
            target_path=Path(inputs["target"]),
            candidate_validator_root=Path(inputs["friday_root"]),
        )


def _prepare_changed_candidate(
    tmp_path: Path,
) -> tuple[dict[str, Path | str], Path]:
    inputs = support._prepare_inputs(tmp_path)
    candidate = Path(inputs["candidate"])
    with sqlite3.connect(candidate) as connection:
        connection.execute(
            "UPDATE inventory SET warehouse_qty=12 WHERE item_id=?",
            (support.ITEM_ID,),
        )
    support._write_manifest(
        candidate,
        revision=cutover.FRIDAY_REVISION,
        profile=cutover.FRIDAY_PROFILE,
    )
    return inputs, _create_receipt(tmp_path, inputs)


def _corrupt_second_postcheck(
    verifier: Callable[..., str],
) -> tuple[Callable[..., str], Callable[[], int]]:
    calls = 0

    def verify_with_corrupt_postcheck(*args: object, **kwargs: object) -> str:
        nonlocal calls
        calls += 1
        if calls == 2:
            installed = Path(str(kwargs["installed_path"]))
            with sqlite3.connect(installed) as connection:
                connection.execute("UPDATE data_revision SET revision=99 WHERE id=1")
        return verifier(*args, **kwargs)

    return verify_with_corrupt_postcheck, lambda: calls


def test_development_sync_install_postcheck_failure_restores_exact_original(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inputs, receipt = _prepare_changed_candidate(tmp_path)
    target = Path(inputs["target"])
    rollback = Path(inputs["rollback"])
    original_target_hash = support._database_hash(target)
    wrapped, call_count = _corrupt_second_postcheck(
        cutover.verify_development_sync_install
    )
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime"))
    monkeypatch.setattr(restore_db, "PROJECT_ROOT", Path(inputs["friday_root"]))
    monkeypatch.setattr(cutover, "verify_development_sync_install", wrapped)

    with pytest.raises(SystemExit, match="1"):
        restore_db.restore_sqlite(
            str(inputs["candidate"]),
            str(target),
            run_check=False,
            preverified_rollback=str(rollback),
            offline_target=True,
            development_sync_admission=str(receipt),
            development_sync_admission_sha256=hashlib.sha256(
                receipt.read_bytes()
            ).hexdigest(),
            allow_development_sync_test_target=True,
        )

    assert call_count() == 2
    assert support._database_hash(target) == original_target_hash
    assert cutover.compare_exact_database(rollback, target)


def test_development_sync_recovery_postcheck_failure_restores_exact_candidate(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inputs, receipt = _prepare_changed_candidate(tmp_path)
    target = Path(inputs["target"])
    candidate = Path(inputs["candidate"])
    rollback = Path(inputs["rollback"])
    shutil.copy2(candidate, target)
    original_target_hash = support._database_hash(target)
    wrapped, call_count = _corrupt_second_postcheck(
        cutover.verify_development_sync_recovery_install
    )
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime"))
    monkeypatch.setattr(restore_db, "PROJECT_ROOT", Path(inputs["friday_root"]))
    monkeypatch.setattr(cutover, "verify_development_sync_recovery_install", wrapped)

    with pytest.raises(SystemExit, match="1"):
        restore_db.restore_sqlite(
            str(rollback),
            str(target),
            run_check=False,
            preverified_rollback=str(rollback),
            offline_target=True,
            development_sync_admission=str(receipt),
            development_sync_admission_sha256=hashlib.sha256(
                receipt.read_bytes()
            ).hexdigest(),
            development_sync_recovery=True,
            allow_development_sync_test_target=True,
        )

    assert call_count() == 2
    assert support._database_hash(target) == original_target_hash
    assert cutover.compare_exact_database(candidate, target)
