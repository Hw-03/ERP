from __future__ import annotations

import codecs
import os
import socket
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


def _quote_powershell_literal(value: str) -> str:
    """Quote a value for a single-quoted PowerShell string literal."""

    return value.replace("'", "''")


def test_verify_e2e_has_utf8_bom_for_windows_powershell() -> None:
    assert VERIFY_E2E.read_bytes().startswith(codecs.BOM_UTF8)


@pytest.mark.skipif(sys.platform != "win32", reason="PowerShell runtime guard is Windows-only")
@pytest.mark.parametrize(
    ("node_version", "expected_exit", "expect_npm"),
    [("v20.20.2", 0, True), ("v24.0.0", 1, False)],
)
def test_verify_e2e_requires_node_20_before_playwright(
    tmp_path: Path,
    node_version: str,
    expected_exit: int,
    expect_npm: bool,
) -> None:
    powershell = shutil.which("powershell.exe")
    assert powershell is not None
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    marker = tmp_path / "npm-called.txt"
    _write_fake_command(fake_bin / "node.cmd", f"echo {node_version}\r\nexit /b 0\r\n")
    _write_fake_command(
        fake_bin / "npm.cmd",
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
    assert marker.exists() is expect_npm
    if not expect_npm:
        assert "Node.js 20" in output


def test_verify_local_include_e2e_uses_the_runtime_guard() -> None:
    script = VERIFY_LOCAL.read_text(encoding="utf-8-sig")
    include_e2e_block = script[script.index("if ($IncludeE2E)") :]

    assert "verify_e2e.ps1" in script
    assert "$VerifyE2EScript" in include_e2e_block
    assert "npx playwright test" not in include_e2e_block


@pytest.mark.skipif(sys.platform != "win32", reason="Port fallback is Windows-only")
@pytest.mark.parametrize("npm_exit_code", [0, 7])
def test_verify_e2e_falls_back_from_busy_port_and_restores_environment(
    tmp_path: Path,
    npm_exit_code: int,
) -> None:
    """Keep port fallback deterministic and restore the caller environment on every exit."""

    powershell = shutil.which("powershell.exe")
    assert powershell is not None
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    selected_port_marker = tmp_path / "selected-port.txt"
    restored_port_marker = tmp_path / "restored-port.txt"
    _write_fake_command(fake_bin / "node.cmd", "echo v20.19.0\r\nexit /b 0\r\n")
    _write_fake_command(
        fake_bin / "npm.cmd",
        f"> \"{selected_port_marker}\" echo %E2E_FRONTEND_PORT%\r\n"
        f"exit /b {npm_exit_code}\r\n",
    )

    listener: socket.socket | None = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
        listener.bind(("127.0.0.1", 3100))
        listener.listen(1)
    except OSError:
        listener.close()
        listener = None

    command = (
        "$env:E2E_FRONTEND_PORT = 'before-test'; "
        f"try {{ & '{_quote_powershell_literal(str(VERIFY_E2E))}' }} catch {{ }}; "
        "[System.IO.File]::WriteAllText("
        f"'{_quote_powershell_literal(str(restored_port_marker))}', "
        "[string]$env:E2E_FRONTEND_PORT); exit 0"
    )
    env = os.environ.copy()
    env["PATH"] = str(fake_bin) + os.pathsep + env["PATH"]
    try:
        result = subprocess.run(
            [
                powershell,
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                command,
            ],
            cwd=ROOT,
            env=env,
            capture_output=True,
            timeout=30,
            check=False,
        )
    finally:
        if listener is not None:
            listener.close()

    output = (result.stdout + result.stderr).decode("utf-8", errors="replace")
    assert result.returncode == 0, output
    selected_port = int(selected_port_marker.read_text(encoding="utf-8").strip())
    assert 3300 <= selected_port <= 3399
    assert restored_port_marker.read_text(encoding="utf-8") == "before-test"
