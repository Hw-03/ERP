"""Prepare a locked frontend outside the employee tree and journal its later switch."""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import sqlite3
import stat
import subprocess
import sys
import time
from urllib import error as urllib_error
from urllib import request as urllib_request
import uuid

SOURCE_EXCLUDED_DIRS = frozenset({"node_modules", ".next", ".next-prod", ".git", ".venv", "__pycache__", "_archive", "_backup", "logs", "data", "coverage", "test-results", ".pytest_cache", ".ruff_cache"})
SOURCE_EXCLUDED_FILES = frozenset({"next-env.d.ts", "tsconfig.tsbuildinfo", ".npmrc"})
BUILD_ENV = {"BACKEND_INTERNAL_URL": "http://localhost:8010", "NEXT_PUBLIC_API_URL": "", "NEXT_PUBLIC_MES_ENV": "employee", "NEXT_TELEMETRY_DISABLED": "1"}
PACKAGES = ("next", "react", "react-dom")
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
EMPLOYEE_RUNTIME_ROOT = Path(r"C:\ERP-dev")
EMPLOYEE_BACKEND_PORT = 8010
EMPLOYEE_FRONTEND_PORT = 3000
EMPLOYEE_PUBLIC_URL = "http://192.168.0.63:3000"
RUNTIME_SCRIPT_TIMEOUT_SECONDS = 300
ACTIVATION_HTTP_TIMEOUT_SECONDS = 15
STOP_RETRY_SECONDS = 5


class ReleaseError(RuntimeError):
    """A failed prerequisite or switch must stop the deployment."""


@dataclass(frozen=True)
class RuntimeProfile:
    """The one canonical employee runtime that activation is allowed to expose."""

    root: Path
    backend_port: int
    frontend_port: int
    public_url: str


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


def _bind_installed_frontend(employee: Path, prepared: dict[str, str]) -> dict[str, str]:
    """Bind every prepared artifact while allowing preserved employee-only files."""

    installed = files(employee / "frontend")
    if any(installed.get(relative) != digest for relative, digest in prepared.items()):
        raise ReleaseError("Installed Friday frontend changed from prepared release")
    return installed


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
        prepared_frontend = receipt.get("artifacts")
        if not isinstance(prepared_frontend, dict):
            raise ReleaseError("Prepared frontend artifact binding is invalid")
        journal["incoming_frontend"] = prepared_frontend
        journal["installed_frontend"] = _bind_installed_frontend(employee, prepared_frontend)
        config.write_text(str(tool_directory / node.name) + "\n", encoding="utf-8")
        journal["phase"] = "INSTALLED"
        _json(record, journal)
        return record
    except Exception:
        rollback(record, employee)
        raise


def install_code(source: Path, record: Path, employee: Path, source_record: Path) -> None:
    """Install pinned backend/scripts after their release backup, without touching data.

    This is a pre-migration operation. The existing public rollback restores all
    replaced code on failure; database cutover owns its separate recovery boundary.
    """
    source, employee = _physical(source).resolve(), _physical(employee).resolve()
    if source == employee or source.is_relative_to(employee) or employee.is_relative_to(source):
        raise ReleaseError("Code source and employee trees must be separate")
    record = _inside(record, employee / "_attic/runtime/frontend-releases")
    journal = json.loads(record.read_text(encoding="utf-8"))
    if Path(journal["employee_root"]).resolve() != employee or journal["phase"] != "INSTALLED":
        raise ReleaseError("Code installation requires the matching pre-migration release")
    if journal.get("code_installed"):
        raise ReleaseError("Code installation has already completed")
    verify_code(source, source_record)
    expected = _code_files(source)
    for name, digest in journal.get("root_files", {}).items():
        if name not in {"start.bat", "watch.bat", "stop.bat", "status.bat"}:
            raise ReleaseError("Unexpected launcher in release record")
        current = _inside(employee / name, employee)
        actual = hashlib.sha256(current.read_bytes()).hexdigest() if current.is_file() else None
        if actual != digest:
            raise ReleaseError("Employee launcher changed after release backup")
        if digest is not None and hashlib.sha256((record.parent / name).read_bytes()).hexdigest() != digest:
            raise ReleaseError("Employee launcher release backup is invalid")
    for name in ("backend", "scripts"):
        backup = journal["code_backups"][name]
        if files(employee / name, source=True) != backup:
            raise ReleaseError(f"Employee {name} changed after release backup")
        if files(record.parent / ("old-" + name), source=True) != backup:
            raise ReleaseError(f"Employee {name} release backup is invalid")
    journal["incoming_code"] = expected
    journal["code_install_started"] = True
    _json(record, journal)
    try:
        for name in ("backend", "scripts"):
            target = employee / name
            for relative in set(journal["code_backups"][name]) - set(expected[name]):
                old = _inside(target / relative, target)
                quarantine = _inside(record.parent / "superseded-code" / name / relative, record.parent)
                quarantine.parent.mkdir(parents=True, exist_ok=True)
                old.rename(quarantine)
            _copy_files(source / name, target, expected[name])
        old_roots = journal.get("root_files", {})
        for name in ("start.bat", "watch.bat", "stop.bat", "status.bat"):
            if name in expected["root"]:
                _copy_files(source, employee, {name: expected["root"][name]})
            elif old_roots.get(name) is not None:
                old = _inside(employee / name, employee)
                quarantine = record.parent / "superseded-code" / name
                quarantine.parent.mkdir(parents=True, exist_ok=True)
                old.rename(quarantine)
        verify_code(source, source_record)
        verify_code(employee, source_record)
        journal["code_installed"] = True
        _json(record, journal)
    except Exception:
        rollback(record, employee)
        raise


