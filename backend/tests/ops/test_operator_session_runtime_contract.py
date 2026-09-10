"""운영 launcher가 process-local 인증 상태의 단일-worker 계약을 강제한다."""

import asyncio
import hashlib
import hmac
import json
import re
import time
from pathlib import Path

from starlette.requests import Request
from uvicorn import Config

from app.services import rate_limit


REPO_ROOT = Path(__file__).resolve().parents[3]
START_BACKEND = REPO_ROOT / "scripts" / "dev" / "start-backend.ps1"
BACKEND_DOCKERFILE = REPO_ROOT / "backend" / "Dockerfile"
BACKEND_ENV_EXAMPLE = REPO_ROOT / "backend" / ".env.example"
OPERATIONS = REPO_ROOT / "_attic" / "docs" / "OPERATIONS.md"
README = REPO_ROOT / "README.md"
E2E_GLOBAL_SETUP = REPO_ROOT / "frontend" / "tests" / "e2e" / "global-setup.ts"
FRONTEND_PACKAGE = REPO_ROOT / "frontend" / "package.json"
FRONTEND_PLAYWRIGHT = REPO_ROOT / "frontend" / "playwright.config.ts"
FRONTEND_DEV_WRAPPER = REPO_ROOT / "frontend" / "scripts" / "dev.js"
FRONTEND_NEXT_SERVER = REPO_ROOT / "frontend" / "scripts" / "next-server.js"
FRONTEND_DOCKERFILE = REPO_ROOT / "frontend" / "Dockerfile"
DOCKER_COMPOSE = REPO_ROOT / "docker" / "docker-compose.yml"
DOCKER_COMPOSE_NAS = REPO_ROOT / "docker" / "docker-compose.nas.yml"
ACTIVE_RUNBOOKS = tuple(
    sorted((REPO_ROOT / "_attic" / "docs" / "operations").glob("*.md"))
)
ACTIVE_RUNTIME_INSTRUCTIONS = (README, *ACTIVE_RUNBOOKS)
DIRECT_ASGI_LAUNCH = re.compile(
    r"\b(?:(?:python(?:\.exe)?\s+-m\s+)?(?:uvicorn|gunicorn)\s+\S+:\S+"
    r"|fastapi\s+(?:run|dev)\s+\S+)",
    re.IGNORECASE,
)
WORKER_ARGUMENT = re.compile(
    r"(?:--workers(?:\s+|=)|-w\s+)([^\s`'\"]+)",
    re.IGNORECASE,
)
FORBIDDEN_WILDCARD_PROXY_ENV = re.compile(
    r"\bFORWARDED_ALLOW_IPS\b(?:\s*=|\s+)\s*['\"]?\s*\*",
    re.IGNORECASE,
)


def _single_worker_contract_violations(source: str) -> list[str]:
    violations: list[str] = []
    if re.search(r"\bWEB_CONCURRENCY\b", source, re.IGNORECASE):
        violations.append("WEB_CONCURRENCY override")
    for line_number, line in enumerate(source.splitlines(), start=1):
        if not DIRECT_ASGI_LAUNCH.search(line):
            continue
        if WORKER_ARGUMENT.findall(line) != ["1"]:
            violations.append(
                f"line {line_number}: direct ASGI launch without exactly one worker"
            )
        if "--no-proxy-headers" not in line.lower():
            violations.append(f"line {line_number}: proxy headers are not disabled")
        if "--forwarded-allow-ips" in line.lower():
            violations.append(f"line {line_number}: forwarded proxy trust is configured")
    return violations


def _rate_limit_key_with_proxy_headers_disabled(
    *,
    peer_host: str,
    forwarded_for: str,
    assertion_headers: dict[str, str] | None = None,
) -> str:
    captured: dict[str, str] = {}

    async def app(scope: dict[str, object], receive: object, send: object) -> None:
        del receive, send
        captured["key"] = rate_limit.operator_login_ip_key(Request(scope))

    async def call() -> None:
        scope: dict[str, object] = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/api/operator-session",
            "raw_path": b"/api/operator-session",
            "query_string": b"",
            "headers": [
                (b"x-forwarded-for", forwarded_for.encode("ascii")),
                *[
                    (name.lower().encode("ascii"), value.encode("ascii"))
                    for name, value in (assertion_headers or {}).items()
                ],
            ],
            "client": (peer_host, 50_000),
            "server": ("127.0.0.1", 8011),
        }
        config = Config(app=app, interface="asgi3", log_config=None, proxy_headers=False)
        config.load()
        await config.loaded_app(scope, None, None)  # type: ignore[arg-type]

    asyncio.run(call())
    return captured["key"]


