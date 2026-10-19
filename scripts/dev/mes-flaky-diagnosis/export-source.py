"""Export an immutable CI checkout to runner.temp, then instrument only that copy."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any


BRANCH = "refs/heads/codex/mes-main-candidate-comparison-20261016"
MARKER = "[mes-flaky-diagnostic]"
HERE = Path(__file__).resolve().parent


def ci_guard() -> None:
    """Match the workflow's exact branch and explicit push marker at runtime too."""
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("CI") != "true":
        raise ValueError("diagnostic export requires GitHub Actions")
    if os.environ.get("GITHUB_REF") != BRANCH:
        raise ValueError("diagnostic branch guard failed")
    event = os.environ.get("GITHUB_EVENT_NAME")
    if event == "workflow_dispatch":
        return
    if event != "push":
        raise ValueError("diagnostic event guard failed")
    payload = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    if MARKER not in (payload.get("head_commit") or {}).get("message", ""):
        raise ValueError("diagnostic commit marker missing")


def checked_root(root: Path, checkout: Path) -> Path:
    """Require a fresh runner.temp child outside the source checkout."""
    root, checkout = root.resolve(), checkout.resolve(strict=True)
    temporary = Path(os.environ["RUNNER_TEMP"]).resolve(strict=True)
    if root == temporary or not root.is_relative_to(temporary):
        raise ValueError("diagnostic root must be a child of RUNNER_TEMP")
    if root.is_relative_to(checkout) or checkout.is_relative_to(root):
        raise ValueError("diagnostic export and checkout must be separate")
    return root


def git(checkout: Path, *arguments: str) -> bytes:
    """Read the checkout; never stage, clean, reset, switch or commit it."""
    return subprocess.check_output(["git", "-C", str(checkout), *arguments])


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def source_path(root: Path, relative: str) -> Path:
    """Reject a manifest entry or link that could escape the declared source."""
    entry = Path(relative)
    candidate = root / entry
    if entry.is_absolute() or ".." in entry.parts or not candidate.resolve().is_relative_to(root.resolve()):
        raise ValueError("source path escaped its root")
    return candidate


def manifest(root: Path, paths: list[str]) -> dict[str, str]:
    """Track exact bytes for the declared source paths, excluding generated outputs."""
    result = {}
    for relative in paths:
        candidate = source_path(root, relative)
        result[relative] = digest(candidate)
    return result


