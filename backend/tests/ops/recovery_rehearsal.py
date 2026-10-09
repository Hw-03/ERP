"""Opt-in real-process recovery rehearsal; production lifecycle guards stay fixed.

Run explicitly with --artifacts <immutable manifest> after the source freeze.
Every mutation stays under the worktree's ignored recovery output directory.
"""
from __future__ import annotations

import argparse
from contextlib import closing
from dataclasses import asdict
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from typing import BinaryIO
from urllib.error import URLError
from urllib.request import urlopen
import uuid
import sqlite3

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT), str(ROOT / "backend")]
from scripts.ops import employee_frontend_release as release  # noqa: E402
from scripts.ops import employee_release_recovery as recovery  # noqa: E402
from scripts.ops import employee_schema_preflight as preflight  # noqa: E402
from scripts.ops.recovery_owner import process_started_at_ns  # noqa: E402

OUTPUT_ROOT = ROOT / "_attic/runtime/closure/recovery"
BACKEND_PORT = 8042
FRONTEND_PORT = 3042
REVISIONS = tuple(f"20261007_{number:04}" for number in range(39, 44))


def assert_frozen_source(root: Path, code: dict, frontend: dict[str, str]) -> None:
    """Bind backend/scripts and the complete frontend source through the final run."""
    if release._code_files(root) != code or release.files(root / "frontend", source=True) != frontend:
        raise release.ReleaseError("Final source changed after capture")


def node_selection(config: Path) -> dict:
    """Preserve the exact selection bytes as well as the executable/npm contents."""
    try:
        raw = release._physical(config).read_bytes()
        node = Path(raw.decode("utf-8-sig").strip())
        if not node.is_absolute() or not release._physical(node).is_file():
            raise release.ReleaseError("Node selection must name an existing absolute executable")
        selected = {"config_sha256": hashlib.sha256(raw).hexdigest(), "path": str(node),
                    "toolchain": release._toolchain(node)}
        if config.read_bytes() != raw:
            raise release.ReleaseError("Node selection changed during capture")
        return selected
    except (OSError, UnicodeError) as error:
        raise release.ReleaseError("Node selection cannot be read consistently") from error


def assert_node_selection(config: Path, expected: dict) -> None:
    """Changing even whitespace in the selection invalidates the captured input."""
    if node_selection(config) != expected:
        raise release.ReleaseError("Node selection or toolchain changed after capture")


def rehearse_install_failure(prepared: Path, source: Path, node: Path, employee: Path) -> dict:
    """Fail forward code installation after a real partial copy and prove full rollback."""
    before = recovery._state(employee)
    previous_node = release._previous_node(employee)
    record = release.install(prepared, source / "frontend", node, employee)
    code_record = release.snapshot_code(source, employee.parent / "install-failure-manifests")
    original_copy = release._copy_files
    injected = False

    def partial_copy(from_root: Path, to_root: Path, manifest: dict[str, str]) -> None:
        nonlocal injected
        original_copy(from_root, to_root, manifest)
        if from_root.resolve() == (source / "backend").resolve() and to_root.resolve() == (employee / "backend").resolve():
            assert recovery.restore_db._sqlite_snapshot_digest(employee / "backend/mes.db") == before["database"]
            injected = True
            raise OSError("rehearsal injected forward code installation failure")

    release._copy_files = partial_copy
    try:
        try:
            release.install_code(source, record, employee, code_record)
        except OSError as error:
            assert injected and "injected forward" in str(error), error
        else:
            raise AssertionError("Forward code installation failure was not exercised")
    finally:
        release._copy_files = original_copy
    assert recovery._load(record)["phase"] == "ROLLED_BACK"
    assert recovery._state(employee) == before
    assert release._previous_node(employee) == previous_node
    return {"status": "PASS", "failed_stage": "install_code_after_backend_copy",
            "record": str(record), "record_sha256": recovery._sha(record),
            "preserved_database_sha256": before["database"],
            "preserved_code_frontend_config_sha256": release._digest(before["code"]),
            "preserved_node_sha256": release._digest(previous_node)}


