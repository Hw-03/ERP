from __future__ import annotations

import json
import ast
import os
import subprocess
import sys
import shutil

import pytest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def _text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8-sig")


def test_node_20_is_declared_and_all_e2e_entrypoints_share_the_guard() -> None:
    package = json.loads(_text("frontend/package.json"))
    verify_e2e = _text("scripts/dev/verify_e2e.ps1")
    verify_local = _text("scripts/dev/verify_local.ps1")

    assert (ROOT / ".nvmrc").read_text(encoding="ascii").strip() == "20"
    assert package["engines"]["node"] == ">=20 <21"
    assert _text(".github/workflows/ci.yml").count("node-version-file: .nvmrc") == 2
    assert package["scripts"]["test:e2e"].startswith("node scripts/require-node-20.mjs && ")
    assert package["scripts"]["test:e2e:headed"].startswith("node scripts/require-node-20.mjs && ")
    assert "npm run test:e2e" in verify_e2e
    assert "npx playwright test" not in verify_e2e
    assert "function Assert-Node20" in verify_local
    assert "Assert-Node20" in verify_local[verify_local.index("function Invoke-Gate") :]


def test_ci_runs_the_ic20_contract_suite() -> None:
    assert "backend/tests/ops/test_ic20_verification_contract.py" in _text(".github/workflows/ci.yml")


def test_frontend_unit_and_e2e_types_are_blocking_locally_and_in_ci() -> None:
    package = json.loads(_text("frontend/package.json"))
    verify_local = _text("scripts/dev/verify_local.ps1")
    policy = _text("scripts/dev/verification_policy.py")
    ci = _text(".github/workflows/ci.yml")

    assert package["scripts"]["typecheck:app"] == "tsc --noEmit"
    assert "typecheck-baseline.mjs tsconfig.tests.json" in package["scripts"]["typecheck:tests"]
    assert package["scripts"]["typecheck:e2e"] == "tsc --project tsconfig.e2e.json"
    assert (ROOT / "frontend/tsconfig.tests.json").is_file()
    assert (ROOT / "frontend/tsconfig.e2e.json").is_file()
    assert '"frontend-test-typecheck"' in policy
    assert '"frontend-e2e-typecheck"' in policy
    assert '"frontend-test-typecheck"' in verify_local
    assert '"frontend-e2e-typecheck"' in verify_local
    assert "npm run typecheck:tests" in ci
    assert "npm run typecheck:e2e" in ci
    assert "verify-test-typecheck-manifest.mjs" in package["scripts"]["typecheck:tests"]
    assert '"scripts/**/*.test.*"' in _text("frontend/tsconfig.tests.json")


def test_e2e_and_shipping_smoke_are_required_ci_evidence() -> None:
    ci = _text(".github/workflows/ci.yml")

    e2e_job = ci[ci.index("  e2e:") :]
    assert "continue-on-error: true" not in e2e_job
    assert "run: npm run test:e2e" in e2e_job
    assert (ROOT / "frontend/tests/e2e/shipping-request-to-prep.spec.ts").is_file()


def test_postgres_job_bootstraps_head_and_runs_real_two_connection_tests() -> None:
    ci = _text(".github/workflows/ci.yml")

    assert "  postgres-concurrency:" in ci
    postgres_job = ci[ci.index("  postgres-concurrency:") : ci.index("  frontend:")]
    assert "services:" in postgres_job
    assert "postgres:" in postgres_job
    assert "TEST_POSTGRES_URL:" in postgres_job
    assert "DATABASE_URL:" in postgres_job
    assert "python bootstrap_db.py --all" in postgres_job
    assert "python bootstrap_db.py --check" in postgres_job
    assert "python scripts/verify_postgres_concurrency.py" in postgres_job
    assert "DEXCOWIN_POSTGRES_TEST_ACK: ALLOW_TEST_DB_MUTATION" in postgres_job
    assert "test_postgres_head_public_tables_serialize_two_connections" not in postgres_job
    assert "continue-on-error" not in postgres_job

    runner = _text("backend/scripts/verify_postgres_concurrency.py")
    assert "test_operator_session_postgres.py" in runner
    assert "test_postgres_foreign_operator_preflight_stays_fail_closed_after_rotation" in runner
    assert "test_postgres_same_cookie_login_then_logout_leaves_no_reissued_session" in runner
    assert "test_postgres_same_cookie_logout_then_login_fails_after_revalidation" in runner

    verify_local = _text("scripts/dev/verify_local.ps1")
    assert "backend-postgres-concurrency" in verify_local
    assert "python scripts/verify_postgres_concurrency.py" in verify_local


def test_postgres_required_evidence_uses_alembic_head_public_tables() -> None:
    test_source = _text("backend/tests/services/test_warehouse_map_postgres_locking.py")
    module = ast.parse(test_source)
    function = next(
        node for node in module.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "test_postgres_head_public_tables_serialize_two_connections"
    )
    body = ast.get_source_segment(test_source, function) or ""

    assert "alembic_version" in body
    assert "ScriptDirectory" in test_source
    assert "CREATE SCHEMA" not in body
    assert "CREATE TABLE" not in body
    assert "Session(engine)" in body