def _signed_proxy_headers(client_ip: str, secret: str, now: int) -> dict[str, str]:
    message = f"v1\n{now}\n{client_ip}".encode()
    return {
        "X-MES-Proxy-Client-IP": client_ip,
        "X-MES-Proxy-Client-IP-Timestamp": str(now),
        "X-MES-Proxy-Client-IP-Signature": hmac.new(
            secret.encode(), message, hashlib.sha256
        ).hexdigest(),
    }


def test_canonical_backend_launcher_forces_one_worker_even_without_reload() -> None:
    source = START_BACKEND.read_text(encoding="utf-8")

    child_command = source.split("$childCommand = @(", 1)[1].split(")", 1)[0]

    assert '"--workers", "1"' in child_command
    assert '"--no-proxy-headers"' in child_command
    assert "--forwarded-allow-ips" not in child_command


def test_container_backend_launcher_forces_one_worker() -> None:
    source = BACKEND_DOCKERFILE.read_text(encoding="utf-8")

    assert '"--workers", "1"' in source
    assert '"--no-proxy-headers"' in source
    assert "--forwarded-allow-ips" not in source


def test_active_runtime_instructions_preserve_the_backend_runtime_invariants() -> None:
    assert ACTIVE_RUNBOOKS
    for instruction_file in ACTIVE_RUNTIME_INSTRUCTIONS:
        source = instruction_file.read_text(encoding="utf-8")

        assert _single_worker_contract_violations(source) == [], instruction_file


def test_e2e_backend_launcher_forces_one_worker_and_disables_proxy_headers() -> None:
    source = E2E_GLOBAL_SETUP.read_text(encoding="utf-8")
    launch_arguments = source.split('["-m", "uvicorn"', 1)[1].split("]", 1)[0]

    assert '"--workers", "1"' in launch_arguments
    assert '"--no-proxy-headers"' in launch_arguments
    assert "--forwarded-allow-ips" not in launch_arguments


def test_runtime_contract_guard_detects_multi_worker_and_environment_bypasses() -> None:
    unsafe_instructions = (
        "python -m uvicorn app.main:app --workers 2",
        "python -m uvicorn app.main:app --workers 1 --workers 2",
        "python -m uvicorn app.main:app --workers 1 --proxy-headers",
        "python -m uvicorn app.main:app --workers 1 --no-proxy-headers "
        "--forwarded-allow-ips 127.0.0.1",
        "gunicorn app.main:app -w 4",
        "WEB_CONCURRENCY=4 powershell ./scripts/dev/start-backend.ps1",
        '$env:WEB_CONCURRENCY = "4"',
    )

    for instruction in unsafe_instructions:
        assert _single_worker_contract_violations(instruction)


def test_explicit_single_worker_ignores_web_concurrency(monkeypatch) -> None:
    monkeypatch.setenv("WEB_CONCURRENCY", "4")

    config = Config(app="app.main:app", workers=1, proxy_headers=False)

    assert config.workers == 1
    assert config.proxy_headers is False


def test_proxy_peer_cannot_rotate_rate_limit_key_with_forwarded_for() -> None:
    first_key = _rate_limit_key_with_proxy_headers_disabled(
        peer_host="127.0.0.1",
        forwarded_for="203.0.113.77",
    )
    rotated_key = _rate_limit_key_with_proxy_headers_disabled(
        peer_host="127.0.0.1",
        forwarded_for="192.0.2.25",
    )

    assert first_key == "operator_login_ip:all:127.0.0.1"
    assert rotated_key == first_key


def test_direct_backend_peer_cannot_spoof_rate_limit_client_ip() -> None:
    key = _rate_limit_key_with_proxy_headers_disabled(
        peer_host="198.51.100.20",
        forwarded_for="203.0.113.77",
    )

    assert key == "operator_login_ip:all:198.51.100.20"


def test_loopback_next_hop_uses_only_custom_server_asserted_client_ip() -> None:
    key = _rate_limit_key_with_proxy_headers_disabled(
        peer_host="127.0.0.1",
        forwarded_for="203.0.113.77",
        assertion_headers={"X-MES-Proxy-Client-IP": "198.51.100.20"},
    )

    assert key == "operator_login_ip:all:198.51.100.20"