def begin_friday_cutover(
    record: Path, employee: Path, admission: Path, admission_sha256: str,
    candidate: Path, original: Path,
) -> None:
    """Bind the verified database transition to its installed code recovery record."""
    from scripts.ops.friday_profile_cutover import verify_admission

    employee = _physical(employee).resolve()
    record = _inside(record, employee / "_attic/runtime/frontend-releases")
    journal = json.loads(record.read_text(encoding="utf-8"))
    if (Path(journal["employee_root"]).resolve() != employee
            or journal["phase"] != "INSTALLED" or not journal.get("code_installed")):
        raise ReleaseError("Friday cutover requires the matching verified installed code")
    if _code_files(employee) != journal["incoming_code"]:
        raise ReleaseError("Installed code changed before Friday cutover")
    verify_admission(
        receipt_path=admission, expected_receipt_sha256=admission_sha256,
        candidate_path=candidate, original_path=original,
        target_path=employee / "backend/mes.db", friday_validator_root=employee,
    )
    journal["friday_cutover"] = {
        "admission": str(_physical(admission).resolve()),
        "admission_sha256": admission_sha256.lower(),
        "candidate": str(_physical(candidate).resolve()),
        "original": str(_physical(original).resolve()),
    }
    journal["phase"] = "MIGRATING"
    _json(record, journal)


def rollback(
    record: Path, employee: Path, *,
    recovery_receipt: Path | None = None, recovery_sha256: str | None = None,
) -> None:
    """Restore code before migration, or after independently verified DB recovery.

    This function never restores a database and refuses confirmed deployments.
    """
    record = _inside(record, employee / "_attic/runtime/frontend-releases")
    journal = json.loads(record.read_text(encoding="utf-8"))
    if Path(journal["employee_root"]).resolve() != employee.resolve():
        raise ReleaseError("Rollback record belongs to another employee root")
    if journal["phase"] == "ROLLED_BACK":
        return
    if journal["phase"] == "CONFIRMED":
        raise ReleaseError("Automatic rollback is not allowed after the migration boundary")
    if journal["phase"] == "MIGRATING":
        if not recovery_receipt or not recovery_sha256 or not journal.get("friday_cutover"):
            raise ReleaseError("Code rollback requires verified Friday database recovery")
        from scripts.ops.friday_profile_cutover import verify_recovery_receipt

        binding = journal["friday_cutover"]
        verify_recovery_receipt(
            recovery_receipt_path=recovery_receipt,
            expected_recovery_receipt_sha256=recovery_sha256,
            cutover_receipt_path=Path(binding["admission"]),
            expected_cutover_receipt_sha256=binding["admission_sha256"],
            original_path=Path(binding["original"]),
            target_path=employee.resolve() / "backend/mes.db",
        )
        journal["database_recovery"] = {
            "receipt": str(recovery_receipt.resolve()), "sha256": recovery_sha256.lower(),
        }
        _json(record, journal)
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
    if journal.get("code_install_started") or journal.get("code_installed"):
        if phase == "MIGRATING" or not journal.get("friday_cutover"):
            raise ReleaseError("Full code installation requires the verified Friday transition")
        from scripts.ops.friday_profile_cutover import verify_admission

        binding = journal["friday_cutover"]
        if _code_files(employee) != journal["incoming_code"]:
            raise ReleaseError("Installed Friday code changed before confirmation")
        verify_admission(
            receipt_path=Path(binding["admission"]),
            expected_receipt_sha256=binding["admission_sha256"],
            candidate_path=Path(binding["candidate"]), original_path=Path(binding["original"]),
            target_path=employee.resolve() / "backend/mes.db", friday_validator_root=employee,
            recovery=True,
        )
    journal["phase"] = phase
    _json(record, journal)


