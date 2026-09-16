from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SETUP_NODE20 = ROOT / "scripts" / "dev" / "setup-node20.ps1"


def _script() -> str:
    return SETUP_NODE20.read_text(encoding="utf-8-sig")


def test_setup_node20_uses_official_distribution_and_checksum() -> None:
    script = _script()

    assert "https://nodejs.org/dist/index.json" in script
    assert "SHASUMS256.txt" in script
    assert "Get-FileHash" in script
    assert "SHA256" in script


def test_setup_node20_installs_under_runtime_and_writes_profile_config() -> None:
    script = _script()

    assert "_attic\\runtime" in script
    assert "tools" in script
    assert "frontend-node-path.txt" in script
    assert "Move-Item" in script
    assert "node.exe" in script
    assert "npm.cmd" in script


def test_setup_node20_is_idempotent_and_rejects_invalid_existing_config() -> None:
    script = _script()

    assert "already configured" in script
    assert "existing Node.js configuration is invalid" in script
