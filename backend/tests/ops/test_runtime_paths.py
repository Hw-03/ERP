from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
LOCAL_DEV_WORKTREE_PREFIX = r"c:\erp\.worktrees" + "\\"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ops import backup_manifest, backup_retention, preflight_30_users  # noqa: E402
from scripts.ops.backup_retention import (  # noqa: E402
    REGULAR_BACKUP_NAME,
    retain_latest_backups,
)


def _write_retention_receipt(path: Path) -> None:
    if path.stat().st_size == 0:
        path.write_bytes(b"retention fixture\n")
    engine = "postgresql" if path.suffix == ".sql" else "sqlite"
    manifest = backup_manifest.build_manifest(
        path,
        published_name=path.name,
        evidence={
            "engine": engine,
            "alembic_revision": "head",
            "schema_fingerprint": "0" * 64,
            "data_revision": {
                "revision": 1,
                "updated_at": "2026-09-04T00:00:00Z",
            },
            "snapshot_hash": "1" * 64,
            "oracle_hash": "2" * 64,
            "snapshot_metadata": (
                {"server_version": "16.15"} if engine == "postgresql" else {}
            ),
            "verification": {
                "status": backup_manifest.BackupStatus.PASS.value,
                "schema": "PASS",
                "sqlite_integrity": (
                    "NOT_APPLICABLE" if engine == "postgresql" else "PASS"
                ),
                "foreign_keys": "PASS",
                "inventory": {
                    "contract": backup_manifest.INVENTORY_CONTRACT,
                    "status": "pass",
                    "blocking_count": 0,
                    "warning_count": 0,
                    "checks": [],
                },
            },
        },
        source_snapshot=(
            {"method": "pg_dump", "transaction_snapshot": True}
            if engine == "postgresql"
            else {
                "method": "sqlite3.backup",
                "wal_included": True,
                "journal_mode": "wal",
                "physical_generation": "3" * 64,
            }
        ),
    )
    backup_retention.manifest_path_for(path).write_text(
        json.dumps(manifest),
        encoding="utf-8",
    )


def _run_python(code: str, *, env: dict[str, str] | None = None, cwd: Path = ROOT) -> subprocess.CompletedProcess[str]:
    merged_env = os.environ.copy()
    merged_env.pop("MES_RUNTIME_ROOT", None)
    merged_env.pop("LOG_DIR", None)
    if env:
        merged_env.update(env)
    return subprocess.run(
        [sys.executable, "-c", code],
        cwd=cwd,
        text=True,
        capture_output=True,
        check=False,
        env=merged_env,
    )


def test_runtime_paths_default_to_attic_runtime_categories() -> None:
    code = (
        "from scripts.runtime_paths import runtime_path; "
        "print(runtime_path('backups', 'sqlite')); "
        "print(runtime_path('backups', 'postgres')); "
        "print(runtime_path('logs', 'backend')); "
        "print(runtime_path('logs', 'frontend')); "
        "print(runtime_path('reports', 'load-test'))"
    )

    result = _run_python(code)

    assert result.returncode == 0, result.stderr
    paths = [Path(line) for line in result.stdout.splitlines()]
    assert paths == [
        ROOT / "_attic" / "runtime" / "backups" / "sqlite",
        ROOT / "_attic" / "runtime" / "backups" / "postgres",
        ROOT / "_attic" / "runtime" / "logs" / "backend",
        ROOT / "_attic" / "runtime" / "logs" / "frontend",
        ROOT / "_attic" / "runtime" / "reports" / "load-test",
    ]


def test_runtime_path_rejects_escape_before_creating_anything(tmp_path: Path) -> None:
    runtime_root = tmp_path / "runtime"
    outside = tmp_path / "outside"
    code = (
        "from scripts.runtime_paths import runtime_path; "
        "runtime_path('..', 'outside', create=True)"
    )

    result = _run_python(code, env={"MES_RUNTIME_ROOT": str(runtime_root)})

    assert result.returncode != 0
    assert "outside MES_RUNTIME_ROOT" in result.stderr
    assert not runtime_root.exists()
    assert not outside.exists()