def _require_employee_runtime(employee: Path) -> RuntimeProfile:
    """Resolve and verify the fixed public employee profile and installed code root."""

    employee = _physical(employee).resolve()
    if employee != _physical(EMPLOYEE_RUNTIME_ROOT).resolve():
        raise ReleaseError("Friday activation requires the canonical employee profile root")
    if _physical(PROJECT_ROOT).resolve() != employee:
        raise ReleaseError("Friday activation must run from the installed employee code root")
    resolver = _inside(employee / "scripts/dev/resolve-server-profile.ps1", employee)
    if not resolver.is_file():
        raise ReleaseError("Employee runtime profile resolver is missing")
    environment = os.environ.copy()
    environment["DEXCOWIN_ACTIVATION_RESOLVER"] = str(resolver)
    environment["DEXCOWIN_ACTIVATION_ROOT"] = str(employee)
    command = (
        "$profile = & $env:DEXCOWIN_ACTIVATION_RESOLVER "
        "-RuntimeRepoRoot $env:DEXCOWIN_ACTIVATION_ROOT; "
        "$profile | ConvertTo-Json -Compress"
    )
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
            cwd=employee,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ReleaseError("Cannot resolve the employee runtime profile") from exc
    if result.returncode:
        detail = (result.stderr or result.stdout).strip()
        raise ReleaseError(f"Employee runtime profile resolution failed: {detail}")
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise ReleaseError("Employee runtime profile output is invalid") from exc
    expected = {
        "Name": "employee",
        "RepoRoot": str(employee),
        "FrontendPort": EMPLOYEE_FRONTEND_PORT,
        "BackendPort": EMPLOYEE_BACKEND_PORT,
        "BackendInternalUrl": f"http://localhost:{EMPLOYEE_BACKEND_PORT}",
        "PublicUrl": EMPLOYEE_PUBLIC_URL,
    }
    if not isinstance(payload, dict) or any(payload.get(key) != value for key, value in expected.items()):
        raise ReleaseError("Employee runtime profile does not match the public activation contract")
    return RuntimeProfile(
        root=employee,
        backend_port=EMPLOYEE_BACKEND_PORT,
        frontend_port=EMPLOYEE_FRONTEND_PORT,
        public_url=EMPLOYEE_PUBLIC_URL,
    )


def _activation_database(record: Path, employee: Path) -> Path:
    """Validate the bound MIGRATING journal and return its unchanged employee DB."""

    record = _inside(record, employee / "_attic/runtime/frontend-releases")
    journal = json.loads(record.read_text(encoding="utf-8"))
    if (
        Path(journal["employee_root"]).resolve() != employee
        or journal.get("phase") != "MIGRATING"
        or journal.get("code_installed") is not True
    ):
        raise ReleaseError("Friday activation requires the matching MIGRATING installed code")
    if _code_files(employee) != journal.get("incoming_code"):
        raise ReleaseError("Installed Friday code changed before activation")
    incoming_frontend = journal.get("incoming_frontend")
    installed_frontend = journal.get("installed_frontend")
    if not isinstance(incoming_frontend, dict) or not isinstance(installed_frontend, dict):
        raise ReleaseError("Installed Friday frontend changed from prepared release")
    if _bind_installed_frontend(employee, incoming_frontend) != installed_frontend:
        raise ReleaseError("Installed Friday frontend changed before activation")
    binding = journal.get("friday_cutover")
    if not isinstance(binding, dict):
        raise ReleaseError("Friday binding is missing from the activation record")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", str(binding.get("admission_sha256", ""))):
        raise ReleaseError("Friday binding admission hash is invalid")
    for name in ("admission", "candidate", "original"):
        value = binding.get(name)
        if not isinstance(value, str) or not _physical(Path(value)).resolve().is_file():
            raise ReleaseError(f"Friday binding {name} file is missing")
    database = _inside(employee / "backend/mes.db", employee)
    if not database.is_file():
        raise ReleaseError("Employee database is missing")
    return database