def test_postgres_lifecycle_evidence_uses_the_production_verified_route_boundary() -> None:
    test_source = _text("backend/tests/concurrency/test_operator_session_postgres.py")
    module = ast.parse(test_source)
    function = next(
        node
        for node in module.body
        if isinstance(node, ast.FunctionDef)
        and node.name
        == "test_postgres_lifecycle_revoke_and_verified_mutation_share_lock_order"
    )
    body = ast.get_source_segment(test_source, function) or ""
    runner = _text("backend/scripts/verify_postgres_concurrency.py")

    assert "_get_employee_for_lifecycle_change" not in test_source
    assert "require_verified_actor(" in body
    assert "employees_router._locked_lifecycle_target(" in body
    assert "employees_router.update_employee(" in body
    assert (
        "test_operator_session_postgres.py::"
        "test_postgres_lifecycle_revoke_and_verified_mutation_share_lock_order"
    ) in runner


def test_postgres_runner_reports_not_verified_or_fails_closed_without_url() -> None:
    script = ROOT / "backend/scripts/verify_postgres_concurrency.py"
    env = os.environ.copy()
    env.pop("TEST_POSTGRES_URL", None)
    env.pop("DATABASE_URL", None)
    env.pop("DEXCOWIN_REQUIRE_POSTGRES", None)
    optional = subprocess.run([sys.executable, str(script)], cwd=ROOT / "backend", env=env, text=True, capture_output=True)
    assert optional.returncode != 0
    assert "NOT_VERIFIED" in optional.stdout

    env["DEXCOWIN_REQUIRE_POSTGRES"] = "1"
    required = subprocess.run([sys.executable, str(script)], cwd=ROOT / "backend", env=env, text=True, capture_output=True)
    assert required.returncode != 0
    assert "NOT_VERIFIED" in required.stdout


def test_verification_policy_job_installs_postgres_runner_dependencies() -> None:
    ci = _text(".github/workflows/ci.yml")
    job = ci[ci.index("  verification-runtime:") : ci.index("  backend:")]

    assert "working-directory: backend" in job
    assert "pip install -r requirements.txt" in job


def test_postgres_runner_rejects_missing_ack_and_non_test_database_before_connect() -> None:
    script = ROOT / "backend/scripts/verify_postgres_concurrency.py"
    base = os.environ.copy()
    base["TEST_POSTGRES_URL"] = "postgresql://u:p@127.0.0.1:1/mes_test"
    base["DATABASE_URL"] = base["TEST_POSTGRES_URL"]
    base.pop("DEXCOWIN_POSTGRES_TEST_ACK", None)
    missing_ack = subprocess.run([sys.executable, str(script)], cwd=ROOT / "backend", env=base, text=True, capture_output=True)
    assert missing_ack.returncode != 0
    assert "ACK" in missing_ack.stderr

    base["DEXCOWIN_POSTGRES_TEST_ACK"] = "ALLOW_TEST_DB_MUTATION"
    base["TEST_POSTGRES_URL"] = "postgresql://u:p@127.0.0.1:1/production"
    base["DATABASE_URL"] = base["TEST_POSTGRES_URL"]
    unsafe_name = subprocess.run([sys.executable, str(script)], cwd=ROOT / "backend", env=base, text=True, capture_output=True)
    assert unsafe_name.returncode != 0
    assert "test database name" in unsafe_name.stderr


@pytest.mark.skipif(sys.platform != "win32", reason="PowerShell runtime contract is Windows-only")
def test_verify_local_cannot_report_green_when_postgres_is_not_verified(tmp_path: Path) -> None:
    powershell = shutil.which("powershell.exe")
    assert powershell
    gate = tmp_path / "postgres-gate.json"
    gate.write_text(json.dumps({
        "id": "backend-postgres-concurrency",
        "area": "backend",
        "kind": "contract",
        "reason": "fail closed contract",
        "files": [],
    }), encoding="utf-8")
    env = os.environ.copy()
    for key in ("TEST_POSTGRES_URL", "DATABASE_URL", "DEXCOWIN_POSTGRES_TEST_ACK"):
        env.pop(key, None)
    result = subprocess.run(
        [powershell, "-ExecutionPolicy", "Bypass", "-File", str(ROOT / "scripts/dev/verify_local.ps1"), "-InternalGateFile", str(gate)],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
    )
    assert result.returncode != 0
    assert "NOT_VERIFIED" in result.stdout + result.stderr


def test_backend_ruff_and_mypy_baseline_are_required_locally_and_in_ci() -> None:
    requirements = _text("backend/requirements-dev.txt")
    policy = _text("scripts/dev/verification_policy.py")
    verify_local = _text("scripts/dev/verify_local.ps1")
    ci = _text(".github/workflows/ci.yml")

    assert "ruff==" in requirements
    assert "mypy==" in requirements
    assert (ROOT / "backend/pyproject.toml").is_file()
    assert '"backend-ruff"' in policy
    assert '"backend-mypy"' in policy
    assert "python -m ruff check" in verify_local
    assert "python -m mypy" in verify_local
    assert "python -m ruff check" in ci
    assert "python -m mypy" in ci
