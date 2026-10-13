"""Retain the installed frontend and prune only explicitly owned generated leaves."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from contextvars import ContextVar
import ctypes
from datetime import datetime, timedelta, timezone
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import time
from typing import Callable, Iterator
import uuid

ROOT = Path(r"C:\ERP")
EMPLOYEE = Path(r"C:\ERP-dev")
ROOT_NAMES = ("sync-preparation/frontend", "rb-release", "r42-9e70509d", "r42-43fd1361")
GENERATED = ("node_modules", ".next", ".next-prod")
RELEASE_NAME = re.compile(r"[0-9a-f]{64}(?:\.(?:invalid|incomplete)-[0-9a-f]{32})?\Z")
DOWNLOAD_LIMIT = 512 * 1024 * 1024
SESSION_ENV = "MES_FRONTEND_CACHE_SESSION"
CURRENT: ContextVar[CachePolicy | None] = ContextVar("frontend_cache_policy", default=None)


class CacheBusy(RuntimeError):
    """The caller must skip cleanup, or stop preparation before employee shutdown."""


def physical(path: Path) -> Path:
    """Reject every reparse point, including root ancestors, before using a path."""
    path = Path(os.path.abspath(path))
    for part in (path, *path.parents):
        try:
            info = part.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
            raise ValueError(f"Linked path is not permitted: {part}")
    return path


def read_json(path: Path) -> dict:
    """Read only physical JSON objects; malformed metadata is never a permission."""
    result = json.loads(physical(path).read_text(encoding="utf-8-sig"))
    if not isinstance(result, dict):
        raise ValueError(f"Expected an object: {path}")
    return result


def publish(path: Path, value: dict) -> None:
    """Replace our own mutable state atomically, never deployment evidence."""
    physical(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("x", encoding="utf-8") as stream:
            json.dump(value, stream, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def sha256(path: Path) -> str:
    """Hash a physical file without changing source or runtime database files."""
    with physical(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def process_birth(pid: int) -> str | None:
    """Return a process identity, '' for dead, or None when it cannot be verified."""
    if not isinstance(pid, int) or pid <= 0:
        return None
    if os.name != "nt":
        try:
            return Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19]
        except FileNotFoundError:
            return ""
        except OSError:
            return None
    from ctypes import wintypes
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = (wintypes.HANDLE,)
    kernel.WaitForSingleObject.argtypes = (wintypes.HANDLE, wintypes.DWORD)
    kernel.GetProcessTimes.argtypes = (wintypes.HANDLE, *([ctypes.POINTER(wintypes.FILETIME)] * 4))
    handle = kernel.OpenProcess(0x1000 | 0x100000, False, pid)
    if not handle:
        return "" if ctypes.get_last_error() in {87, 1168} else None
    try:
        if kernel.WaitForSingleObject(handle, 0) == 0:
            return ""
        creation, exit_time, system, user = (wintypes.FILETIME() for _ in range(4))
        if not kernel.GetProcessTimes(handle, ctypes.byref(creation), ctypes.byref(exit_time),
                                      ctypes.byref(system), ctypes.byref(user)):
            return None
        return str((creation.dwHighDateTime << 32) | creation.dwLowDateTime)
    finally:
        kernel.CloseHandle(handle)


def alive(identity: dict) -> bool:
    """Unverifiable ownership stays protected; PID reuse does not extend a lease."""
    birth = process_birth(identity.get("pid"))
    return birth is None or (bool(birth) and (not identity.get("birth") or birth == identity["birth"]))


def timestamp(value: str) -> datetime:
    """Require timezone-aware expiry metadata instead of guessing from file mtime."""
    result = datetime.fromisoformat(value)
    if result.tzinfo is None:
        raise ValueError("Cache timestamps must include a timezone")
    return result


def remove_tree(path: Path) -> None:
    """Delete a prevalidated generated leaf, without force or shell traversal."""
    shutil.rmtree(path)


def job_kernel() -> ctypes.CDLL:
    """Configure pointer-sized Win32 handles for process-tree ownership."""
    from ctypes import wintypes
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    for name, args, result in (
        ("CreateJobObjectW", (ctypes.c_void_p, wintypes.LPCWSTR), wintypes.HANDLE),
        ("OpenJobObjectW", (wintypes.DWORD, wintypes.BOOL, wintypes.LPCWSTR), wintypes.HANDLE),
        ("AssignProcessToJobObject", (wintypes.HANDLE, wintypes.HANDLE), wintypes.BOOL),
        ("QueryInformationJobObject", (wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD, ctypes.c_void_p), wintypes.BOOL),
        ("CreateToolhelp32Snapshot", (wintypes.DWORD, wintypes.DWORD), wintypes.HANDLE),
        ("Thread32First", (wintypes.HANDLE, ctypes.c_void_p), wintypes.BOOL),
        ("Thread32Next", (wintypes.HANDLE, ctypes.c_void_p), wintypes.BOOL),
        ("OpenThread", (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD), wintypes.HANDLE),
        ("ResumeThread", (wintypes.HANDLE,), wintypes.DWORD),
        ("CloseHandle", (wintypes.HANDLE,), wintypes.BOOL),
    ):
        function = getattr(kernel, name)
        function.argtypes, function.restype = args, result
    return kernel


def job_busy(name: str) -> bool | None:
    """A lost job namespace cannot prove that orphan descendants have terminated."""
    if not re.fullmatch(r"Local\\DEXCOWIN-MES-frontend-cache-[0-9a-f]{32}", name):
        return None
    from ctypes import wintypes

    class Accounting(ctypes.Structure):
        _fields_ = [(field, ctypes.c_longlong) for field in ("user", "kernel", "period_user", "period_kernel")] + [
            (field, wintypes.DWORD) for field in ("faults", "total", "active", "terminated")]

    kernel = job_kernel()
    handle = kernel.OpenJobObjectW(4, False, name)
    if not handle:
        return None
    try:
        info = Accounting()
        if not kernel.QueryInformationJobObject(handle, 1, ctypes.byref(info), ctypes.sizeof(info), None):
            return None
        return info.active > 0
    finally:
        kernel.CloseHandle(handle)


def resume_job_child(kernel: ctypes.CDLL, handle: int, child: subprocess.Popen) -> None:
    """Resume the launcher only after job assignment and durable PID publication."""
    from ctypes import wintypes

    class ThreadEntry(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("usage", wintypes.DWORD), ("thread", wintypes.DWORD),
                    ("owner", wintypes.DWORD), ("priority", wintypes.LONG),
                    ("delta", wintypes.LONG), ("flags", wintypes.DWORD)]

    snapshot = kernel.CreateToolhelp32Snapshot(4, 0)
    if snapshot == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        entry = ThreadEntry()
        entry.size = ctypes.sizeof(entry)
        found = kernel.Thread32First(snapshot, ctypes.byref(entry))
        while found:
            if entry.owner == child.pid:
                thread = kernel.OpenThread(2, False, entry.thread)
                if not thread:
                    raise ctypes.WinError(ctypes.get_last_error())
                try:
                    if kernel.ResumeThread(thread) == 0xFFFFFFFF:
                        raise ctypes.WinError(ctypes.get_last_error())
                    return
                finally:
                    kernel.CloseHandle(thread)
            found = kernel.Thread32Next(snapshot, ctypes.byref(entry))
        raise OSError("Cannot find the suspended preparation thread")
    finally:
        kernel.CloseHandle(snapshot)


class CachePolicy:
    """Coordinate cache ownership under one OS lock; tests supply disposable roots."""

    def __init__(self, repo: Path, employee: Path, *, now: Callable[[], datetime] | None = None) -> None:
        self.repo, self.employee = physical(repo), physical(employee)
        if self.repo == self.employee or self.repo.is_relative_to(self.employee) or self.employee.is_relative_to(self.repo):
            raise ValueError("Preparation and employee trees must be separate")
        self.roots = tuple(self.repo / "_attic/runtime" / name for name in ROOT_NAMES)
        self.state_root = self.repo / "_attic/runtime/frontend-cache-policy"
        self.now = now or (lambda: datetime.now(timezone.utc))
        self.download_limit = DOWNLOAD_LIMIT

    @contextmanager
    def lock(self) -> Iterator[None]:
        """Use crash-released byte locking shared by all participating processes."""
        physical(self.state_root)
        self.state_root.mkdir(parents=True, exist_ok=True)
        path = physical(self.state_root / "operation.lock")
        descriptor = os.open(path, os.O_CREAT | os.O_RDWR)
        locked = False
        try:
            if os.name == "nt":
                import msvcrt
                if os.fstat(descriptor).st_size == 0:
                    os.write(descriptor, b"\x00")
                os.lseek(descriptor, 0, os.SEEK_SET)
                try:
                    msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
                except OSError as exc:
                    if exc.errno in {errno.EACCES, errno.EAGAIN, errno.EDEADLK} or getattr(exc, "winerror", 0) == 33:
                        raise CacheBusy("Another preparation or cleanup owns the operation lock") from exc
                    raise
            else:
                import fcntl
                try:
                    fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError as exc:
                    raise CacheBusy("Another preparation or cleanup owns the operation lock") from exc
            locked = True
            yield
        finally:
            if locked:
                if os.name == "nt":
                    import msvcrt
                    os.lseek(descriptor, 0, os.SEEK_SET)
                    msvcrt.locking(descriptor, msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(descriptor, fcntl.LOCK_UN)
            os.close(descriptor)

    def sessions(self) -> dict[str, dict]:
        """Corrupt sessions block work; dead owner processes are safe to ignore."""
        directory = physical(self.state_root / "sessions")
        active = {}
        for path in directory.glob("*.json"):
            session = read_json(path)
            if alive(session):
                active[path.stem] = session
        return active

    @contextmanager
    def operation(self, *, session: str | None = None) -> Iterator[None]:
        """A child must still take the lock; its session token only admits its owner."""
        with self.lock():
            active = self.sessions()
            if active and (session not in active or len(active) != 1):
                raise CacheBusy("A deployment session is still using preparation files")
            token = CURRENT.set(self)
            try:
                yield
            finally:
                CURRENT.reset(token)

    def begin_session(self, owner_pid: int) -> str:
        """Pin the entire PowerShell deployment, including gaps between child tools."""
        with self.operation():
            birth = process_birth(owner_pid)
            if not birth:
                raise CacheBusy("Cannot verify the deployment session owner")
            token = uuid.uuid4().hex
            publish(self.state_root / "sessions" / (token + ".json"),
                    {"pid": owner_pid, "birth": birth, "started_at": self.now().isoformat()})
            return token

    def end_session(self, token: str) -> None:
        """Release only this session's operational marker, never audit records."""
        if not re.fullmatch(r"[0-9a-f]{32}", token):
            raise ValueError("Invalid session token")
        with self.lock():
            physical(self.state_root / "sessions" / (token + ".json")).unlink(missing_ok=True)

    def owned_release(self, release: Path) -> Path:
        """Admit only a direct, physical hash directory of the four fixed roots."""
        release = physical(release)
        if release.parent not in self.roots or not RELEASE_NAME.fullmatch(release.name):
            raise ValueError(f"Not an allowed preparation release: {release}")
        physical(release.parent)
        return release

    def preparation_path(self, release: Path) -> Path:
        """Keep mutable process state separate from immutable preparation receipts."""
        release = self.owned_release(release)
        key = hashlib.sha256(str(release).lower().encode()).hexdigest()
        return self.state_root / "preparations" / (key + ".json")

    def save_preparation(self, release: Path, state: dict) -> None:
        """Publish only the state of one known generated preparation."""
        publish(self.preparation_path(release), state)

    def pin(self, release: Path) -> dict:
        """Reserve successful or incomplete preparation for at least 24 hours."""
        release = self.owned_release(release)
        path = self.preparation_path(release)
        if path.exists():
            previous = read_json(path)
            if self.child_busy(previous):
                raise CacheBusy(f"A preparation child is active or unknown: {release}")
        state = {"release": str(release), "expires_at": (self.now() + timedelta(hours=24)).isoformat(),
                 "pid": os.getpid(), "birth": process_birth(os.getpid()), "child": {"status": "EXITED"}}
        self.save_preparation(release, state)
        return state

    @staticmethod
    def child_busy(state: dict) -> bool:
        """A STARTING marker covers the spawn-before-PID-publication crash window."""
        child = state.get("child", {})
        if not isinstance(child, dict):
            return True
        status = child.get("status")
        if status == "EXITED":
            return False
        if status == "RUNNING" and child.get("job") and os.name == "nt":
            return job_busy(child["job"]) is not False
        if status == "RUNNING" and child.get("group") and os.name != "nt":
            try:
                os.killpg(child["group"], 0)
                return True
            except ProcessLookupError:
                return False
            except OSError:
                return True
        if status == "RUNNING" and isinstance(child.get("pid"), int) and child.get("birth"):
            return alive(child)
        return True

    def run_command(self, argv: list[str], cwd: Path, environment: dict[str, str], log: Path) -> int:
        """Track npm and descendant Node processes even if their launcher is killed."""
        release = self.owned_release(cwd.parent)
        state = read_json(self.preparation_path(release))
        if self.child_busy(state):
            raise CacheBusy("Previous preparation descendants are still active or unknown")
        state["child"] = {"status": "STARTING"}
        self.save_preparation(release, state)
        kernel, handle, job = None, None, None
        try:
            if os.name == "nt":
                kernel = job_kernel()
                job = "Local\\DEXCOWIN-MES-frontend-cache-" + uuid.uuid4().hex
                handle = kernel.CreateJobObjectW(None, job)
                if not handle:
                    raise ctypes.WinError(ctypes.get_last_error())
            with log.open("w", encoding="utf-8") as output:
                child = subprocess.Popen(argv, cwd=cwd, env=environment, stdout=output, stderr=subprocess.STDOUT,
                                         start_new_session=os.name != "nt",
                                         creationflags=(subprocess.CREATE_NO_WINDOW | 4) if os.name == "nt" else 0)
                try:
                    state["child"] = {"status": "RUNNING", "pid": child.pid, "birth": process_birth(child.pid)}
                    state["child"].update({"job": job} if job else {"group": child.pid})
                    # Still suspended: a failed publication cannot leave a running untracked child.
                    if handle:
                        if not kernel.AssignProcessToJobObject(handle, int(child._handle)):
                            raise ctypes.WinError(ctypes.get_last_error())
                    self.save_preparation(release, state)
                    if handle:
                        resume_job_child(kernel, handle, child)
                    result = child.wait()
                except BaseException:
                    if child.poll() is None:
                        child.terminate()
                    child.wait()
                    raise
            # Job accounting can lag a signaled process handle briefly.
            for _ in range(50):
                if not self.child_busy(state):
                    state["child"]["status"] = "EXITED"
                    break
                time.sleep(0.01)
            self.save_preparation(release, state)
            return result
        finally:
            if handle:
                kernel.CloseHandle(handle)

    def records(self) -> list[tuple[Path, dict]]:
        """Any pending or malformed installation blocks pruning globally."""
        root = physical(self.employee / "_attic/runtime/frontend-releases")
        records = []
        for path in root.glob("*/journal.json"):
            record = read_json(path)
            if record.get("phase") not in {"CONFIRMED", "ROLLED_BACK"}:
                raise CacheBusy(f"Installation requires recovery: {path}")
            if physical(Path(record["employee_root"])) != self.employee:
                raise ValueError(f"Wrong employee installation record: {path}")
            records.append((path, record))
        return records

    @staticmethod
    def valid_manifest(value: object) -> bool:
        """Metadata may identify files but can never supply traversal paths."""
        return isinstance(value, dict) and bool(value) and all(
            isinstance(name, str) and not Path(name).is_absolute() and ".." not in Path(name).parts
            and not any(part in {"", ".", ".."} for part in name.split("/"))
            and ":" not in name and "\\" not in name and isinstance(digest, str) and re.fullmatch(r"[0-9a-f]{64}", digest)
            for name, digest in value.items())

    def installed_identity(self, release: Path, receipt: dict) -> bool:
        """Use source and immutable BUILD_ID; runtime-written Next cache is not identity."""
        source, artifacts = receipt.get("source"), receipt.get("artifacts")
        if not self.valid_manifest(source) or not self.valid_manifest(artifacts):
            return False
        build = ".next-prod/BUILD_ID"
        if build not in artifacts:
            return False
        identity = dict(source)
        identity[build] = artifacts[build]
        identity.update({name: digest for name, digest in artifacts.items()
                         if name in {"node_modules/next/package.json", "node_modules/react/package.json", "node_modules/react-dom/package.json"}})
        try:
            return all(sha256(self.employee / "frontend" / name) == digest
                       and sha256(release / "frontend" / name) == digest for name, digest in identity.items())
        except (OSError, ValueError):
            return False

    def validate_install(self, release: Path, record_path: Path) -> dict:
        """Bind the explicit release, confirmed journal and actual installed identity."""
        release = self.owned_release(release)
        record_path = physical(record_path)
        journal_root = self.employee / "_attic/runtime/frontend-releases"
        if record_path.parent.parent != journal_root or record_path.name != "journal.json":
            raise ValueError("Installation record is outside the employee journal root")
        record, receipt = read_json(record_path), read_json(release / "receipt.json")
        if (record.get("phase") != "CONFIRMED" or receipt.get("status") != "READY"
                or physical(Path(record["employee_root"])) != self.employee
                or record.get("incoming_frontend") != receipt.get("artifacts")
                or not self.installed_identity(release, receipt)):
            raise ValueError("Confirmed installation does not match the prepared release")
        return {"release": str(release), "record": str(record_path),
                "receipt_sha256": sha256(release / "receipt.json"), "confirmed_at": self.now().isoformat()}

    def remember_install(self, release: Path, record: Path) -> None:
        """Write our own installed pointer; callers hold the common operation lock."""
        state = self.validate_install(release, record)
        publish(self.state_root / "latest-installed.json", state)
        pin = self.preparation_path(release)
        if pin.exists():
            value = read_json(pin)
            value["expires_at"] = self.now().isoformat()
            self.save_preparation(release, value)

    def latest(self, releases: list[Path], records: list[tuple[Path, dict]]) -> Path:
        """Bootstrap old immutable evidence only when exactly one installed match exists."""
        state_path = physical(self.state_root / "latest-installed.json")
        if state_path.exists():
            state = read_json(state_path)
            release = self.owned_release(Path(state["release"]))
            verified = self.validate_install(release, Path(state["record"]))
            if verified["receipt_sha256"] != state["receipt_sha256"]:
                raise ValueError("Retained installation receipt changed")
            return release
        confirmed = [record for _, record in records if record["phase"] == "CONFIRMED"]
        matches = []
        for release in releases:
            path = release / "receipt.json"
            if not path.exists():
                continue
            try:
                receipt = read_json(path)
                if (receipt.get("status") == "READY" and any(record.get("incoming_frontend") == receipt.get("artifacts")
                        for record in confirmed) and self.installed_identity(release, receipt)):
                    matches.append(release)
            except (OSError, ValueError, KeyError):
                continue
        if len(matches) != 1:
            raise ValueError(f"Cannot uniquely identify the installed preparation ({len(matches)} matches)")
        return matches[0]

    def protected_preparation(self, release: Path) -> bool:
        """Expiry never overrides a surviving process or unreadable operational state."""
        state_path = self.preparation_path(release)
        if state_path.exists():
            state = read_json(state_path)
            if state.get("release") != str(release):
                raise ValueError("Preparation ownership changed")
            if alive(state) or self.child_busy(state) or timestamp(state["expires_at"]) > self.now():
                return True
            return False
        receipt_path = release / "receipt.json"
        if not receipt_path.exists():
            # Historical incomplete directories have no reliable process provenance.
            return True
        receipt = read_json(receipt_path)
        return receipt.get("status") != "READY" or timestamp(receipt["prepared_at"]) + timedelta(hours=24) > self.now()

    def validate_target(self, path: Path) -> tuple[int, int]:
        """Measure only a fixed generated leaf and reject protected content or links."""
        path = physical(path)
        artifacts = {}
        if path.name == "_cacache":
            if path.parent.name != "npm-cache" or path.parent.parent not in self.roots:
                raise ValueError("Not an allowed npm download cache")
        elif path.name in GENERATED and path.parent.name == "frontend":
            release = self.owned_release(path.parent.parent)
            receipt_path = release / "receipt.json"
            if receipt_path.exists():
                receipt = read_json(receipt_path)
                source = receipt.get("source")
                if not self.valid_manifest(source) or any(
                        name.split("/", 1)[0].lower() == path.name.lower() for name in source):
                    raise ValueError("Source manifest overlaps the generated target or is invalid")
                artifacts = receipt.get("artifacts", {})
                if not self.valid_manifest(artifacts):
                    raise ValueError("Generated artifact manifest is invalid")
        else:
            raise ValueError("Not a permitted generated leaf")
        pending, count, size = [path], 0, 0
        protected_subtrees = []
        while pending:
            with os.scandir(pending.pop()) as entries:
                for entry in entries:
                    info = entry.stat(follow_symlinks=False)
                    name = entry.name.lower()
                    if entry.is_symlink() or getattr(info, "st_file_attributes", 0) & 0x400:
                        raise ValueError(f"Linked generated content: {entry.path}")
                    if (".db" in name or ".sqlite" in name or name.startswith(".env") or name == ".npmrc"
                            or Path(name).suffix in {".xls", ".xlsx"}):
                        raise ValueError(f"Protected content in generated target: {entry.path}")
                    if stat.S_ISDIR(info.st_mode):
                        if name in {"data", "shared", "share"}:
                            prefix = Path(entry.path).relative_to(path.parent).as_posix() + "/"
                            if not any(relative.startswith(prefix) for relative in artifacts):
                                raise ValueError(f"Unregistered shared/data directory: {entry.path}")
                            protected_subtrees.append(Path(entry.path))
                        pending.append(Path(entry.path))
                    elif stat.S_ISREG(info.st_mode):
                        if info.st_nlink > 1:
                            raise ValueError(f"Hard-linked generated content: {entry.path}")
                        item = Path(entry.path)
                        if any(item.is_relative_to(directory) for directory in protected_subtrees):
                            relative = item.relative_to(path.parent).as_posix()
                            if artifacts.get(relative) != sha256(item):
                                raise ValueError(f"Unverified content in shared/data directory: {item}")
                        count += 1
                        size += info.st_size
                    else:
                        raise ValueError(f"Unsupported generated content: {entry.path}")
        return size, count

    def cleanup(self, *, apply: bool = False) -> dict:
        """Dry-run by default; failed admission never authorizes partial scope expansion."""
        report = {"status": "PREVIEW", "retained_release": None, "targets": [], "removed": [],
                  "removed_bytes": 0, "skipped": [], "errors": [], "at": self.now().isoformat()}
        try:
            with self.operation():
                self._cleanup_locked(report, apply=apply)
        except (CacheBusy, OSError, ValueError, KeyError, TypeError) as exc:
            report["status"] = "SKIPPED"
            report["skipped"].append({"reason": str(exc)})
        return report

    def _cleanup_locked(self, report: dict, *, apply: bool) -> None:
        """Plan and revalidate deletion while no participating command can start."""
        records = self.records()
        releases = []
        for root in self.roots:
            physical(root)
            if root.is_dir():
                for path in root.iterdir():
                    if RELEASE_NAME.fullmatch(path.name):
                        releases.append(self.owned_release(path))
        retained = self.latest(releases, records)
        report["retained_release"] = str(retained)
        busy_roots = set()
        candidates = []
        for release in releases:
            if release == retained:
                state_path = self.preparation_path(release)
                if state_path.exists():
                    try:
                        state = read_json(state_path)
                        if alive(state) or self.child_busy(state):
                            busy_roots.add(release.parent)
                    except (OSError, ValueError, TypeError):
                        busy_roots.add(release.parent)
                continue
            try:
                if self.protected_preparation(release):
                    busy_roots.add(release.parent)
                    report["skipped"].append({"path": str(release), "reason": "fresh, active or unverified preparation"})
                    continue
                for name in GENERATED:
                    path = release / "frontend" / name
                    if path.exists():
                        candidates.append(path)
            except (OSError, ValueError, KeyError, TypeError) as exc:
                busy_roots.add(release.parent)
                report["skipped"].append({"path": str(release), "reason": str(exc)})
        downloads = []
        for root in (*self.roots[1:], self.roots[0]):
            path = root / "npm-cache/_cacache"
            if path.exists():
                try:
                    size, _ = self.validate_target(path)
                    downloads.append((root, path, size))
                except (OSError, ValueError) as exc:
                    busy_roots.add(root)
                    report["skipped"].append({"path": str(path), "reason": str(exc)})
        total = sum(size for _, _, size in downloads)
        for root, path, size in downloads:
            if total <= self.download_limit:
                break
            if root in busy_roots:
                report["skipped"].append({"path": str(path), "reason": "download cache has an active or unverified preparation"})
                continue
            candidates.append(path)
            total -= size
        for path in candidates:
            try:
                size, count = self.validate_target(path)
                report["targets"].append({"path": str(path), "bytes": size, "files": count})
                if apply:
                    # Recheck physical roots and content immediately before deletion.
                    self.validate_target(path)
                    remove_tree(path)
                    report["removed"].append(str(path))
                    report["removed_bytes"] += size
            except (OSError, ValueError) as exc:
                report["errors"].append({"path": str(path), "reason": str(exc)})
        report["status"] = "WARNING" if report["errors"] else "COMPLETED" if apply else "PREVIEW"