def _require_employee_database_binding(employee: Path, database: Path) -> None:
    """Resolve the installed backend's effective URL without exposing configuration."""

    backend = _inside(employee / "backend", employee)
    module = _inside(backend / "app/database.py", employee)
    if not module.is_file():
        raise ReleaseError("Installed employee database module is missing")
    command = "\n".join(
        (
            "import json",
            "from pathlib import Path",
            "from sqlalchemy.engine import make_url",
            "from app import database as configured",
            "url = make_url(configured.DATABASE_URL)",
            "value = url.database",
            "path = None",
            "if url.get_backend_name() == 'sqlite' and value not in (None, '', ':memory:'):",
            "    candidate = Path(value)",
            "    path = str((candidate if candidate.is_absolute() else Path.cwd() / candidate).resolve())",
            "print(json.dumps({'module': str(Path(configured.__file__).resolve()), "
            "'backend': url.get_backend_name(), 'path': path}))",
        )
    )
    try:
        result = subprocess.run(
            [sys.executable, "-B", "-c", command],
            cwd=backend,
            env=os.environ.copy(),
            capture_output=True,
            text=True,
            check=False,
            timeout=60,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ReleaseError("Cannot resolve the installed employee database binding") from exc
    try:
        payload = json.loads(result.stdout) if result.returncode == 0 else None
    except json.JSONDecodeError:
        payload = None
    if (
        not isinstance(payload, dict)
        or payload.get("module") != str(module.resolve())
        or payload.get("backend") != "sqlite"
        or payload.get("path") != str(database.resolve())
    ):
        raise ReleaseError("Backend is not bound to the canonical employee database")


def _acquire_writer_fence(database: Path) -> sqlite3.Connection:
    """Acquire the employee DB writer slot without waiting for an existing writer."""

    connection: sqlite3.Connection | None = None
    try:
        connection = sqlite3.connect(database, timeout=0, isolation_level=None)
        connection.execute("PRAGMA busy_timeout=0")
        connection.execute("BEGIN IMMEDIATE")
        return connection
    except sqlite3.Error as exc:
        if connection is not None:
            connection.close()
        raise ReleaseError("Employee database writer fence is already owned") from exc


def _release_writer_fence(connection: sqlite3.Connection) -> None:
    """Release an activation fence only after confirm or verified service shutdown."""

    operation_error: sqlite3.Error | None = None
    try:
        if connection.in_transaction:
            connection.execute("ROLLBACK")
    except sqlite3.Error as exc:
        operation_error = exc
    finally:
        connection.close()
    if operation_error is not None:
        raise ReleaseError("Employee database writer fence release failed") from operation_error


def _run_runtime_script(employee: Path, name: str) -> None:
    """Run one internally selected canonical service script from the pinned code root."""

    if name not in {
        "start-backend.ps1",
        "start-frontend.ps1",
        "stop-backend.ps1",
        "stop-frontend.ps1",
    }:
        raise ReleaseError("Unknown internal runtime script")
    script = _inside(employee / "scripts/dev" / name, employee)
    if not script.is_file():
        raise ReleaseError(f"Canonical runtime script is missing: {name}")
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)],
            cwd=employee,
            capture_output=True,
            text=True,
            check=False,
            timeout=RUNTIME_SCRIPT_TIMEOUT_SECONDS,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ReleaseError(f"Canonical runtime script could not complete: {name}") from exc
    if result.returncode:
        detail = (result.stderr or result.stdout).strip()
        raise ReleaseError(f"Canonical runtime script failed: {name}: {detail}")


def _start_backend(employee: Path) -> None:
    _run_runtime_script(employee, "start-backend.ps1")


