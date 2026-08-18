"""Execution-contract tests for documentation gates in verify_local.ps1."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


REPO_ROOT = Path(__file__).resolve().parents[3]
VERIFY_LOCAL = REPO_ROOT / "scripts" / "dev" / "verify_local.ps1"


class VerifyLocalDocsScopeTests(unittest.TestCase):
    """Run auto mode with fake commands so scope decisions stay observable."""

    def run_auto_mode(self, changed_paths: list[str]) -> list[str]:
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_root = Path(temporary_directory)
            command_directory = temporary_root / "commands"
            command_directory.mkdir()
            process_temp_directory = temporary_root / "process-temp"
            process_temp_directory.mkdir()
            status_file = temporary_root / "git-status.txt"
            command_log = temporary_root / "commands.log"
            status_file.write_text(
                "".join(f" M {path}\n" for path in changed_paths), encoding="ascii"
            )

            self.write_fake_commands(command_directory)
            environment = os.environ.copy()
            environment.update(
                {
                    "PATH": f"{command_directory}{os.pathsep}{environment['PATH']}",
                    "FAKE_REPO_ROOT": str(REPO_ROOT),
                    "FAKE_GIT_STATUS": str(status_file),
                    "FAKE_COMMAND_LOG": str(command_log),
                    "FAKE_TEST_TEMP": str(process_temp_directory),
                    "TEMP": str(process_temp_directory),
                    "TMP": str(process_temp_directory),
                }
            )

            result = subprocess.run(
                [
                    "powershell.exe",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(VERIFY_LOCAL),
                    "-Mode",
                    "auto",
                ],
                cwd=REPO_ROOT,
                env=environment,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
            self.assertEqual(
                result.returncode,
                0,
                f"verify_local failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}",
            )
            commands = command_log.read_text(encoding="utf-8").splitlines()
            temporary_artifacts = sorted(
                path for path in process_temp_directory.rglob("*") if path.is_file()
            )
            self.assertTrue(
                all(
                    artifact.resolve().is_relative_to(temporary_root.resolve())
                    for artifact in temporary_artifacts
                ),
                temporary_artifacts,
            )
            openapi_capture_runs = [
                command for command in commands if command.startswith("python:- ")
            ]
            if openapi_capture_runs:
                self.assertEqual(
                    temporary_artifacts,
                    [process_temp_directory / "openapi-current.json"],
                )
            else:
                self.assertEqual(temporary_artifacts, [])

        self.assertFalse(temporary_root.exists())
        return commands

    def write_fake_commands(self, command_directory: Path) -> None:
        """Create PATH shims that record gates without invoking real toolchains."""
        (command_directory / "git.cmd").write_text(
            """@echo off
if /I \"%1\"==\"rev-parse\" (
  echo %FAKE_REPO_ROOT%
  exit /b 0
)
if /I \"%1\"==\"-C\" if /I \"%3\"==\"status\" (
  type \"%FAKE_GIT_STATUS%\"
  exit /b 0
)
if /I \"%1\"==\"status\" (
  type \"%FAKE_GIT_STATUS%\"
  exit /b 0
)
exit /b 0
""",
            encoding="ascii",
        )
        (command_directory / "python.cmd").write_text(
            """@echo off
echo python:%*>> \"%FAKE_COMMAND_LOG%\"
if \"%1\"==\"-\" (
  if /I \"%2\"==\"%FAKE_TEST_TEMP%\\openapi-current.json\" (
    type \"%FAKE_REPO_ROOT%\\_dev\\baselines\\openapi.json\" > \"%2\"
    exit /b 0
  )
  echo Unexpected OpenAPI temporary path: %2 1>&2
  exit /b 91
)
exit /b 0
""",
            encoding="ascii",
        )
        for command in ("npm", "npx"):
            (command_directory / f"{command}.cmd").write_text(
                f"@echo off\necho {command}:%*>> \"%FAKE_COMMAND_LOG%\"\nexit /b 0\n",
                encoding="ascii",
            )

    def assert_docs_gates_once(self, commands: list[str]) -> None:
        docs_unit_tests = [
            command
            for command in commands
            if command.startswith("python:-m unittest ")
            and "scripts.dev.tests.test_check_markdown_links" in command
            and "scripts.dev.tests.test_verify_local_docs_scope" in command
        ]
        checker_runs = [
            command
            for command in commands
            if command.startswith("python:scripts/dev/check_markdown_links.py ")
        ]
        self.assertEqual(len(docs_unit_tests), 1, commands)
        self.assertEqual(len(checker_runs), 1, commands)

    def assert_docs_gates_absent(self, commands: list[str]) -> None:
        self.assertFalse(
            any(
                command.startswith("python:-m unittest ")
                and "scripts.dev.tests.test_check_markdown_links" in command
                for command in commands
            ),
            commands,
        )
        self.assertFalse(
            any(
                command.startswith("python:scripts/dev/check_markdown_links.py ")
                for command in commands
            ),
            commands,
        )

    def test_auto_runs_docs_gates_once_for_docs_and_frontend_changes(self) -> None:
        commands = self.run_auto_mode(["README.md", "frontend/app/page.tsx"])

        self.assert_docs_gates_once(commands)
        self.assertIn("npm:run lint:strict", commands)

    def test_auto_runs_docs_gates_once_for_docs_and_backend_changes(self) -> None:
        commands = self.run_auto_mode(["README.md", "backend/app/main.py"])

        self.assert_docs_gates_once(commands)
        self.assertIn("python:-m pytest -q", commands)

    def test_auto_runs_docs_gates_once_for_docs_and_infrastructure_changes(self) -> None:
        commands = self.run_auto_mode(["README.md", "scripts/dev/example.py"])

        self.assert_docs_gates_once(commands)
        self.assertIn("npm:run lint:strict", commands)
        self.assertIn("python:-m pytest -q", commands)

    def test_auto_skips_docs_gates_for_pure_infrastructure_changes(self) -> None:
        commands = self.run_auto_mode(["scripts/dev/example.py"])

        self.assert_docs_gates_absent(commands)
        self.assertIn("npm:run lint:strict", commands)
        self.assertIn("python:-m pytest -q", commands)


if __name__ == "__main__":
    unittest.main()