def test_direct_backend_peer_ignores_forged_internal_assertion(monkeypatch) -> None:
    monkeypatch.setenv("MES_PROXY_SHARED_SECRET", "s" * 32)
    key = _rate_limit_key_with_proxy_headers_disabled(
        peer_host="198.51.100.20",
        forwarded_for="203.0.113.77",
        assertion_headers={
            "X-MES-Proxy-Client-IP": "192.0.2.25",
            "X-MES-Proxy-Client-IP-Timestamp": str(int(time.time())),
            "X-MES-Proxy-Client-IP-Signature": "forged",
        },
    )

    assert key == "operator_login_ip:all:198.51.100.20"


def test_docker_next_hop_accepts_only_fresh_hmac_assertion(monkeypatch) -> None:
    secret = "s" * 32
    now = int(time.time())
    monkeypatch.setenv("MES_PROXY_SHARED_SECRET", secret)

    signed = _rate_limit_key_with_proxy_headers_disabled(
        peer_host="172.20.0.8",
        forwarded_for="203.0.113.77",
        assertion_headers=_signed_proxy_headers("198.51.100.20", secret, now),
    )
    stale = _rate_limit_key_with_proxy_headers_disabled(
        peer_host="172.20.0.8",
        forwarded_for="203.0.113.77",
        assertion_headers=_signed_proxy_headers("192.0.2.25", secret, now - 300),
    )

    assert signed == "operator_login_ip:all:198.51.100.20"
    assert stale == "operator_login_ip:all:172.20.0.8"


def test_all_canonical_frontend_paths_use_the_raw_socket_next_server() -> None:
    assert FRONTEND_NEXT_SERVER.is_file()
    package_scripts = json.loads(FRONTEND_PACKAGE.read_text(encoding="utf-8"))["scripts"]
    assert "scripts/next-server.js dev" in package_scripts["dev:raw"]
    assert "scripts/next-server.js start" in package_scripts["start"]
    assert not re.search(r"\bnext\s+(?:dev|start)\b", "\n".join(package_scripts.values()))

    dev_wrapper = FRONTEND_DEV_WRAPPER.read_text(encoding="utf-8")
    playwright = FRONTEND_PLAYWRIGHT.read_text(encoding="utf-8")
    next_server = FRONTEND_NEXT_SERVER.read_text(encoding="utf-8")
    assert 'path.join(__dirname, "next-server.js")' in dev_wrapper
    assert "next/dist/bin/next" not in dev_wrapper
    assert "scripts/next-server.js dev" in playwright
    assert "socket.remoteAddress" in next_server
    assert "require(\"next\")" in next_server
    assert 'CMD ["npm", "run", "start"]' in FRONTEND_DOCKERFILE.read_text(
        encoding="utf-8"
    )


def test_docker_frontend_and_backend_require_the_same_unstored_proxy_secret() -> None:
    for compose_file in (DOCKER_COMPOSE, DOCKER_COMPOSE_NAS):
        source = compose_file.read_text(encoding="utf-8")
        assertion = (
            "MES_PROXY_SHARED_SECRET: "
            "${MES_PROXY_SHARED_SECRET:?MES_PROXY_SHARED_SECRET must be set}"
        )
        assert source.count(assertion) == 2
        assert not re.search(r"MES_PROXY_SHARED_SECRET:\s*[A-Za-z0-9]{32,}\s*$", source, re.MULTILINE)


def test_proxy_trust_configuration_never_uses_a_wildcard() -> None:
    assert FORBIDDEN_WILDCARD_PROXY_ENV.search("FORWARDED_ALLOW_IPS=*")
    assert FORBIDDEN_WILDCARD_PROXY_ENV.search('ENV FORWARDED_ALLOW_IPS "*"')
    contract_files = (
        START_BACKEND,
        BACKEND_DOCKERFILE,
        BACKEND_ENV_EXAMPLE,
        OPERATIONS,
        README,
        E2E_GLOBAL_SETUP,
        *ACTIVE_RUNBOOKS,
    )

    for contract_file in contract_files:
        source = contract_file.read_text(encoding="utf-8")
        assert not FORBIDDEN_WILDCARD_PROXY_ENV.search(source), contract_file
