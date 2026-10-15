"""정상 복구 진입 전에 경로와 새 산출물의 결합을 검사한다."""
import hashlib
import json
from pathlib import Path

import pytest

import final_bundle_normal_recovery as adapter


def test_manifest_hash_must_match_before_loading(tmp_path: Path) -> None:
    manifest = tmp_path / "manifest.json"
    manifest.write_text("{}", encoding="utf-8")
    with pytest.raises(adapter.release.ReleaseError, match="Manifest hash"):
        adapter.load_manifest(manifest, "0" * 64, tmp_path)


def test_manifest_outside_private_root_is_rejected(tmp_path: Path) -> None:
    private = tmp_path / "private"
    private.mkdir()
    manifest = tmp_path / "manifest.json"
    manifest.write_text("{}", encoding="utf-8")
    with pytest.raises(adapter.release.ReleaseError, match="outside"):
        adapter.load_manifest(manifest, adapter.recovery._sha(manifest), private)


@pytest.mark.parametrize("patch", [{"target_revision": "20261007_0043"}, {"final_frozen_candidate": False}, {"status": "NOT_RUN"}])
def test_manifest_contract_rejects_incomplete_or_wrong_revision(tmp_path: Path, patch: dict) -> None:
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"status": "PRODUCTION_READY", "target_revision": adapter.REVISION,
                                    "final_frozen_candidate": True, **patch}), encoding="utf-8")
    with pytest.raises(adapter.release.ReleaseError, match="Final frozen"):
        adapter.load_manifest(manifest, adapter.recovery._sha(manifest), tmp_path)


def test_manifest_bytes_are_not_rewritten(tmp_path: Path) -> None:
    manifest = tmp_path / "manifest.json"
    original = b'{"status":"PRODUCTION_READY","target_revision":"20261008_0044","final_frozen_candidate":true}\n'
    manifest.write_bytes(original)
    assert adapter.load_manifest(manifest, hashlib.sha256(original).hexdigest(), tmp_path)["target_revision"] == adapter.REVISION
    assert manifest.read_bytes() == original


def test_existing_fixture_is_never_reused(tmp_path: Path) -> None:
    sandbox = tmp_path / "run-existing"
    sandbox.mkdir()
    with pytest.raises(adapter.release.ReleaseError, match="Fresh fixture"):
        adapter.reserve_fixture(sandbox, tmp_path)


def test_fixture_escape_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(adapter.release.ReleaseError, match="outside"):
        adapter.reserve_fixture(tmp_path / "outside", tmp_path / "qa")


def test_fresh_fixture_has_no_database_until_validated(tmp_path: Path) -> None:
    sandbox = tmp_path / "run-new"
    employee = adapter.reserve_fixture(sandbox, tmp_path)
    assert employee == sandbox / "employee"
    assert not (employee / "backend/mes.db").exists()


def test_qa_receipt_rejects_changed_artifact_or_protected_proxy(tmp_path: Path) -> None:
    qa = tmp_path / "qa"
    (qa / "frontend").mkdir(parents=True)
    asset = qa / "frontend/asset.js"
    asset.write_text("original", encoding="utf-8")
    receipt = {"source": {}, "toolchain": {}, "environment": {**adapter.release.BUILD_ENV, "BACKEND_INTERNAL_URL": "http://127.0.0.1:8042"},
               "artifacts": adapter.release.files(qa / "frontend"), "status": "QA_ONLY"}
    adapter.release._json(qa / "qa-receipt.json", receipt)
    adapter.validate_qa(qa, {"source": {}, "toolchain": {}})
    asset.write_text("changed", encoding="utf-8")
    with pytest.raises(adapter.release.ReleaseError, match="QA artifact"):
        adapter.validate_qa(qa, {"source": {}, "toolchain": {}})
    asset.write_text("original", encoding="utf-8")
    receipt["environment"]["BACKEND_INTERNAL_URL"] = "http://localhost:8010"
    adapter.release._json(qa / "qa-receipt.json", receipt)
    with pytest.raises(adapter.release.ReleaseError, match="QA artifact"):
        adapter.validate_qa(qa, {"source": {}, "toolchain": {}})
