from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
BEHAVIOR_TEST = ROOT / "scripts" / "dev" / "tests" / "schema-readiness-adapter.ps1"


@pytest.mark.skipif(
    sys.platform != "win32",
    reason="schema readiness adapter behavior requires Windows PowerShell",
)
def test_schema_readiness_adapter_behavior_script_passes() -> None:
    powershell = shutil.which("powershell.exe")
    assert powershell is not None, "Windows PowerShell executable was not found"

    result = subprocess.run(
        [
            powershell,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(BEHAVIOR_TEST),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
