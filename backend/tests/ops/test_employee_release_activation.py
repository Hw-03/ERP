"""Friday public activation must not expose an employee write window."""
from __future__ import annotations

import json
import os
from pathlib import Path
import sqlite3
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from scripts.ops import employee_frontend_release as release


def _write(path: Path, content: str = "fixture") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _fixture(tmp_path: Path) -> tuple[Path, Path, Path]:
    employee = tmp_path / "employee"
    _write(employee / "backend" / "code.py")
    _write(employee / "scripts" / "code.py")
    _write(employee / "frontend" / "app.js", "installed frontend")
    database = employee / "backend" / "mes.db"
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE data_revision (id INTEGER PRIMARY KEY, revision INTEGER)")
        connection.execute("INSERT INTO data_revision VALUES (1, 7)")
    admission = tmp_path / "admission.json"
    candidate = tmp_path / "candidate.db"
    original = tmp_path / "original.db"
    for path in (admission, candidate, original):
        _write(path)
    recovery = employee / "_attic" / "runtime" / "frontend-releases" / "test"
    recovery.mkdir(parents=True)
    record = recovery / "journal.json"
    frontend = release.files(employee / "frontend")
    record.write_text(
        json.dumps(
            {
                "employee_root": str(employee),
                "phase": "MIGRATING",
                "code_install_started": True,
                "code_installed": True,
                "incoming_code": release._code_files(employee),
                "incoming_frontend": frontend,
                "installed_frontend": frontend,
                "friday_cutover": {
                    "admission": str(admission),
                    "admission_sha256": "a" * 64,
                    "candidate": str(candidate),
                    "original": str(original),
                },
            }
        ),
        encoding="utf-8",
    )
    return employee, record, database


def _profile(employee: Path) -> release.RuntimeProfile:
    return release.RuntimeProfile(
        root=employee,
        backend_port=8010,
        frontend_port=3000,
        public_url="http://192.168.0.63:3000",
    )


def _writer_is_blocked(database: Path) -> None:
    with sqlite3.connect(database, timeout=0, isolation_level=None) as competitor:
        with pytest.raises(sqlite3.OperationalError, match="locked"):
            competitor.execute("BEGIN IMMEDIATE")


def _writer_is_available(database: Path) -> None:
    with sqlite3.connect(database, timeout=0, isolation_level=None) as competitor:
        competitor.execute("BEGIN IMMEDIATE")
        competitor.execute("ROLLBACK")


def _patch_runtime(
    monkeypatch: pytest.MonkeyPatch,
    employee: Path,
    database: Path,
    events: list[str],
) -> None:
    monkeypatch.setattr(release, "_require_employee_runtime", lambda root: _profile(root))
    monkeypatch.setattr(
        release,
        "_require_employee_database_binding",
        lambda _root, _database: None,
        raising=False,
    )
    monkeypatch.setattr(
        release,
        "_start_backend",
        lambda root: (events.append("start-backend"), _writer_is_blocked(database)),
    )
    monkeypatch.setattr(
        release,
        "_start_frontend",
        lambda root: (events.append("start-frontend"), _writer_is_blocked(database)),
    )
    monkeypatch.setattr(
        release,
        "_verify_activation_http",
        lambda profile: (events.append("health"), _writer_is_blocked(database)),
    )
    monkeypatch.setattr(
        release,
        "_stop_frontend",
        lambda root: (events.append("stop-frontend"), _writer_is_blocked(database)),
    )
    monkeypatch.setattr(
        release,
        "_stop_backend",
        lambda root: (events.append("stop-backend"), _writer_is_blocked(database)),
    )
    monkeypatch.setattr(release, "_ports_closed", lambda profile: True)
    monkeypatch.setattr(release, "_owner_pids", lambda profile: {})