def test_backend_file_log_uses_runtime_root_and_ignores_log_dir(tmp_path: Path) -> None:
    runtime_root = tmp_path / "runtime"
    legacy_log_dir = tmp_path / "legacy-logs"
    code = "from app._logging import get_backend_log_dir; print(get_backend_log_dir())"

    result = _run_python(
        code,
        env={"MES_RUNTIME_ROOT": str(runtime_root), "LOG_DIR": str(legacy_log_dir)},
        cwd=ROOT / "backend",
    )

    assert result.returncode == 0, result.stderr
    assert Path(result.stdout.strip()) == runtime_root / "logs" / "backend"
    assert not legacy_log_dir.exists()


def test_postgres_retention_keeps_latest_ten_regular_dumps_and_preserves_pre_snapshots(tmp_path: Path) -> None:
    backup_dir = tmp_path / "postgres"
    backup_dir.mkdir()
    regular = []
    for index in range(12):
        backup = backup_dir / f"mes_20000101_0000{index:02d}.sql"
        backup.touch()
        _write_retention_receipt(backup)
        timestamp = time.time() - (100 - index)
        os.utime(backup, (timestamp, timestamp))
        regular.append(backup)
    pre_snapshot = backup_dir / "mes_PRE-maintenance_20000101_000000.sql"
    pre_snapshot.touch()

    removed = retain_latest_backups(backup_dir, suffix=".sql")

    assert set(removed) == set(regular[:2])
    assert all(path.exists() for path in regular[2:])
    assert all(
        backup_retention.manifest_path_for(path).exists()
        for path in regular[2:]
    )
    assert all(
        not backup_retention.manifest_path_for(path).exists()
        for path in regular[:2]
    )
    assert pre_snapshot.exists()