class IsolatedLifecycle:
    """Own only directly spawned test processes and fixed private QA ports."""

    def __init__(self, employee: Path) -> None:
        self.employee = release._physical(employee).resolve()
        self._validate(self.employee)
        self.processes: dict[str, tuple[subprocess.Popen, dict[str, int], BinaryIO]] = {}
        self.events: list[dict] = []

    def _validate(self, employee: Path) -> None:
        """Contain every managed root beneath the current worktree rehearsal."""
        if (employee != self.employee or employee.name != "employee"
                or not employee.is_relative_to(release._physical(OUTPUT_ROOT).resolve())):
            raise release.ReleaseError("Lifecycle requires the isolated rehearsal employee root")

    @staticmethod
    def require_identity(owner: dict[str, int]) -> None:
        """Refuse PID reuse, a dead owner, or inaccessible process metadata."""
        observed = process_started_at_ns(owner["pid"])
        if observed is None or observed < 0 or observed != owner["started_at_ns"]:
            raise release.ReleaseError("Isolated process identity is unavailable or changed")

    def _profile(self) -> release.RuntimeProfile:
        return release.RuntimeProfile(self.employee, BACKEND_PORT, FRONTEND_PORT,
                                      f"http://127.0.0.1:{FRONTEND_PORT}")

    def assert_stopped(self, employee: Path) -> None:
        """Check every interface before startup and again after verified shutdown."""
        self._validate(employee)
        if os.name == "nt" and release._owner_pids(self._profile()):
            raise release.ReleaseError("Isolated ports are occupied or ownership is unknown")
        for port in (BACKEND_PORT, FRONTEND_PORT):
            with socket.socket() as probe:
                if os.name == "nt":
                    probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
                try:
                    probe.bind(("127.0.0.1", port))
                except OSError as exc:
                    raise release.ReleaseError("Isolated port is occupied") from exc

    def _spawn(self, name: str, argv: list[str], cwd: Path, env: dict[str, str]) -> None:
        """Keep the process handle and creation identity; never adopt a listener."""
        logs = self.employee.parent / "lifecycle-logs"
        logs.mkdir(exist_ok=True)
        output = (logs / f"{name}-{uuid.uuid4().hex}.log").open("wb")
        try:
            process = subprocess.Popen(argv, cwd=cwd, env=env, stdout=output,
                                       stderr=subprocess.STDOUT,
                                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        except BaseException:
            output.close()
            raise
        owner = {"pid": process.pid, "started_at_ns": process_started_at_ns(process.pid)}
        # Preserve the direct handle even if identity collection fails.
        self.processes[name] = (process, owner, output)
        self.require_identity(owner)
        self.events.append({"event": "spawn", "service": name, "owner": owner})

    def _probe(self, url: str) -> bytes:
        """Poll bounded readiness while retaining ownership of both processes."""
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            if any(process.poll() is not None for process, _, _ in self.processes.values()):
                raise release.ReleaseError("Isolated process exited before readiness; inspect local lifecycle logs")
            try:
                with urlopen(url, timeout=2) as response:
                    if response.status == 200 and response.geturl() == url:
                        return response.read()
            except (OSError, URLError):
                pass
            time.sleep(0.25)
        raise release.ReleaseError("Isolated readiness timed out")

    def start_and_query(self, frontend: Path, node: Path, revision: str, *, keep_running: bool = False) -> None:
        """Start actual restored backend plus separately built QA production frontend."""
        frontend = release._physical(frontend).resolve()
        if not frontend.is_relative_to(OUTPUT_ROOT.resolve()):
            raise release.ReleaseError("QA frontend must be an isolated artifact")
        routes = json.loads((frontend / ".next-prod/routes-manifest.json").read_text(encoding="utf-8"))
        rewrites = routes.get("rewrites", {})
        entries = rewrites if isinstance(rewrites, list) else sum(rewrites.values(), [])
        if not entries or any(entry.get("destination", "").startswith("http")
                              and not entry["destination"].startswith(f"http://127.0.0.1:{BACKEND_PORT}/")
                              for entry in entries):
            raise release.ReleaseError("QA build must proxy only to the private backend")
        self.assert_stopped(self.employee)
        database = self.employee / "backend/mes.db"
        before = preflight.snapshot_existing_rows(database)
        environment = os.environ.copy()
        for key in tuple(environment):
            if key.startswith(("NEXT_PUBLIC_", "MES_PROXY_")) or key in {
                "PYTHONPATH", "PYTHONHOME", "NODE_OPTIONS", "APP_ENV", "REQUIRE_POSTGRES"
            }:
                environment.pop(key)
        environment.update(DATABASE_URL=f"sqlite:///{database.as_posix()}",
                           MES_RUNTIME_ROOT=str(self.employee.parent / "service-runtime"),
                           PYTHONDONTWRITEBYTECODE="1", NEXT_TELEMETRY_DISABLED="1",
                           BACKEND_INTERNAL_URL=f"http://127.0.0.1:{BACKEND_PORT}",
                           NEXT_PUBLIC_MES_ENV="employee", NEXT_PUBLIC_API_URL="")
        succeeded = False
        try:
            self._spawn("backend", [sys.executable, "-B", "-m", "uvicorn", "app.main:app",
                        "--host", "127.0.0.1", "--port", str(BACKEND_PORT)], self.employee / "backend", environment)
            backend = f"http://127.0.0.1:{BACKEND_PORT}"
            self._probe(backend + "/health/live")
            ready = json.loads(self._probe(backend + "/health/ready"))
            assert ready.get("alembic_revision") == revision, ready
            self._spawn("frontend", [str(node), str(frontend / "node_modules/next/dist/bin/next"),
                        "start", "--hostname", "127.0.0.1", "--port", str(FRONTEND_PORT)], frontend, environment)
            self._probe(f"http://127.0.0.1:{FRONTEND_PORT}/mes")
            release._verify_activation_http(self._profile())
            direct = json.loads(self._probe(backend + "/api/departments"))
            proxy = json.loads(self._probe(f"http://127.0.0.1:{FRONTEND_PORT}/api/departments"))
            assert direct == proxy and isinstance(direct, list)
            for _, owner, _ in self.processes.values():
                self.require_identity(owner)
            if os.name == "nt":
                owners = release._owner_pids(self._profile())
                assert owners == {BACKEND_PORT: [str(self.processes["backend"][0].pid)],
                                  FRONTEND_PORT: [str(self.processes["frontend"][0].pid)]}, owners
            self.events.append({"event": "health-and-query", "revision": revision,
                                "department_rows": len(direct), "proxy_identity": "PASS"})
            preflight.assert_existing_rows_unchanged(database, before, frozenset())
            succeeded = True
        finally:
            if not keep_running or not succeeded:
                self.stop(self.employee)

    def stop(self, employee: Path) -> None:
        """Stop only retained handles with matching birth times, then verify release."""
        self._validate(employee)
        for name in ("frontend", "backend"):
            entry = self.processes.get(name)
            if entry is None:
                continue
            process, owner, output = entry
            if process.poll() is None:
                self.require_identity(owner)
                process.terminate()
                process.wait(timeout=20)
            output.close()
            del self.processes[name]
            self.events.append({"event": "stopped", "service": name, "owner": owner})
        self.assert_stopped(employee)
        self.events.append({"event": "ports-released", "ports": [BACKEND_PORT, FRONTEND_PORT]})


def _writer_blocked(database: Path) -> None:
    """A second SQLite connection must not enter the restoration writer slot."""
    with closing(sqlite3.connect(database, timeout=0)) as writer:
        try:
            writer.execute("BEGIN IMMEDIATE")
        except sqlite3.OperationalError as error:
            if "locked" not in str(error).lower():
                raise
        else:
            writer.rollback()
            raise AssertionError("Concurrent writer escaped the recovery fence")


def _run_crash_child(record: Path, employee: Path, admission: Path) -> tuple[dict[str, int], int]:
    """Wait for the directly owned child even when its birth identity is unavailable."""
    with subprocess.Popen([sys.executable, "-B", str(Path(__file__).resolve()), "--crash-child",
                           str(record), str(employee), str(admission)],
                          creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0) as child:
        started_at_ns = process_started_at_ns(child.pid)
        exit_code = child.wait()
        if started_at_ns is None or started_at_ns < 0:
            raise release.ReleaseError("Crash child identity is unavailable")
        owner = {"pid": child.pid, "started_at_ns": started_at_ns}
    if exit_code != 73:
        raise release.ReleaseError(f"Crash child exited with unexpected code {exit_code}")
    return owner, exit_code


def _preserve_crash_evidence(record: Path, child_owner: dict[str, int], exit_code: int, recovery_sha256: str) -> Path:
    """Keep original crash receipts before resume replaces their owner and state."""
    if (exit_code != 73 or not recovery.valid_process_owner(child_owner)
            or child_owner["started_at_ns"] < 0 or recovery.process_owner_is_active(child_owner)):
        raise release.ReleaseError("Crash child exit or inactive identity is not confirmed")
    raw = {name: release._inside(record.parent / name, record.parent).read_bytes()
           for name in ("recovery-owner.json", "recovery.json")}
    payload = json.loads(raw["recovery.json"])
    digests = {name: hashlib.sha256(contents).hexdigest() for name, contents in raw.items()}
    if (json.loads(raw["recovery-owner.json"]) != child_owner or payload.get("owner") != child_owner
            or payload.get("state") != "RESTORING" or payload.get("restore_intent", {}).get("stage") != "CODE"
            or "DB_INSTALLED" not in payload.get("steps", []) or digests["recovery.json"] != recovery_sha256):
        raise release.ReleaseError("Crash evidence is not bound to the interrupted recovery")
    metadata = {"status": "CAPTURED_BEFORE_RESUME", "child_exit_code": exit_code,
                "child_owner": child_owner, "admission_sha256": payload["admission_sha256"],
                "raw_sha256": digests, "record": str(record), "captured_at_ns": time.time_ns()}
    destination = release._inside(record.parent / "hard-exit-evidence", record.parent)
    destination.mkdir()
    raw["metadata.json"] = json.dumps(metadata, indent=2).encode("utf-8")
    for name, contents in raw.items():
        with (destination / name).open("xb") as stream:
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
    return destination / "metadata.json"


def run(artifacts_path: Path, *, hard_exit: bool) -> Path:
    """Exercise install, migration, guards, process lifetime, failure and paired restore."""
    from alembic import command
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    import sqlalchemy as sa

    artifacts = recovery._load(artifacts_path)
    if not artifacts.get("final_frozen_candidate"):
        raise release.ReleaseError("Final rehearsal requires explicitly frozen artifacts")
    sources = {name: Path(path) for name, path in artifacts["snapshots"].items()}
    prepared = {name: Path(path) for name, path in artifacts["prepared"].items()}
    node = Path(artifacts["node"])
    old_selected_node = Path(artifacts.get("old_node", artifacts["node"]))
    old_receipt = recovery._load(prepared["old"] / "receipt.json")
    if old_receipt.get("status") == "CAPTURED_OPERATIONAL":
        assert old_receipt["source"] == release.files(sources["old"] / "frontend", source=True)
        assert old_receipt["toolchain"] == release._toolchain(old_selected_node)
        assert old_receipt["artifacts"] == release.files(prepared["old"] / "frontend")
    else:
        old_receipt = release.verify(prepared["old"], sources["old"] / "frontend", old_selected_node)
    receipts = {"old": old_receipt,
                "new": release.verify(prepared["new"], sources["new"] / "frontend", node)}
    old_code = release._code_files(sources["old"])
    assert old_code == recovery._load(ROOT / "_attic/runtime/employee-baseline/old-code-manifest.json")
    assert_frozen_source(ROOT, release._code_files(sources["new"]), receipts["new"]["source"])
    baseline = next((ROOT / "_attic/runtime/employee-baseline/backups/sqlite").glob("*.db"))
    baseline_hash = recovery._sha(baseline)
    sandbox = OUTPUT_ROOT / ("run-" + uuid.uuid4().hex[:8])
    employee = sandbox / "employee"
    lifecycle = IsolatedLifecycle(employee)
    lifecycle.assert_stopped(employee)
    for area in ("backend", "scripts"):
        release._copy_files(sources["old"] / area, employee / area, old_code[area])
    release._copy_files(sources["old"], employee, old_code["root"])
    release._copy_files(prepared["old"] / "frontend", employee / "frontend", receipts["old"]["artifacts"])
    old_node = employee / "_attic/runtime/tools/old-node"
    release._copy_files(old_selected_node.parent, old_node, receipts["old"]["toolchain"]["files"])
    config_path = employee / "_attic/runtime/frontend-node-path.txt"
    config_path.write_text(str(old_node / node.name) + "\n", encoding="utf-8")
    old_config = config_path.read_bytes()
    backup = employee / "_attic/runtime/backups/sqlite/old.db"
    backup.parent.mkdir(parents=True)
    recovery.restore_db._copy_live_sqlite(baseline, backup)
    source_manifest = recovery._load(recovery.backup_manifest.manifest_path_for(baseline))
    release._json(recovery.backup_manifest.manifest_path_for(backup),
                  recovery.backup_manifest.build_structural_sqlite_manifest(
                      backup, published_name=backup.name, source_snapshot=source_manifest["source_snapshot"]))
    database = employee / "backend/mes.db"
    recovery.restore_db._copy_live_sqlite(backup, database)
    removed = {"employees": frozenset({"level"})}
    before = preflight.snapshot_existing_rows(database, removed_columns=removed)
    # The operational artifacts remain byte exact. QA builds have a different,
    # explicitly verified proxy destination and are never installed as that artifact.
    qa = {name: Path(path) for name, path in artifacts["qa_prepared"].items()}
    for name in ("old", "new"):
        qa_receipt = recovery._load(qa[name] / "qa-receipt.json")
        assert qa_receipt["source"] == receipts[name]["source"]
        assert qa_receipt["toolchain"] == receipts[name]["toolchain"]
        assert release.files(qa[name] / "frontend") == qa_receipt["artifacts"]
    lifecycle.start_and_query(qa["old"] / "frontend", old_node / node.name, "20260928_0038")
    install_failure = None if hard_exit else rehearse_install_failure(prepared["new"], sources["new"], node, employee)
    record = release.install(prepared["new"], sources["new"] / "frontend", node, employee)
    code_record = release.snapshot_code(sources["new"], sandbox / "manifests")
    release.install_code(sources["new"], record, employee, code_record)
    admission = recovery.begin(record, employee, backup)
    config = Config(str(employee / "backend/alembic.ini"))
    config.set_main_option("script_location", str(employee / "backend/alembic"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database.as_posix()}")
    target_revision = artifacts.get("target_revision", REVISIONS[-1])
    assert ScriptDirectory.from_config(config).get_current_head() == target_revision
    revisions = REVISIONS if target_revision == REVISIONS[-1] else (*REVISIONS, target_revision)
    engine = sa.create_engine(f"sqlite:///{database.as_posix()}")
    try:
        with engine.connect() as migration_connection:
            migration_connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            migration_connection.commit()
            config.attributes["connection"] = migration_connection
            for revision in revisions:
                command.upgrade(config, revision)
                migration_connection.commit()
                assert migration_connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
                migration_connection.commit()
                preflight.assert_existing_rows_unchanged(database, before, frozenset(), removed_columns=removed)
                with closing(sqlite3.connect(database)) as connection:
                    assert connection.execute("SELECT version_num FROM alembic_version").fetchone()[0] == revision
                    assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
    finally:
        engine.dispose()
    with closing(sqlite3.connect(database)) as connection:
        for table, column in (("shipping_requests", "submission_payload_hash"),
                              ("departments", "display_name"), ("transaction_logs", "item_snapshot")):
            assert connection.execute(f'SELECT count(*) FROM "{table}" WHERE "{column}" IS NOT NULL').fetchone()[0] == 0
        if target_revision == "20261008_0044":
            assert connection.execute("SELECT count(*) FROM suppliers WHERE scope IS NULL OR scope != 'warehouse'").fetchone()[0] == 0
    failed_digest = recovery.restore_db._sqlite_snapshot_digest(database)
    guards = []
    crash_evidence = None
    original_stop, original_assert = recovery._stop_services, recovery._assert_stopped
    original_restore = release._restore_previous_code
    try:
        lifecycle.start_and_query(qa["new"] / "frontend", Path(config_path.read_text().strip()), target_revision,
                                  keep_running=not hard_exit)
        recovery._stop_services = lifecycle.stop
        recovery._assert_stopped = lifecycle.assert_stopped
        for label, target, digest in (("wrong-target", sandbox / "wrong-employee", recovery._sha(admission)),
                                     ("admission-hash", employee, "0" * 64)):
            try:
                recovery.recover(record, target, digest)
            except release.ReleaseError:
                guards.append(label)
            else:
                raise AssertionError(f"Guard did not reject {label}")
        if hard_exit:
            child_owner, child_exit = _run_crash_child(record, employee, admission)
            recovery.cutover.compare_exact_database(backup, database)
        else:
            def fail(*args: object, **kwargs: object) -> None:
                original_restore(*args, **kwargs)
                _writer_blocked(database)
                raise OSError("rehearsal injected recovery code-restoration failure")
            release._restore_previous_code = fail
            try:
                recovery.recover(record, employee, recovery._sha(admission))
            except OSError as error:
                assert "injected" in str(error)
            else:
                raise AssertionError("Injected recovery code-restoration failure was not observed")
            assert recovery.restore_db._sqlite_snapshot_digest(database) == failed_digest
        receipt = record.parent / "recovery.json"
        failed_receipt_hash = recovery._sha(receipt)
        if hard_exit:
            crash_evidence = _preserve_crash_evidence(record, child_owner, child_exit, failed_receipt_hash)
        try:
            recovery.recover(record, employee, recovery._sha(admission), resume=True, recovery_sha256="0" * 64)
        except release.ReleaseError:
            guards.append("resume-hash")
        else:
            raise AssertionError("Explicit resume hash was not checked")
        def restore(*args: object, **kwargs: object) -> None:
            original_restore(*args, **kwargs)
            _writer_blocked(database)
            guards.append("concurrent-writer")
        release._restore_previous_code = restore
        recovery.recover(record, employee, recovery._sha(admission), resume=True, recovery_sha256=failed_receipt_hash)
    finally:
        release._restore_previous_code = original_restore
        recovery._stop_services, recovery._assert_stopped = original_stop, original_assert
        lifecycle.stop(employee)
    recovery.cutover.compare_exact_database(backup, database)
    assert release._code_files(employee) == old_code
    assert release.files(employee / "frontend") == receipts["old"]["artifacts"]
    assert config_path.read_bytes() == old_config
    assert release.files(old_node) == receipts["old"]["toolchain"]["files"]
    lifecycle.start_and_query(qa["old"] / "frontend", old_node / node.name, "20260928_0038")
    recovery.cutover.compare_exact_database(backup, database)
    assert recovery._sha(baseline) == baseline_hash
    assert_frozen_source(ROOT, release._code_files(sources["new"]), receipts["new"]["source"])
    result = sandbox / "result.json"
    release._json(result, {
        "status": "PASS", "mode": "hard-exit" if hard_exit else "install-and-recovery-failure",
        "forward_install_failure": install_failure,
        "revisions": ["20260928_0038", *revisions, "20260928_0038"],
        "input_sha256": recovery._sha(artifacts_path), "baseline_sha256": baseline_hash,
        "source_code_sha256": release._digest(release._code_files(sources["new"])),
        "executor_sha256": recovery._sha(Path(__file__)), "guards": guards,
        "hard_exit_evidence": ({"path": str(crash_evidence), "sha256": recovery._sha(crash_evidence)}
                               if crash_evidence is not None else None),
        "lifecycle": lifecycle.events, "old_frontend_exact": True, "old_node_exact": True,
        "preserved_tables": {name: asdict(value) for name, value in before.items()},
        "recovery_receipt_sha256": recovery._sha(receipt),
        "qa_build_distinct_from_operational_build": True, "production_services_or_tasks_changed": False,
    })
    return result


def main() -> None:
    """Keep the private lifecycle adapter out of every production CLI entrypoint."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts", type=Path)
    parser.add_argument("--hard-exit", action="store_true")
    parser.add_argument("--crash-child", nargs=3, type=Path)
    args = parser.parse_args()
    if args.crash_child:
        record, employee, admission = args.crash_child
        lifecycle = IsolatedLifecycle(employee)
        recovery._stop_services = lifecycle.stop
        recovery._assert_stopped = lifecycle.assert_stopped
        def crash(*_args: object, **_kwargs: object) -> None:
            _writer_blocked(employee / "backend/mes.db")
            os._exit(73)
        release._restore_previous_code = crash
        recovery.recover(record, employee, recovery._sha(admission))
    else:
        if args.artifacts is None:
            parser.error("--artifacts is required")
        print(json.dumps({"result": str(run(args.artifacts, hard_exit=args.hard_exit))}))


if __name__ == "__main__":
    main()