def test_success_holds_writer_fence_through_confirm_then_releases(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    employee, record, database = _fixture(tmp_path)
    events: list[str] = []
    _patch_runtime(monkeypatch, employee, database, events)
    from scripts.ops import friday_profile_cutover as cutover

    def verify(**_kwargs: object) -> dict[str, str]:
        events.append("confirm")
        _writer_is_blocked(database)
        return {"status": "PASS"}

    monkeypatch.setattr(cutover, "verify_admission", verify)

    release.activate_friday(record, employee)

    assert events == [
        "stop-frontend",
        "stop-backend",
        "start-backend",
        "start-frontend",
        "health",
        "confirm",
    ]
    assert json.loads(record.read_text(encoding="utf-8"))["phase"] == "CONFIRMED"
    _writer_is_available(database)


def test_existing_writer_blocks_activation_before_service_start(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    employee, record, database = _fixture(tmp_path)
    events: list[str] = []
    _patch_runtime(monkeypatch, employee, database, events)
    with sqlite3.connect(database, isolation_level=None) as writer:
        writer.execute("BEGIN IMMEDIATE")
        with pytest.raises(release.ReleaseError, match="writer fence"):
            release.activate_friday(record, employee)
        writer.execute("ROLLBACK")

    assert events == []
    assert json.loads(record.read_text(encoding="utf-8"))["phase"] == "MIGRATING"


def test_start_failure_stops_both_services_before_releasing_fence(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    employee, record, database = _fixture(tmp_path)
    events: list[str] = []
    _patch_runtime(monkeypatch, employee, database, events)

    def fail_start(_employee: Path) -> None:
        events.append("start-backend")
        _writer_is_blocked(database)
        raise release.ReleaseError("start failed")

    monkeypatch.setattr(release, "_start_backend", fail_start)

    with pytest.raises(release.ReleaseError, match="start failed"):
        release.activate_friday(record, employee)

    assert events == [
        "stop-frontend",
        "stop-backend",
        "start-backend",
        "stop-frontend",
        "stop-backend",
    ]
    _writer_is_available(database)


def test_health_failure_stops_services_before_releasing_fence(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    employee, record, database = _fixture(tmp_path)
    events: list[str] = []
    _patch_runtime(monkeypatch, employee, database, events)

    def fail_health(_profile: release.RuntimeProfile) -> None:
        events.append("health")
        _writer_is_blocked(database)
        raise release.ReleaseError("health failed")

    monkeypatch.setattr(release, "_verify_activation_http", fail_health)

    with pytest.raises(release.ReleaseError, match="health failed"):
        release.activate_friday(record, employee)

    assert events == [
        "stop-frontend",
        "stop-backend",
        "start-backend",
        "start-frontend",
        "health",
        "stop-frontend",
        "stop-backend",
    ]
    _writer_is_available(database)


def test_confirm_failure_stops_services_before_releasing_fence(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    employee, record, database = _fixture(tmp_path)
    events: list[str] = []
    _patch_runtime(monkeypatch, employee, database, events)

    def reject_confirm(_record: Path, _employee: Path, _phase: str) -> None:
        events.append("confirm")
        _writer_is_blocked(database)
        raise release.ReleaseError("confirm failed")

    monkeypatch.setattr(release, "mark", reject_confirm)

    with pytest.raises(release.ReleaseError, match="confirm failed"):
        release.activate_friday(record, employee)

    assert events[-3:] == ["confirm", "stop-frontend", "stop-backend"]
    assert json.loads(record.read_text(encoding="utf-8"))["phase"] == "MIGRATING"
    _writer_is_available(database)


def test_stop_failure_retries_without_releasing_writer_fence(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    employee, record, database = _fixture(tmp_path)
    events: list[str] = []
    _patch_runtime(monkeypatch, employee, database, events)
    start_attempted = False
    failed_cleanup_stops = 0

    def fail_start(_employee: Path) -> None:
        nonlocal start_attempted
        start_attempted = True
        raise release.ReleaseError("start failed")

    def stop_backend(_employee: Path) -> None:
        nonlocal failed_cleanup_stops
        events.append("stop-backend")
        _writer_is_blocked(database)
        if start_attempted:
            failed_cleanup_stops += 1
        if failed_cleanup_stops == 1:
            raise release.ReleaseError("stop failed")

    def retry_wait(_seconds: float) -> None:
        events.append("retry-wait")
        _writer_is_blocked(database)

    monkeypatch.setattr(release, "_start_backend", fail_start)
    monkeypatch.setattr(release, "_stop_backend", stop_backend)
    monkeypatch.setattr(release.time, "sleep", retry_wait)

    with pytest.raises(release.ReleaseError, match="start failed"):
        release.activate_friday(record, employee)

    assert failed_cleanup_stops == 2
    assert "retry-wait" in events
    error = capsys.readouterr().err
    assert "FRIDAY_ACTIVATION_RECOVERY_REQUIRED=1" in error
    assert f"FRIDAY_ACTIVATION_FENCE_OWNER_PID={os.getpid()}" in error
    _writer_is_available(database)


def test_activation_http_checks_fixed_read_only_endpoints_and_proxy_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    profile = release.RuntimeProfile(
        root=Path(r"C:\ERP-dev"),
        backend_port=8010,
        frontend_port=3000,
        public_url="http://192.168.0.63:3000",
    )
    calls: list[str] = []

    def get(url: str) -> bytes:
        calls.append(url)
        if url.endswith("/api/app-session"):
            return b'{"boot_id":"same-boot"}'
        return b"ok"

    monkeypatch.setattr(release, "_http_get", get)

    release._verify_activation_http(profile)

    assert calls == [
        "http://127.0.0.1:8010/health/live",
        "http://127.0.0.1:8010/health/ready",
        "http://192.168.0.63:3000/mes",
        "http://127.0.0.1:8010/api/app-session",
        "http://192.168.0.63:3000/api/app-session",
    ]


def test_activation_http_rejects_redirected_public_proxy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class RedirectedResponse:
        status = 200

        def __enter__(self) -> RedirectedResponse:
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def geturl(self) -> str:
            return "http://127.0.0.1:8010/api/app-session"

        def read(self) -> bytes:
            return b'{"boot_id":"backend"}'

    monkeypatch.setattr(
        release.urllib_request,
        "urlopen",
        lambda *_args, **_kwargs: RedirectedResponse(),
    )

    with pytest.raises(release.ReleaseError, match="redirect"):
        release._http_get("http://192.168.0.63:3000/api/app-session")


def test_activation_rejects_wrong_profile_or_unbound_journal_before_lock(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    employee, record, database = _fixture(tmp_path)
    monkeypatch.setattr(
        release,
        "_require_employee_runtime",
        lambda _root: (_ for _ in ()).throw(release.ReleaseError("employee profile mismatch")),
    )

    with pytest.raises(release.ReleaseError, match="profile mismatch"):
        release.activate_friday(record, employee)
    _writer_is_available(database)

    monkeypatch.setattr(release, "_require_employee_runtime", lambda root: _profile(root))
    journal = json.loads(record.read_text(encoding="utf-8"))
    journal.pop("friday_cutover")
    record.write_text(json.dumps(journal), encoding="utf-8")
    with pytest.raises(release.ReleaseError, match="Friday binding"):
        release.activate_friday(record, employee)
    _writer_is_available(database)


@pytest.mark.skipif(os.name != "nt", reason="Windows PowerShell launcher contract")
def test_employee_runtime_profile_is_resolved_by_the_installed_fixed_script(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    employee = tmp_path / "employee"
    resolver = employee / "scripts" / "dev" / "resolve-server-profile.ps1"
    _write(
        resolver,
        """
param([string] $RuntimeRepoRoot)
[pscustomobject]@{
    Name = 'employee'
    RepoRoot = [System.IO.Path]::GetFullPath($RuntimeRepoRoot)
    FrontendPort = 3000
    BackendPort = 8010
    BackendInternalUrl = 'http://localhost:8010'
    PublicUrl = 'http://192.168.0.63:3000'
}
""".strip(),
    )
    monkeypatch.setattr(release, "EMPLOYEE_RUNTIME_ROOT", employee)
    monkeypatch.setattr(release, "PROJECT_ROOT", employee)

    assert release._require_employee_runtime(employee) == _profile(employee.resolve())


@pytest.mark.skipif(os.name != "nt", reason="Windows Python launcher contract")
def test_effective_backend_database_must_be_the_canonical_employee_database(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    employee, _record, database = _fixture(tmp_path)
    _write(employee / "backend" / "app" / "__init__.py", "")
    _write(
        employee / "backend" / "app" / "database.py",
        """
import os
from pathlib import Path
DATABASE_URL = os.getenv(
    'DATABASE_URL',
    f"sqlite:///{(Path(__file__).resolve().parents[1] / 'mes.db').as_posix()}",
)
""".strip(),
    )
    monkeypatch.delenv("DATABASE_URL", raising=False)
    release._require_employee_database_binding(employee, database)

    alternate = tmp_path / "alternate.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{alternate.as_posix()}")
    with pytest.raises(release.ReleaseError, match="canonical employee database"):
        release._require_employee_database_binding(employee, database)


def test_activation_rejects_installed_frontend_drift_before_writer_fence(
    tmp_path: Path,
) -> None:
    employee, record, _database = _fixture(tmp_path)
    _write(employee / "frontend" / "app.js", "tampered frontend")

    with pytest.raises(release.ReleaseError, match="frontend changed"):
        release._activation_database(record, employee)


def test_frontend_binding_requires_every_prepared_artifact_but_allows_preserved_config(
    tmp_path: Path,
) -> None:
    employee = tmp_path / "employee"
    _write(employee / "frontend" / "app.js", "prepared")
    prepared = release.files(employee / "frontend")
    _write(employee / "frontend" / ".env.local", "preserved employee config")

    installed = release._bind_installed_frontend(employee, prepared)
    assert installed[".env.local"] == release.files(employee / "frontend")[".env.local"]

    _write(employee / "frontend" / "app.js", "damaged copy")
    with pytest.raises(release.ReleaseError, match="prepared release"):
        release._bind_installed_frontend(employee, prepared)


def test_activate_friday_cli_uses_only_record_and_employee_root(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    employee, record, _database = _fixture(tmp_path)
    calls: list[tuple[Path, Path]] = []
    monkeypatch.setattr(release, "activate_friday", lambda rec, root: calls.append((rec, root)))
    monkeypatch.setattr(
        sys,
        "argv",
        [
            str(Path(release.__file__)),
            "activate-friday",
            "--record",
            str(record),
            "--employee-root",
            str(employee),
        ],
    )

    assert release.main() == 0
    assert calls == [(record, employee)]


def test_raw_confirm_cli_rejects_friday_binding_and_requires_activation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    employee, record, _database = _fixture(tmp_path)
    from scripts.ops import friday_profile_cutover as cutover

    monkeypatch.setattr(cutover, "verify_admission", lambda **_kwargs: {"status": "PASS"})
    monkeypatch.setattr(
        sys,
        "argv",
        [
            str(Path(release.__file__)),
            "confirm",
            "--record",
            str(record),
            "--employee-root",
            str(employee),
        ],
    )

    assert release.main() == 9
    assert "activate-friday" in capsys.readouterr().err
    assert json.loads(record.read_text(encoding="utf-8"))["phase"] == "MIGRATING"
