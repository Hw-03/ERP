"""Prepare a locked frontend outside the employee tree and journal its later switch."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import uuid

SOURCE_EXCLUDED_DIRS = frozenset({"node_modules", ".next", ".next-prod", ".git", ".venv", "__pycache__", "_archive", "_backup", "logs", "data", "coverage", "test-results", ".pytest_cache", ".ruff_cache"})
SOURCE_EXCLUDED_FILES = frozenset({"next-env.d.ts", "tsconfig.tsbuildinfo", ".npmrc"})
BUILD_ENV = {"BACKEND_INTERNAL_URL": "http://localhost:8010", "NEXT_PUBLIC_API_URL": "", "NEXT_PUBLIC_MES_ENV": "employee", "NEXT_TELEMETRY_DISABLED": "1"}
PACKAGES = ("next", "react", "react-dom")


class ReleaseError(RuntimeError):
    """A failed prerequisite or switch must stop the deployment."""


def _physical(path: Path) -> Path:
    """Reject junctions even when the link is the supplied root or its ancestor."""
    absolute = path.absolute()
    for current in (absolute, *absolute.parents):
        if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()):
            raise ReleaseError(f"Linked deployment path is not allowed: {current}")
    return absolute


def _inside(path: Path, root: Path) -> Path:
    """Require a real descendant, including existing parent junction checks."""
    absolute = path.absolute()
    resolved_root = _physical(root).resolve()
    if absolute.resolve() == resolved_root or not absolute.resolve().is_relative_to(resolved_root):
        raise ReleaseError(f"Path is outside its expected root: {path}")
    current = absolute
    while current != root.absolute():
        if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()):
            raise ReleaseError(f"Linked deployment path is not allowed: {current}")
        if current.parent == current:
            raise ReleaseError("Deployment path has no expected parent")
        current = current.parent
    return absolute


def _excluded(name: str) -> bool:
    lowered = name.lower()
    return (name in SOURCE_EXCLUDED_FILES or lowered.startswith((".env", ".testmondata"))
            or ".db" in lowered or ".sqlite" in lowered or lowered.endswith(".pyc"))


def files(root: Path, *, source: bool = False) -> dict[str, str]:
    """Hash copied bytes, rejecting links and omitting only local source artifacts."""
    root = _physical(root)
    result: dict[str, str] = {}
    if not root.is_dir():
        raise ReleaseError(f"Required directory is missing: {root}")
    pending = [root]
    while pending:
        with os.scandir(pending.pop()) as entries:
            for entry in entries:
                directory = entry.is_dir(follow_symlinks=False)
                if source and ((directory and entry.name in SOURCE_EXCLUDED_DIRS) or
                               (not directory and _excluded(entry.name))):
                    continue
                # DirEntry reuses enumeration metadata on Windows. Reject all
                # reparse points without resolving every ancestor per package file.
                attributes = getattr(entry.stat(follow_symlinks=False), "st_file_attributes", 0)
                if entry.is_symlink() or attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0):
                    raise ReleaseError(f"Linked deployment path is not allowed: {entry.path}")
                path = Path(entry.path)
                if directory:
                    pending.append(path)
                else:
                    with path.open("rb") as stream:
                        result[path.relative_to(root).as_posix()] = hashlib.file_digest(stream, "sha256").hexdigest()
    return dict(sorted(result.items()))


def _digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _json(path: Path, value: object) -> None:
    """Publish receipts atomically, never exposing a half-written READY marker."""
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def node_version(node: Path) -> str:
    """Read the explicitly selected executable without consulting the shell PATH."""
    result = subprocess.run([str(node), "--version"], capture_output=True, text=True, check=False,
                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    if result.returncode:
        raise ReleaseError("Cannot determine the selected Node version")
    return result.stdout.strip()


def _toolchain(node: Path) -> dict:
    if not node.is_absolute() or not node.is_file():
        raise ReleaseError("Node 20 must have an existing absolute executable path")
    version = node_version(node)
    if not re.fullmatch(r"v20\.\d+\.\d+", version):
        raise ReleaseError(f"Node 20 is required; selected version is {version}")
    for relative in ("npm.cmd", "node_modules/npm/bin/npm-cli.js"):
        if not (node.parent / relative).is_file():
            raise ReleaseError("Node and npm must come from the same complete toolchain")
    return {"version": version, "files": files(node.parent)}


def run_command(argv: list[str], cwd: Path, environment: dict[str, str], log: Path) -> None:
    """Keep dependency/build output local; report only the failed log path."""
    with log.open("w", encoding="utf-8") as output:
        result = subprocess.run(argv, cwd=cwd, env=environment, stdout=output, stderr=subprocess.STDOUT,
                                check=False, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    if result.returncode:
        raise ReleaseError(f"Command exited {result.returncode}; see {log}")


def _copy_files(source: Path, destination: Path, manifest: dict[str, str]) -> None:
    _physical(destination)
    destination.mkdir(parents=True, exist_ok=True)
    for relative in manifest:
        target = _inside(destination / relative, destination)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(_inside(source / relative, source), target)
        if hashlib.sha256(target.read_bytes()).hexdigest() != manifest[relative]:
            raise ReleaseError(f"Deployment copy verification failed: {relative}")


def prepare(source: Path, runtime: Path, node: Path) -> Path:
    """Install and build only in development staging; a cache must pass fresh hashes."""
    source, runtime, node = _physical(source), _physical(runtime), _physical(node)
    if runtime.is_relative_to(source) or source.is_relative_to(runtime):
        raise ReleaseError("Preparation must be separate from the active frontend")
    toolchain = _toolchain(node)
    source_files = files(source, source=True)
    if not {"package.json", "package-lock.json"}.issubset(source_files):
        raise ReleaseError("Both package manifest and lockfile are required")
    key = _digest({"source": source_files, "toolchain": toolchain, "environment": BUILD_ENV,
                   "preparation_tool": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()})
    runtime.mkdir(parents=True, exist_ok=True)
    release = _inside(runtime / key, runtime)
    if (release / "receipt.json").is_file():
        try:
            verify(release, source, node)
            return release
        except (ReleaseError, OSError, ValueError, KeyError):
            release.rename(_inside(runtime / (key + ".invalid-" + uuid.uuid4().hex), runtime))
    elif release.exists():
        release.rename(_inside(runtime / (key + ".incomplete-" + uuid.uuid4().hex), runtime))
    release.mkdir()
    frontend = release / "frontend"
    _copy_files(source, frontend, source_files)
    environment = os.environ.copy()
    for name in tuple(environment):
        if name.startswith(("NEXT_PUBLIC_", "MES_PROXY_")) or name in {"NODE_ENV", "NODE_OPTIONS", "DATABASE_URL"}:
            environment.pop(name)
    environment.update(BUILD_ENV)
    environment["PATH"] = str(node.parent) + os.pathsep + environment.get("PATH", "")
    environment["MES_RUNTIME_ROOT"] = str(release / "runtime")
    npm = [str(node), str(node.parent / "node_modules/npm/bin/npm-cli.js")]
    for label, arguments in (
        ("install", ["ci", "--cache", str(runtime / "npm-cache"), "--no-audit", "--no-fund"]),
        ("build", ["run", "build"]),
        ("bundle", ["run", "check:bundle-size"]),
    ):
        print(f"FRONTEND_PREPARE_STAGE={label}", flush=True)
        run_command(npm + arguments, frontend, environment, release / (label + ".log"))
    if not (frontend / ".next-prod/BUILD_ID").is_file():
        raise ReleaseError("Production BUILD_ID is missing")
    locked = json.loads((frontend / "package-lock.json").read_text(encoding="utf-8"))["packages"]
    installed = {}
    for package in PACKAGES:
        installed[package] = json.loads((frontend / "node_modules" / package / "package.json").read_text(encoding="utf-8"))["version"]
        if installed[package] != locked["node_modules/" + package]["version"]:
            raise ReleaseError(f"Installed {package} does not match the lockfile")
    if files(source, source=True) != source_files:
        raise ReleaseError("Frontend source changed during preparation")
    _json(release / "receipt.json", {"status": "READY", "prepared_at": datetime.now(timezone.utc).isoformat(),
          "source": source_files, "toolchain": toolchain, "environment": BUILD_ENV, "installed": installed,
          "artifacts": files(frontend)})
    return release


def verify(release: Path, source: Path, node: Path) -> dict:
    """Do not deploy an altered cache or bytes different from the verified source."""
    receipt = json.loads((release / "receipt.json").read_text(encoding="utf-8"))
    if receipt.get("status") != "READY" or receipt["environment"] != BUILD_ENV:
        raise ReleaseError("Release is not ready for the employee environment")
    if receipt["source"] != files(source, source=True):
        raise ReleaseError("Frontend source no longer matches the prepared release")
    if receipt["toolchain"] != _toolchain(node):
        raise ReleaseError("Prepared Node toolchain changed")
    if receipt["artifacts"] != files(release / "frontend"):
        raise ReleaseError("Prepared frontend artifact changed")
    return receipt


def _code_files(root: Path) -> dict:
    """Pin backend and deployment scripts while excluding runtime data and secrets."""
    result = {name: files(root / name, source=True) for name in ("backend", "scripts")}
    result["root"] = {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                      for name in ("start.bat", "watch.bat", "stop.bat", "status.bat") if (root / name).is_file()}
    return result


def snapshot_code(root: Path, runtime: Path) -> Path:
    """Record exactly which backend and scripts the snapshot verification will use."""
    manifest = _code_files(root)
    _physical(runtime).mkdir(parents=True, exist_ok=True)
    record = _inside(runtime / ("code-" + _digest(manifest) + ".json"), runtime)
    _json(record, manifest)
    return record


def verify_code(root: Path, record: Path) -> None:
    """A source change before shutdown or migration invalidates earlier verification."""
    if _code_files(root) != json.loads(record.read_text(encoding="utf-8")):
        raise ReleaseError("Backend or deployment source changed during preparation")


def assert_no_pending(employee: Path) -> None:
    """An unfinished previous deployment requires recovery, including NO_CHANGES runs."""
    for record in (employee / "_attic/runtime/frontend-releases").glob("*/journal.json"):
        phase = json.loads(record.read_text(encoding="utf-8"))["phase"]
        if phase not in {"CONFIRMED", "ROLLED_BACK"}:
            raise ReleaseError(f"Previous deployment needs recovery: {record}")


def install_preflight(release: Path, source: Path, node: Path, employee: Path, required_files: list[str]) -> dict:
    """Check all install prerequisites without creating files in the employee tree."""
    receipt = verify(release, source, node)
    employee = _physical(employee)
    files(employee / "frontend")
    assert_no_pending(employee)
    for relative in required_files:
        path = _inside(source.parent / relative, source.parent)
        if not path.is_file():
            raise ReleaseError(f"Missing required deployment source: {relative}")
        with path.open("rb") as stream:
            stream.read(1)
    tool_directory = _inside(employee / "_attic/runtime/tools" / (
        "node-" + receipt["toolchain"]["version"] + "-" + _digest(receipt["toolchain"])[:12]), employee)
    if tool_directory.exists() and files(tool_directory) != receipt["toolchain"]["files"]:
        raise ReleaseError("Existing pinned employee Node toolchain is inconsistent")
    return receipt


def install(release: Path, source: Path, node: Path, employee: Path) -> Path:
    """Called only after approved shutdown; keep the entire previous frontend intact."""
    receipt = install_preflight(release, source, node, employee, [])
    employee = _physical(employee)
    if employee == source.parent.resolve() or employee.is_relative_to(release.resolve()):
        raise ReleaseError("Employee deployment must be separate from preparation")
    assert_no_pending(employee)
    runtime = employee / "_attic/runtime"
    recovery = _inside(runtime / "frontend-releases" / uuid.uuid4().hex, employee)
    recovery.mkdir(parents=True)
    record = recovery / "journal.json"
    config = runtime / "frontend-node-path.txt"
    journal = {"employee_root": str(employee), "phase": "PREPARING", "config_existed": config.is_file(),
               "config_hash": hashlib.sha256(config.read_bytes()).hexdigest() if config.is_file() else None,
               "frontend_moved": False, "code_backups": {}}
    _json(record, journal)
    print(f"FRONTEND_ROLLBACK_RECORD={record}", flush=True)
    try:
        if config.is_file():
            shutil.copy2(config, recovery / "old-node-path.txt")
            if config.read_bytes() != (recovery / "old-node-path.txt").read_bytes():
                raise ReleaseError("Previous Node setting backup copy verification failed")
        for name in ("scripts", "backend"):
            old = employee / name
            journal["code_backups"][name] = {}
            if old.is_dir():
                manifest = files(old, source=True)
                _copy_files(old, recovery / ("old-" + name), manifest)
                journal["code_backups"][name] = manifest
        journal["root_files"] = {}
        for name in ("start.bat", "watch.bat", "stop.bat", "status.bat"):
            journal["root_files"][name] = None
            if (employee / name).is_file():
                digest = hashlib.sha256((employee / name).read_bytes()).hexdigest()
                _copy_files(employee, recovery, {name: digest})
                journal["root_files"][name] = digest
        journal["old_frontend"] = files(employee / "frontend")
        incoming = recovery / "incoming-frontend"
        shutil.copytree(release / "frontend", incoming)
        # Operational configuration belongs to the employee installation, never to dev.
        for old in (employee / "frontend").iterdir():
            _inside(old, employee)
            if old.name.startswith(".env") and old.is_file():
                shutil.copy2(old, incoming / old.name)
            elif old.name in {"logs", "_archive"} and old.is_dir():
                shutil.copytree(old, incoming / old.name, dirs_exist_ok=True)
        tool_directory = runtime / "tools" / ("node-" + receipt["toolchain"]["version"] + "-" + _digest(receipt["toolchain"])[:12])
        _inside(tool_directory, employee)
        if tool_directory.exists():
            if files(tool_directory) != receipt["toolchain"]["files"]:
                raise ReleaseError("Existing pinned employee Node toolchain is inconsistent")
        else:
            shutil.copytree(node.parent, tool_directory)
        if files(tool_directory) != receipt["toolchain"]["files"]:
            raise ReleaseError("Employee Node toolchain copy failed verification")
        journal["phase"] = "BACKED_UP"
        _json(record, journal)
        (employee / "frontend").rename(recovery / "old-frontend")
        journal["frontend_moved"] = True
        _json(record, journal)
        incoming.rename(employee / "frontend")
        config.write_text(str(tool_directory / node.name) + "\n", encoding="utf-8")
        journal["phase"] = "INSTALLED"
        _json(record, journal)
        return record
    except Exception:
        rollback(record, employee)
        raise


def rollback(record: Path, employee: Path) -> None:
    """Restore only pre-migration code/configuration; never attach or restore the DB."""
    record = _inside(record, employee / "_attic/runtime/frontend-releases")
    journal = json.loads(record.read_text(encoding="utf-8"))
    if Path(journal["employee_root"]).resolve() != employee.resolve():
        raise ReleaseError("Rollback record belongs to another employee root")
    if journal["phase"] == "ROLLED_BACK":
        return
    if journal["phase"] in {"MIGRATING", "CONFIRMED"}:
        raise ReleaseError("Automatic rollback is not allowed after the migration boundary")
    recovery = record.parent
    previous = recovery / "old-frontend"
    if previous.is_dir():
        if (employee / "frontend").exists():
            (employee / "frontend").rename(recovery / ("failed-frontend-" + uuid.uuid4().hex))
        previous.rename(employee / "frontend")
    if "old_frontend" in journal and files(employee / "frontend") != journal["old_frontend"]:
        raise ReleaseError("Previous frontend restoration failed verification")
    for name, manifest in journal.get("code_backups", {}).items():
        target = _inside(employee / name, employee)
        current = files(target, source=True) if target.is_dir() else {}
        for relative in set(current) - set(manifest):
            _inside(target / relative, target).unlink()
        _copy_files(recovery / ("old-" + name), target, manifest)
        if files(target, source=True) != manifest:
            raise ReleaseError(f"Previous {name} restoration failed verification")
    for name, digest in journal.get("root_files", {}).items():
        if digest is None:
            _inside(employee / name, employee).unlink(missing_ok=True)
        else:
            _copy_files(recovery, employee, {name: digest})
    config = _inside(employee / "_attic/runtime/frontend-node-path.txt", employee)
    if journal["config_existed"] and (recovery / "old-node-path.txt").is_file():
        if hashlib.sha256((recovery / "old-node-path.txt").read_bytes()).hexdigest() != journal["config_hash"]:
            raise ReleaseError("Previous Node setting backup is corrupt")
        shutil.copy2(recovery / "old-node-path.txt", config)
        if config.read_bytes() != (recovery / "old-node-path.txt").read_bytes():
            raise ReleaseError("Previous Node setting restoration failed verification")
    elif not journal["config_existed"]:
        config.unlink(missing_ok=True)
    if journal["config_existed"] and (
        not config.is_file() or hashlib.sha256(config.read_bytes()).hexdigest() != journal["config_hash"]
    ):
        raise ReleaseError("Previous Node setting restoration failed verification")
    journal["phase"] = "ROLLED_BACK"
    _json(record, journal)


def mark(record: Path, employee: Path, phase: str) -> None:
    """Persist the irreversible boundary before invoking any database migration."""
    record = _inside(record, employee / "_attic/runtime/frontend-releases")
    journal = json.loads(record.read_text(encoding="utf-8"))
    if Path(journal["employee_root"]).resolve() != employee.resolve():
        raise ReleaseError("Release record belongs to another employee root")
    expected = "INSTALLED" if phase == "MIGRATING" else "MIGRATING"
    if journal["phase"] != expected:
        raise ReleaseError(f"Cannot advance release from {journal['phase']} to {phase}")
    journal["phase"] = phase
    _json(record, journal)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "verify", "install", "rollback", "migrating", "confirm", "check-pending", "snapshot-code", "verify-code", "install-preflight"))
    parser.add_argument("--source", type=Path)
    parser.add_argument("--runtime", type=Path)
    parser.add_argument("--node", type=Path)
    parser.add_argument("--release", type=Path)
    parser.add_argument("--employee-root", type=Path)
    parser.add_argument("--record", type=Path)
    parser.add_argument("--required-file", action="append", default=[])
    args = parser.parse_args()
    try:
        if args.command == "prepare":
            release = prepare(args.source, args.runtime, args.node)
            print(f"FRONTEND_PREPARED_RELEASE={release}\nFRONTEND_PREPARE_RESULT=READY")
        elif args.command == "verify":
            verify(args.release, args.source, args.node)
        elif args.command == "install":
            install(args.release, args.source, args.node, args.employee_root)
        elif args.command == "install-preflight":
            install_preflight(args.release, args.source, args.node, args.employee_root, args.required_file)
        elif args.command == "rollback":
            rollback(args.record, args.employee_root)
        elif args.command == "check-pending":
            assert_no_pending(args.employee_root)
        elif args.command == "snapshot-code":
            print(f"SYNC_CODE_MANIFEST={snapshot_code(args.source, args.runtime)}")
        elif args.command == "verify-code":
            verify_code(args.source, args.record)
        else:
            mark(args.record, args.employee_root, "MIGRATING" if args.command == "migrating" else "CONFIRMED")
    except (ReleaseError, OSError, ValueError, KeyError) as error:
        print(f"FRONTEND_PREPARE_RESULT=BLOCKED\nFRONTEND_PREPARE_ERROR={error}", file=sys.stderr)
        return 9
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
