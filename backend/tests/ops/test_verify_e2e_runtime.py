from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
VERIFY_E2E = ROOT / "scripts" / "dev" / "verify_e2e.ps1"
VERIFY_LOCAL = ROOT / "scripts" / "dev" / "verify_local.ps1"


def _write_fake_command(path: Path, body: str) -> None:
    path.write_text("@echo off\r\n" + body, encoding="ascii")


@pytest.mark.skipif(sys.platform != "win32", reason="PowerShell runtime guard is Windows-only")
@pytest.mark.parametrize(
    ("node_version", "expected_exit", "expect_npx"),
    [("v20.20.2", 0, True), ("v24.0.0", 1, False)],
)
def test_verify_e2e_requires_node_20_before_playwright(
    tmp_path: Path,
    node_version: str,
    expected_exit: int,
    expect_npx: bool,
) -> None:
    powershell = shutil.which("powershell.exe")
    assert powershell is not None
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    marker = tmp_path / "npx-called.txt"
    _write_fake_command(fake_bin / "node.cmd", f"echo {node_version}\r\nexit /b 0\r\n")
    _write_fake_command(
        fake_bin / "npx.cmd",
        f"> \"{marker}\" echo called\r\nexit /b 0\r\n",
    )
    env = os.environ.copy()
    env["PATH"] = str(fake_bin) + os.pathsep + env["PATH"]

    result = subprocess.run(
        [
            powershell,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(VERIFY_E2E),
        ],
        cwd=ROOT,
        env=env,
        capture_output=True,
        timeout=30,
        check=False,
    )

    output = (result.stdout + result.stderr).decode("utf-8", errors="replace")
    assert result.returncode == expected_exit, output
    assert marker.exists() is expect_npx
    if not expect_npx:
        assert "Node.js 20" in output


def test_verify_local_include_e2e_uses_the_runtime_guard() -> None:
    script = VERIFY_LOCAL.read_text(encoding="utf-8-sig")
    include_e2e_block = script[script.index("if ($IncludeE2E)") :]

    assert "verify_e2e.ps1" in script
    assert "$VerifyE2EScript" in include_e2e_block
    assert "npx playwright test" not in include_e2e_block
