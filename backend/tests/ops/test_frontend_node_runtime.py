"""The development scheduler must use its configured Node 20 installation."""

from pathlib import Path
import shutil
import subprocess

import pytest


def test_development_node_runtime_selection() -> None:
    powershell = shutil.which("powershell.exe")
    if powershell is None:
        pytest.skip("Windows PowerShell is required")
    root = Path(__file__).resolve().parents[3]
    result = subprocess.run(
        [powershell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
         str(root / "scripts/dev/tests/frontend-node-runtime.ps1")],
        cwd=root, capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "frontend Node runtime contracts passed" in result.stdout