def test_retention_tolerates_concurrent_windows_delete_race(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    backup_dir = tmp_path / "sqlite"
    backup_dir.mkdir()
    regular = []
    for index in range(11):
        backup = backup_dir / f"mes_20000101_0000{index:02d}.db"
        backup.touch()
        _write_retention_receipt(backup)
        os.utime(backup, (index + 1, index + 1))
        regular.append(backup)
    victim = regular[0]
    original_replace = backup_retention._durable_replace
    raced = False

    def replace_after_competing_process(source: str | Path, target: str | Path) -> None:
        nonlocal raced
        if Path(source) == victim and not raced:
            raced = True
            victim.unlink()
            raise PermissionError(
                5,
                "another backup process removed the file",
                str(victim),
            )
        original_replace(source, target)

    monkeypatch.setattr(
        backup_retention,
        "_durable_replace",
        replace_after_competing_process,
    )

    removed = retain_latest_backups(backup_dir, suffix=".db")

    assert raced is True
    assert removed == [victim]
    assert not victim.exists()
    assert not backup_retention.manifest_path_for(victim).exists()


@pytest.mark.parametrize(
    "name",
    [
        "mes_20260715_120000.db",
        "mes_20260715_120000_123456_a1b2c3d4e5f60718293a4b5c6d7e8f90.db",
        "mes_20260715_120000.sql",
        "mes_20260715_120000_123456_a1b2c3d4e5f60718293a4b5c6d7e8f90.sql",
    ],
)
def test_regular_backup_name_accepts_legacy_and_unique_names(name: str) -> None:
    assert REGULAR_BACKUP_NAME.fullmatch(name)


def test_preflight_backup_check_ignores_pre_only_snapshots(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "sqlite"
    backup_dir.mkdir(parents=True)
    (backup_dir / "mes_PRE-RESTORE_20260715_120000.db").touch()
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    preflight_30_users.results.clear()

    asyncio.run(preflight_30_users.check_backup_exists("sqlite"))

    assert preflight_30_users.results[-1].level == "WARN"
    assert "백업 파일 없음" in preflight_30_users.results[-1].message


def test_preflight_backup_check_never_passes_a_manifestless_recent_backup(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "sqlite"
    backup_dir.mkdir(parents=True)
    artifact = backup_dir / "mes_20260904_120000.db"
    artifact.write_bytes(b"legacy backup bytes")
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    preflight_30_users.results.clear()

    asyncio.run(preflight_30_users.check_backup_exists("sqlite"))

    assert preflight_30_users.results[-1].level != "PASS"
    assert "LEGACY_UNVERIFIED" in preflight_30_users.results[-1].message


def test_preflight_backup_check_fails_an_invalid_manifest_receipt(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "sqlite"
    backup_dir.mkdir(parents=True)
    artifact = backup_dir / "mes_20260904_120001.db"
    artifact.write_bytes(b"invalid receipt bytes")
    backup_manifest.manifest_path_for(artifact).write_text("{}", encoding="utf-8")
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    preflight_30_users.results.clear()

    asyncio.run(preflight_30_users.check_backup_exists("sqlite"))

    assert preflight_30_users.results[-1].level == "FAIL"
    assert "FAIL" in preflight_30_users.results[-1].message


def test_preflight_backup_check_rejects_an_incomplete_v1_manifest_pair(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "sqlite"
    backup_dir.mkdir(parents=True)
    artifact = backup_dir / "mes_20260904_120002.db"
    artifact.write_bytes(b"verified receipt bytes")
    manifest = {
        "contract": backup_manifest.MANIFEST_CONTRACT,
        "artifact": {
            "name": artifact.name,
            "sha256": backup_manifest.file_sha256(artifact),
            "size": artifact.stat().st_size,
        },
        "database": {"engine": "sqlite"},
        "source_snapshot": {"physical_generation": "a" * 64},
        "verification": {"status": "PASS"},
        "runtime_recovery": backup_manifest.RUNTIME_RECOVERY_CONTRACT,
    }
    backup_manifest.manifest_path_for(artifact).write_text(
        json.dumps(manifest),
        encoding="utf-8",
    )
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    preflight_30_users.results.clear()

    asyncio.run(preflight_30_users.check_backup_exists("sqlite"))

    assert preflight_30_users.results[-1].level == "FAIL"


def test_preflight_backup_check_never_uses_a_different_engine_backup(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "sqlite"
    backup_dir.mkdir(parents=True)
    artifact = backup_dir / "mes_20260904_120003.db"
    artifact.write_bytes(b"newer sqlite bytes")
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    preflight_30_users.results.clear()

    asyncio.run(preflight_30_users.check_backup_exists("postgresql"))

    assert preflight_30_users.results[-1].level != "PASS"


@pytest.mark.parametrize(
    ("script", "args"),
    [
        ("preflight_30_users.py", []),
        ("load_test_30_users.py", ["--dry-run"]),
    ],
)
def test_30_user_scripts_require_an_explicit_target_url(
    script: str,
    args: list[str],
) -> None:
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "ops" / script), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
        env={**os.environ, "PYTHONUTF8": "1"},
    )

    assert result.returncode == 2
    assert "required: --url" in result.stderr


def test_operations_diagnostics_use_profile_aware_healthcheck_command() -> None:
    operations = (ROOT / "_attic" / "docs" / "OPERATIONS.md").read_text(encoding="utf-8")

    assert "scripts\\ops\\healthcheck.bat" in operations
    assert "curl http://127.0.0.1:8011/health/detailed" not in operations


def test_operations_postgres_resume_requires_an_actual_postgres_backup_command() -> None:
    operations = (ROOT / "_attic" / "docs" / "OPERATIONS.md").read_text(encoding="utf-8")

    assert "backup_db.bat --postgres" in operations
    assert "--validation-url" in operations
    assert "PREFLIGHT_BACKUP_PATH" in operations
    assert "PREFLIGHT_MANIFEST_PATH" in operations


def test_start_documentation_describes_resolved_profiles_instead_of_a_fixed_dev_port() -> None:
    for document in (ROOT / "README.md", ROOT / "_attic" / "docs" / "OPERATIONS.md"):
        content = document.read_text(encoding="utf-8")

        assert "resolve-server-profile.ps1" in content
        assert "C:\\ERP-dev" in content
        assert "worktree" in content.lower()


def test_repo_layout_uses_dynamic_process_code_facts() -> None:
    content = (ROOT / "_attic" / "docs" / "REPO_LAYOUT.md").read_text(encoding="utf-8")

    assert "python _attic/backend-scripts/facts.py" in content
    assert "18-code" not in content


def test_start_batch_selects_supported_python_and_probes_timezone_dependency() -> None:
    content = (ROOT / "start.bat").read_text(encoding="utf-8")

    assert "py -3 -c \"import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)\"" in content
    assert 'set "PYTHON_CMD=py -3"' in content
    assert "py -3.11" not in content
    assert "%PYTHON_CMD% -c" in content
    assert "ZoneInfo('Asia/Seoul')" in content
    assert "%PYTHON_CMD% -m pip install -r requirements.txt" in content
    assert "Python.Python.3.13" in content


@pytest.mark.skipif(os.name != "nt", reason="operations batch behavior is Windows cmd-specific")
@pytest.mark.parametrize(
    ("batch_name", "success_marker"),
    [
        ("healthcheck.bat", "[HEALTH] OK"),
        ("reconcile_inventory.bat", "inventory_mismatch_count ="),
    ],
)
def test_ops_batches_treat_a_fake_http_503_as_failure_before_success_flow(
    tmp_path: Path,
    batch_name: str,
    success_marker: str,
) -> None:
    fake_bin = tmp_path / "fake-bin"
    fake_bin.mkdir()
    (fake_bin / "powershell.cmd").write_text(
        "@echo off\n"
        "if /I \"%4\"==\"-File\" (\n"
        "  echo http://fake-backend:8011\n"
        "  exit /b 0\n"
        ")\n"
        "echo 0\n"
        "exit /b 0\n",
        encoding="ascii",
    )
    (fake_bin / "curl.cmd").write_text(
        "@echo off\n"
        "set \"OUT=\"\n"
        ":next\n"
        "if \"%~1\"==\"\" goto write\n"
        "if /I \"%~1\"==\"-f\" exit /b 22\n"
        "if /I \"%~1\"==\"-o\" (\n"
        "  set \"OUT=%~2\"\n"
        "  shift\n"
        ")\n"
        "shift\n"
        "goto next\n"
        ":write\n"
        "if defined OUT > \"%OUT%\" echo {\"inventory_mismatch_count\":0}\n"
        "exit /b 0\n",
        encoding="ascii",
    )
    environment = os.environ.copy()
    environment["PATH"] = f"{fake_bin}{os.pathsep}{environment['PATH']}"
    result = subprocess.run(
        ["cmd.exe", "/d", "/c", str(ROOT / "scripts" / "ops" / batch_name)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
        env=environment,
        encoding="utf-8",
        errors="replace",
    )

    assert result.returncode != 0, result.stdout + result.stderr
    assert success_marker not in result.stdout


def test_windows_ci_runs_the_ops_profile_contract_suite() -> None:
    workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    backend_section = workflow[workflow.index("  backend:"):workflow.index("  windows-ops-profile:")]
    windows_section = workflow[workflow.index("  windows-ops-profile:"):workflow.index("  frontend:")]

    assert "runs-on: windows-latest" in windows_section
    assert "actions/checkout@v4" in windows_section
    assert "actions/setup-python@v5" in windows_section
    assert 'python-version: "3.11"' in windows_section
    assert "pip install -r requirements.txt" in windows_section
    assert (
        'pytest tests/ops/test_runtime_paths.py -q -k '
        '"profile_resolver_test_root or '
        'ops_batches_treat_a_fake_http_503_as_failure_before_success_flow"'
    ) in windows_section
    assert "run: pytest -q" in backend_section
    assert "profile_resolver_test_root" not in backend_section


def test_ops_batches_reference_the_shared_profile_instead_of_a_hardcoded_url() -> None:
    for batch_name in ("healthcheck.bat", "reconcile_inventory.bat"):
        content = (ROOT / "scripts" / "ops" / batch_name).read_text(encoding="utf-8")

        assert "resolve-server-profile.ps1" in content
        assert "BackendInternalUrl" in content
        assert "127.0.0.1:8010" not in content


@pytest.mark.skipif(
    os.name != "nt" or not str(ROOT).lower().startswith(LOCAL_DEV_WORKTREE_PREFIX),
    reason="actual script-location profile is only asserted from the local C:\\ERP development worktree",
)
def test_worktree_profile_output_drives_ops_batches_not_just_a_profile_reference() -> None:
    """Static references alone cannot prove a worktree resolves to the development URL."""
    resolver = ROOT / "scripts" / "dev" / "resolve-server-profile.ps1"
    result = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(resolver),
            "-Property",
            "BackendInternalUrl",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "http://localhost:8011"
    for batch_name in ("healthcheck.bat", "reconcile_inventory.bat"):
        content = (ROOT / "scripts" / "ops" / batch_name).read_text(encoding="utf-8")
        assert "-Property BackendInternalUrl" in content


def _run_profile_resolver(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(ROOT / "scripts" / "dev" / "resolve-server-profile.ps1"),
            *args,
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


@pytest.mark.skipif(os.name != "nt", reason="server profile resolver is a Windows PowerShell script")
@pytest.mark.parametrize(
    ("test_repo_root", "expected_url"),
    [
        (r"C:\ERP", "http://localhost:8011"),
        (r"C:\ERP\.worktrees\github-actions-contract", "http://localhost:8011"),
        (r"C:\ERP\.worktrees\github actions contract", "http://localhost:8011"),
        (r"C:\ERP-dev", "http://localhost:8010"),
    ],
)
def test_profile_resolver_test_root_covers_development_worktree_with_spaces_and_employee_contracts(
    test_repo_root: str,
    expected_url: str,
) -> None:
    result = _run_profile_resolver(
        "-TestRepoRoot",
        test_repo_root,
        "-Property",
        "BackendInternalUrl",
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == expected_url


@pytest.mark.skipif(os.name != "nt", reason="server profile resolver is a Windows PowerShell script")
def test_profile_resolver_test_root_treats_arbitrary_ci_checkout_as_development(
    tmp_path: Path,
) -> None:
    checkout_root = tmp_path / "actions" / "workspace" / "dexcowin-mes"
    checkout_root.mkdir(parents=True)
    result = _run_profile_resolver(
        "-TestRepoRoot",
        str(checkout_root),
        "-Property",
        "BackendInternalUrl",
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "http://localhost:8011"


@pytest.mark.skipif(os.name != "nt", reason="server profile resolver is a Windows PowerShell script")
def test_profile_resolver_runtime_root_rejects_arbitrary_checkout(
    tmp_path: Path,
) -> None:
    checkout_root = tmp_path / "actions" / "workspace" / "dexcowin-mes"
    checkout_root.mkdir(parents=True)
    result = _run_profile_resolver(
        "-RuntimeRepoRoot",
        str(checkout_root),
        "-Property",
        "BackendInternalUrl",
    )

    assert result.returncode != 0
    assert "Unknown DEXCOWIN MES runtime root" in result.stderr


@pytest.mark.skipif(os.name != "nt", reason="server profile resolver is a Windows PowerShell script")
def test_profile_resolver_without_test_override_rejects_unknown_runtime_root(
    tmp_path: Path,
) -> None:
    copied_root = tmp_path / "unknown-runtime"
    copied_script = copied_root / "scripts" / "dev" / "resolve-server-profile.ps1"
    copied_script.parent.mkdir(parents=True)
    shutil.copy2(ROOT / "scripts" / "dev" / "resolve-server-profile.ps1", copied_script)

    result = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(copied_script),
            "-Property",
            "BackendInternalUrl",
        ],
        cwd=copied_root,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode != 0
    assert "Unknown DEXCOWIN MES runtime root" in result.stderr


def test_ops_batches_fail_fast_before_curl_when_profile_url_is_empty() -> None:
    for batch_name in ("healthcheck.bat", "reconcile_inventory.bat"):
        content = (ROOT / "scripts" / "ops" / batch_name).read_text(encoding="utf-8")

        assert 'set "BACKEND_URL="' in content
        assert 'if not defined BACKEND_URL (' in content
        assert "ERROR: server profile did not provide a backend URL." in content
        assert content.index('if not defined BACKEND_URL (') < content.index("curl -f -s")


@pytest.mark.parametrize("compose_name", ["docker-compose.yml", "docker-compose.nas.yml"])
def test_docker_backend_persists_the_shared_runtime_root(compose_name: str) -> None:
    compose = (ROOT / "docker" / compose_name).read_text(encoding="utf-8")

    assert "MES_RUNTIME_ROOT: /runtime" in compose
    assert "../_attic/runtime:/runtime" in compose