def save(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")


def verify(checkout: Path, path: Path, output: Path) -> None:
    """Always leave a concrete receipt even when an unexpected source write occurred."""
    if output.resolve().is_relative_to(checkout.resolve()):
        raise ValueError("verification receipt must be outside checkout")
    before = json.loads(path.read_text(encoding="utf-8"))
    if Path(before["root"]).resolve() != checkout.resolve(strict=True):
        raise ValueError("source manifest root mismatch")
    changes = []
    for relative, expected in before["files"].items():
        candidate = source_path(checkout, relative)
        actual = digest(candidate) if candidate.is_file() else None
        if actual != expected:
            changes.append({"path": relative, "before": expected, "after": actual})
    save(output, {"unchanged": not changes, "changes": changes, "manifest": str(path)})
    if changes:
        raise ValueError("source hash guard found unexpected changes")


def prepare(checkout: Path, root: Path) -> None:
    ci_guard()
    checkout = checkout.resolve(strict=True)
    root = checked_root(root, checkout)
    if root.exists():
        raise ValueError("refusing to reuse an existing diagnostic directory")
    root.mkdir()
    artifacts, source = root / "artifacts", root / "source"
    artifacts.mkdir()
    commit = git(checkout, "rev-parse", "HEAD").decode().strip()
    if commit != os.environ.get("GITHUB_SHA"):
        raise ValueError("checkout SHA differs from the triggering SHA")
    subprocess.run(["git", "-C", str(checkout), "diff", "--quiet", "HEAD", "--"], check=True)
    paths = [value.decode("utf-8") for value in git(checkout, "ls-files", "-z").split(b"\0") if value]
    initial = manifest(checkout, paths)
    save(artifacts / "checkout-before.json", {"root": str(checkout), "commit": commit, "files": initial})
    source.mkdir()
    # Copy tracked files once, preserving checkout bytes. git archive does not preserve
    # eol=crlf checkout conversion, so comparing archive blobs to byte guards is unsafe.
    # Never copy ignored node_modules, venv, DB, caches or other runtime artifacts.
    for relative in paths:
        original, destination = checkout / relative, source / relative
        if original.is_symlink() or not original.is_file():
            raise ValueError("diagnostic export expects ordinary tracked files")
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(original, destination)
    if (source / ".git").exists() or (source / "backend/mes.db").exists():
        raise ValueError("export must have no Git checkout or real MES database")
    exported = manifest(source, paths)
    if exported != initial:
        raise ValueError("working-tree bytes do not match the immutable commit export")
    save(artifacts / "export-original.json", {"root": str(source), "commit": commit, "files": exported})
    save(source / ".mes-flaky-export.json", {"source": str(source), "checkout": str(checkout), "commit": commit})
    with (artifacts / "bom-patch.json").open("w", encoding="utf-8") as log:
        subprocess.run([sys.executable, str(HERE / "bom/apply-bom-diagnostics.py"), "--sourcecopy", str(source), "--apply"],
                       stdout=log, stderr=subprocess.STDOUT, check=True)
    setup = source / "frontend/tests/e2e/global-setup.ts"
    content = setup.read_text(encoding="utf-8")
    old = '      stdio: "ignore",'
    if content.count(old) != 1:
        raise ValueError("backend stdout/stderr capture anchor changed")
    # Bootstrap, original seed, flags and the original 30s health budget stay intact.
    content = content.replace(old,
        '      stdio: ["ignore", fs.openSync(path.join(process.env.MES_DIAG_OUTPUT!, "backend-stdout.log"), "a"), '
        'fs.openSync(path.join(process.env.MES_DIAG_OUTPUT!, "backend-stderr.log"), "a")],', 1)
    setup.write_text(content, encoding="utf-8", newline="\n")
    generated = {
        "frontend/mes-flaky-diagnosis.config.ts": (HERE / "diagnosis.config.ts").read_text(encoding="utf-8"),
        "frontend/tests/e2e/mes-flaky-preflight.spec.ts": (HERE / "preflight.spec.ts").read_text(encoding="utf-8"),
        "frontend/tests/e2e/000-mes-flaky-items.spec.ts": (HERE / "items-preseed.spec.ts").read_text(encoding="utf-8"),
    }
    for relative, value in generated.items():
        destination = source / relative
        if destination.exists():
            raise ValueError("generated diagnostic path already exists")
        destination.write_text(value, encoding="utf-8", newline="\n")
    observed_paths = sorted(set(paths) | set(generated) | {
        "frontend/tests/e2e/_bom-diag-fixture.ts", "frontend/tests/e2e/_bom-diag-native.js"})
    save(artifacts / "export-instrumented.json", {"root": str(source), "commit": commit,
                                                  "files": manifest(source, observed_paths)})
    verify(checkout, artifacts / "checkout-before.json", artifacts / "checkout-after-export.json")
    print(json.dumps({"source": str(source), "artifacts": str(artifacts), "commit": commit,
                      "dependency_strategy": "install once in native export; no node_modules or venv copies"}))


def main() -> None:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    export = commands.add_parser("prepare")
    export.add_argument("--checkout", required=True, type=Path)
    export.add_argument("--root", required=True, type=Path)
    guard = commands.add_parser("verify")
    guard.add_argument("--checkout", required=True, type=Path)
    guard.add_argument("--manifest", required=True, type=Path)
    guard.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.command == "prepare":
        prepare(args.checkout, args.root)
    else:
        verify(args.checkout, args.manifest, args.output)


if __name__ == "__main__":
    main()
