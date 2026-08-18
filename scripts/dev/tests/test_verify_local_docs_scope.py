"""Execution-contract tests for documentation gates in verify_local.ps1."""

from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


REPO_ROOT = Path(__file__).resolve().parents[3]
VERIFY_LOCAL = REPO_ROOT / "scripts" / "dev" / "verify_local.ps1"
VERIFICATION_POLICY = REPO_ROOT / "scripts" / "dev" / "verification_policy.py"


class VerifyLocalDocsScopeTests(unittest.TestCase):
    """Run auto mode in an isolated Git repository with recorded gate commands."""

    def run_auto_mode(self, changed_paths: list[str]) -> list[str]:
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_root = Path(temporary_directory)
            repo = temporary_root / "repo"
            command_directory = temporary_root / "commands"
            process_temp_directory = temporary_root / "process-temp"
            command_log = temporary_root / "commands.log"
            repo.mkdir()
            command_directory.mkdir()
            process_temp_directory.mkdir()

            self.prepare_repository(repo, changed_paths)
            self.write_fake_commands(command_directory)
            environment = os.environ.copy()
            environment.update(
                {
                    "PATH": f"{command_directory}{os.pathsep}{environment['PATH']}",
                    "FAKE_REPO_ROOT": str(repo),
                    "FAKE_COMMAND_LOG": str(command_log),
                    "TEMP": str(process_temp_directory),
                    "TMP": str(process_temp_directory),
                    "DEXCOWIN_VERIFY_PARALLEL_CPU_THRESHOLD": "999",
                }
            )

            result = subprocess.run(
                [
                    "powershell.exe",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(repo / "scripts" / "dev" / "verify_local.ps1"),
                    "-Mode",
                    "auto",
                ],
                cwd=repo,
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
            self.assertEqual(temporary_artifacts, [])

        self.assertFalse(temporary_root.exists())
        return commands

    def prepare_repository(self, repo: Path, changed_paths: list[str]) -> None:
        """Create a real Git change set while keeping all heavy gates mocked."""
        script_dir = repo / "scripts" / "dev"
        script_dir.mkdir(parents=True)
        shutil.copy2(VERIFY_LOCAL, script_dir / VERIFY_LOCAL.name)
        shutil.copy2(VERIFICATION_POLICY, script_dir / VERIFICATION_POLICY.name)
        (repo / "backend").mkdir()
        (repo / "frontend").mkdir()
        baseline = repo / "_dev" / "baselines" / "openapi.json"
        baseline.parent.mkdir(parents=True)
        baseline.write_bytes(b"{}\r\n")

        for relative_path in changed_paths:
            target = repo / relative_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("baseline\n", encoding="utf-8")

        self.git(repo, "init", "-q")
        self.git(repo, "config", "user.email", "test@example.com")
        self.git(repo, "config", "user.name", "Verification Test")
        self.git(repo, "add", ".")
        self.git(repo, "commit", "-qm", "baseline")

        for relative_path in changed_paths:
            (repo / relative_path).write_text("changed\n", encoding="utf-8")

    def git(self, repo: Path, *args: str) -> None:
        subprocess.run(
            ["git", "-C", str(repo), *args],
            check=True,
            capture_output=True,
        )

    def write_fake_commands(self, command_directory: Path) -> None:
        """Record gates while allowing the real policy process to inspect Git."""
        (command_directory / "python.cmd").write_text(
            f"""@echo off
if /I \"%~nx1\"==\"verification_policy.py\" (
  \"{sys.executable}\" %*
  exit /b %ERRORLEVEL%
)
echo python:%*>> \"%FAKE_COMMAND_LOG%\"
if \"%1\"==\"-\" (
  type \"%FAKE_REPO_ROOT%\\_dev\\baselines\\openapi.json\" > \"%2\"
  exit /b 0
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
        self.assertTrue(
            any(command.startswith("python:-m pytest -q") for command in commands),
            commands,
        )

    def test_auto_runs_docs_gates_once_for_docs_and_infrastructure_changes(self) -> None:
        commands = self.run_auto_mode(["README.md", "scripts/dev/example.py"])

        self.assert_docs_gates_once(commands)
        self.assertIn("npm:run lint:strict", commands)
        self.assertTrue(
            any(command.startswith("python:-m pytest -q") for command in commands),
            commands,
        )

    def test_auto_skips_docs_gates_for_pure_infrastructure_changes(self) -> None:
        commands = self.run_auto_mode(["scripts/dev/example.py"])

        self.assert_docs_gates_absent(commands)
        self.assertIn("npm:run lint:strict", commands)
        self.assertTrue(
            any(command.startswith("python:-m pytest -q") for command in commands),
            commands,
        )


if __name__ == "__main__":
    unittest.main()
