"""Record an allowlisted execution environment and enforce the approved CI versions."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import subprocess
import sys


def version(command: list[str], cwd: Path | None = None) -> str:
    return subprocess.check_output(command, cwd=cwd, text=True).strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    frontend = args.source / "frontend"
    browser_data = json.loads((frontend / "node_modules/playwright-core/browsers.json").read_text())
    chromium = next(row for row in browser_data["browsers"] if row["name"] == "chromium")
    headless = next(row for row in browser_data["browsers"] if row["name"] == "chromium-headless-shell")
    playwright = json.loads((frontend / "node_modules/@playwright/test/package.json").read_text())["version"]
    node = version(["node", "--version"])
    python = platform.python_version()
    dependencies = {row.metadata["Name"]: row.version for row in importlib.metadata.distributions()}
    required = {"certifi": "2026.7.22", "portalocker": "4.4.0", "SQLAlchemy": "2.0.54"}
    actual = {name: importlib.metadata.version(name) for name in required}
    os_release = platform.freedesktop_os_release()
    executable = version(["node", "-e", "process.stdout.write(require('playwright').chromium.executablePath())"], frontend)
    metadata = {
        "python": python, "python_executable": sys.executable, "node": node,
        "npm": version(["npm", "--version"]), "playwright": playwright,
        "chromium": chromium, "chromium_headless_shell": headless,
        "chromium_executable": executable, "chromium_version": version([executable, "--version"]),
        "os": {key: os_release.get(key) for key in ("ID", "VERSION_ID", "PRETTY_NAME")},
        "kernel": platform.release(), "architecture": platform.machine(), "cpu_count": os.cpu_count(),
        "pinned_ci_differences": actual, "python_distributions": dict(sorted(dependencies.items())),
        "environment": {key: os.environ.get(key) for key in ("CI", "APP_ENV", "REQUIRE_POSTGRES", "NEXT_TELEMETRY_DISABLED", "PLAYWRIGHT_BROWSERS_PATH")},
        "trigger_sha": os.environ.get("GITHUB_SHA"), "trigger_ref": os.environ.get("GITHUB_REF"),
    }
    problems = []
    if (python, node, playwright) != ("3.11.17", "v20.20.2", "1.60.0"):
        problems.append("Python/Node/Playwright version mismatch")
    if str(chromium["revision"]) != "1223" or str(headless["revision"]) != "1223":
        problems.append("Chromium revision differs from 1223")
    if actual != required:
        problems.append("approved CI dependency pins differ")
    if (os_release.get("ID"), os_release.get("VERSION_ID")) != ("ubuntu", "24.04"):
        problems.append("expected Ubuntu 24.04")
    metadata["version_guard_passed"], metadata["problems"] = not problems, problems
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    if problems:
        raise ValueError("; ".join(problems))


if __name__ == "__main__":
    main()