def _start_frontend(employee: Path) -> None:
    _run_runtime_script(employee, "start-frontend.ps1")


def _stop_frontend(employee: Path) -> None:
    _run_runtime_script(employee, "stop-frontend.ps1")


def _stop_backend(employee: Path) -> None:
    _run_runtime_script(employee, "stop-backend.ps1")


def _http_get(url: str) -> bytes:
    """Perform one bounded read-only activation probe."""

    try:
        request = urllib_request.Request(url, method="GET", headers={"Cache-Control": "no-store"})
        with urllib_request.urlopen(request, timeout=ACTIVATION_HTTP_TIMEOUT_SECONDS) as response:
            if response.geturl() != url:
                raise ReleaseError(f"Activation probe redirect is not allowed: {url}")
            if response.status != 200:
                raise ReleaseError(f"Activation probe returned HTTP {response.status}: {url}")
            return response.read()
    except (OSError, urllib_error.URLError) as exc:
        raise ReleaseError(f"Activation probe failed: {url}") from exc


def _verify_activation_http(profile: RuntimeProfile) -> None:
    """Confirm backend readiness, public MES, and the public proxy's backend identity."""

    backend = f"http://127.0.0.1:{profile.backend_port}"
    for path in ("/health/live", "/health/ready"):
        _http_get(backend + path)
    _http_get(profile.public_url + "/mes")
    try:
        direct = json.loads(_http_get(backend + "/api/app-session"))
        proxy = json.loads(_http_get(profile.public_url + "/api/app-session"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ReleaseError("Activation app-session response is invalid") from exc
    direct_boot = direct.get("boot_id") if isinstance(direct, dict) else None
    proxy_boot = proxy.get("boot_id") if isinstance(proxy, dict) else None
    if not isinstance(direct_boot, str) or not direct_boot or direct_boot != proxy_boot:
        raise ReleaseError("Public frontend proxy app-session does not match the backend")


def _ports_closed(profile: RuntimeProfile) -> bool:
    """Return true only when neither canonical employee TCP port accepts connections."""

    for port in (profile.frontend_port, profile.backend_port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.settimeout(1)
            if probe.connect_ex(("127.0.0.1", port)) == 0:
                return False
    return True


def _owner_pids(profile: RuntimeProfile) -> dict[int, list[str]]:
    """Report listening owner PIDs without requiring elevated privileges."""

    ports = {profile.frontend_port, profile.backend_port}
    owners = {port: [] for port in ports}
    result = subprocess.run(
        ["netstat", "-ano", "-p", "tcp"],
        capture_output=True,
        text=True,
        check=False,
        timeout=10,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    if result.returncode:
        return {port: ["UNKNOWN"] for port in ports}
    for line in result.stdout.splitlines():
        fields = line.split()
        if len(fields) < 5 or fields[0].upper() != "TCP" or fields[-2].upper() != "LISTENING":
            continue
        try:
            port = int(fields[1].rsplit(":", 1)[1])
        except (IndexError, ValueError):
            continue
        if port in owners and fields[-1] not in owners[port]:
            owners[port].append(fields[-1])
    return {port: pids for port, pids in owners.items() if pids}


def _stop_until_ports_closed(employee: Path, profile: RuntimeProfile) -> None:
    """Keep the DB fence owned until both canonical stops and port checks succeed."""

    while True:
        errors: list[str] = []
        for label, stop in (("frontend", _stop_frontend), ("backend", _stop_backend)):
            try:
                stop(employee)
            except BaseException as exc:  # keep the safety process and fence alive
                errors.append(f"{label}: {type(exc).__name__}: {exc}")
        try:
            closed = _ports_closed(profile)
        except BaseException as exc:  # keep the safety process and fence alive
            closed = False
            errors.append(f"port-check: {type(exc).__name__}: {exc}")
        if not errors and closed:
            return
        try:
            owners = _owner_pids(profile)
        except BaseException as exc:  # reporting failure cannot release the fence
            owners = {profile.frontend_port: [f"UNKNOWN({type(exc).__name__})"],
                      profile.backend_port: [f"UNKNOWN({type(exc).__name__})"]}
        print(
            "FRIDAY_ACTIVATION_RECOVERY_REQUIRED=1\n"
            f"FRIDAY_ACTIVATION_FENCE_OWNER_PID={os.getpid()}\n"
            f"FRIDAY_ACTIVATION_OWNER_PIDS={json.dumps(owners, sort_keys=True)}\n"
            f"FRIDAY_ACTIVATION_STOP_ERRORS={' | '.join(errors) or 'ports still open'}",
            file=sys.stderr,
            flush=True,
        )
        try:
            time.sleep(STOP_RETRY_SECONDS)
        except BaseException as exc:  # an interrupt must not release the safety fence
            print(
                f"FRIDAY_ACTIVATION_RECOVERY_REQUIRED=1 interrupt={type(exc).__name__}",
                file=sys.stderr,
                flush=True,
            )


def activate_friday(record: Path, employee: Path) -> None:
    """Start and confirm Friday publicly while excluding every employee DB writer."""

    employee = _physical(employee).resolve()
    profile = _require_employee_runtime(employee)
    database = _activation_database(record, employee)
    _require_employee_database_binding(employee, database)
    fence = _acquire_writer_fence(database)
    try:
        _stop_until_ports_closed(employee, profile)
        _start_backend(employee)
        _start_frontend(employee)
        _verify_activation_http(profile)
        mark(record, employee, "CONFIRMED")
    except BaseException:
        _stop_until_ports_closed(employee, profile)
        _release_writer_fence(fence)
        raise
    _release_writer_fence(fence)


def _confirm_from_cli(record: Path, employee: Path) -> None:
    """Keep Friday-bound confirmation behind the activation writer fence."""

    employee = _physical(employee).resolve()
    bound_record = _inside(record, employee / "_attic/runtime/frontend-releases")
    journal = json.loads(bound_record.read_text(encoding="utf-8"))
    if isinstance(journal.get("friday_cutover"), dict):
        raise ReleaseError("Friday-bound confirmation requires activate-friday")
    mark(bound_record, employee, "CONFIRMED")


def main() -> int:
    from scripts.ops.friday_profile_cutover import CutoverAdmissionError

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "verify", "install", "install-code", "begin-friday-cutover", "activate-friday", "rollback", "migrating", "confirm", "check-pending", "snapshot-code", "verify-code", "install-preflight"))
    parser.add_argument("--source", type=Path)
    parser.add_argument("--runtime", type=Path)
    parser.add_argument("--node", type=Path)
    parser.add_argument("--release", type=Path)
    parser.add_argument("--employee-root", type=Path)
    parser.add_argument("--record", type=Path)
    parser.add_argument("--code-record", type=Path)
    parser.add_argument("--admission", type=Path)
    parser.add_argument("--admission-sha256")
    parser.add_argument("--candidate", type=Path)
    parser.add_argument("--original", type=Path)
    parser.add_argument("--recovery-receipt", type=Path)
    parser.add_argument("--recovery-sha256")
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
        elif args.command == "install-code":
            install_code(args.source, args.record, args.employee_root, args.code_record)
        elif args.command == "begin-friday-cutover":
            begin_friday_cutover(args.record, args.employee_root, args.admission,
                                 args.admission_sha256, args.candidate, args.original)
        elif args.command == "activate-friday":
            activate_friday(args.record, args.employee_root)
            print("FRIDAY_ACTIVATION_RESULT=CONFIRMED")
        elif args.command == "install-preflight":
            install_preflight(args.release, args.source, args.node, args.employee_root, args.required_file)
        elif args.command == "rollback":
            rollback(args.record, args.employee_root, recovery_receipt=args.recovery_receipt,
                     recovery_sha256=args.recovery_sha256)
        elif args.command == "check-pending":
            assert_no_pending(args.employee_root)
        elif args.command == "snapshot-code":
            print(f"SYNC_CODE_MANIFEST={snapshot_code(args.source, args.runtime)}")
        elif args.command == "verify-code":
            verify_code(args.source, args.record)
        elif args.command == "confirm":
            _confirm_from_cli(args.record, args.employee_root)
        else:
            mark(args.record, args.employee_root, "MIGRATING")
    except (ReleaseError, CutoverAdmissionError, OSError, ValueError, KeyError) as error:
        print(f"FRONTEND_PREPARE_RESULT=BLOCKED\nFRONTEND_PREPARE_ERROR={error}", file=sys.stderr)
        return 9
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
