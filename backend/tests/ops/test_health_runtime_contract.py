"""IC-19 health 의미와 운영 consumer의 정적 계약."""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def _read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8-sig")


def test_backend_startup_separates_scheduler_liveness_from_caller_readiness() -> None:
    script = _read("scripts/dev/start-backend.ps1")
    supervisor = script[
        script.index("function Start-BackendSupervisor") : script.index("if ($RuntimeTaskHost)")
    ]
    caller = script[script.index("if ($RuntimeTaskHost)") :]

    assert '$LiveUrl = "http://127.0.0.1:$($Profile.BackendPort)/health/live"' in script
    assert '$ReadyUrl = "http://127.0.0.1:$($Profile.BackendPort)/health/ready"' in script
    assert "Wait-RuntimeHttp200 -Url $LiveUrl -Attempts 90" in supervisor
    assert "Wait-RuntimeHttp200 -Url $ReadyUrl -Attempts 1" in supervisor
    assert "service_not_ready" in supervisor
    assert "throw" not in supervisor[supervisor.index("$ReadyUrl") :]
    assert "Wait-RuntimeHttp200 -Url $ReadyUrl -Attempts 120" in caller
    assert "ready on $ReadyUrl" in caller


def test_frontend_and_e2e_startup_wait_for_backend_readiness() -> None:
    runtime_control = _read("scripts/dev/runtime-control.ps1")
    e2e_setup = _read("frontend/tests/e2e/global-setup.ts")

    frontend_startup = runtime_control[
        runtime_control.index("function Invoke-ProfileFrontendStartup") :
    ]
    assert "/health/ready" in frontend_startup
    assert "/health/live" not in frontend_startup
    assert "Backend is not ready" in frontend_startup
    assert "`${url}/health/ready`" in e2e_setup
    assert "`${url}/health/live`" not in e2e_setup


def test_status_and_watch_report_alive_and_ready_as_distinct_states() -> None:
    status = _read("scripts/dev/status-servers.ps1")
    watch = _read("scripts/dev/watch-service.ps1")

    assert "[string] $LiveUrl" in status
    assert "[string] $ReadyUrl" in status
    assert "alive=$alive" in status
    assert "ready=$ready" in status
    assert "/health/live" in status
    assert "/health/ready" in status
    assert "[watch-backend] ALIVE" in watch
    assert "[watch-backend] NOT_ALIVE" in watch
    assert "[watch-backend] READY" in watch
    assert "[watch-backend] NOT_READY" in watch
    assert "/health/live" in watch
    assert "/health/ready" in watch


def test_restart_probe_stays_on_liveness_and_never_uses_readiness() -> None:
    compose = _read("docker/docker-compose.yml")
    backend_healthcheck = compose[
        compose.index("  backend:") : compose.index("  frontend:")
    ]

    assert "/health/live" in backend_healthcheck
    assert "/health/ready" not in backend_healthcheck
    assert "DB-down" not in backend_healthcheck


def test_employee_sync_and_deploy_health_checks_are_static_readiness_consumers() -> None:
    sync_from = _read("scripts/dev/sync-from-employee-data.ps1")
    sync_to = _read("scripts/dev/sync-to-employee.ps1")

    assert "http://127.0.0.1:8011/health/ready" in sync_from
    assert "http://127.0.0.1:8011/health/live" not in sync_from
    assert "http://127.0.0.1:8010/health/ready" in sync_to
    assert "http://127.0.0.1:8010/health/live" not in sync_to