def main() -> int:
    """Local operational CLI; applying cleanup requires an explicit flag."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", nargs="?", default="cleanup", choices=("cleanup", "session-begin", "session-end", "installed"))
    parser.add_argument("--repo-root", type=Path, default=ROOT)
    parser.add_argument("--employee-root", type=Path, default=EMPLOYEE)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--owner-pid", type=int)
    parser.add_argument("--session")
    parser.add_argument("--release", type=Path)
    parser.add_argument("--record", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    try:
        policy = CachePolicy(args.repo_root, args.employee_root)
        if args.command == "session-begin":
            print("FRONTEND_CACHE_SESSION=" + policy.begin_session(args.owner_pid))
        elif args.command == "session-end":
            policy.end_session(args.session)
        elif args.command == "installed":
            with policy.operation(session=os.environ.get(SESSION_ENV)):
                policy.remember_install(args.release, args.record)
            print("FRONTEND_CACHE_INSTALLED=CONFIRMED")
        else:
            report = policy.cleanup(apply=args.apply)
            if args.apply or args.report:
                output = args.report or policy.state_root / "reports" / (datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex + ".json")
                publish(output, report)
                print("FRONTEND_CACHE_REPORT=" + str(output))
            print("FRONTEND_CACHE_RESULT=" + report["status"])
            print(json.dumps(report, ensure_ascii=True))
        return 0
    except (CacheBusy, OSError, ValueError, KeyError, TypeError) as exc:
        print("FRONTEND_CACHE_ERROR=" + str(exc), file=sys.stderr)
        return 9


if __name__ == "__main__":
    raise SystemExit(main())
