from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ops import preflight_30_users
from scripts.ops.backup_retention import REGULAR_BACKUP_NAME, retain_latest_backups


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
        timestamp = time.time() - (100 - index)
        os.utime(backup, (timestamp, timestamp))
        regular.append(backup)
    pre_snapshot = backup_dir / "mes_PRE-maintenance_20000101_000000.sql"
    pre_snapshot.touch()

    removed = retain_latest_backups(backup_dir, suffix=".sql")

    assert set(removed) == set(regular[:2])
    assert all(path.exists() for path in regular[2:])
    assert pre_snapshot.exists()


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

    asyncio.run(preflight_30_users.check_backup_exists())

    assert preflight_30_users.results[-1].level == "WARN"
    assert "백업 파일 없음" in preflight_30_users.results[-1].message


@pytest.mark.parametrize("compose_name", ["docker-compose.yml", "docker-compose.nas.yml"])
def test_docker_backend_persists_the_shared_runtime_root(compose_name: str) -> None:
    compose = (ROOT / "docker" / compose_name).read_text(encoding="utf-8")

    assert "MES_RUNTIME_ROOT: /runtime" in compose
    assert "../_attic/runtime:/runtime" in compose
