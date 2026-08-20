"""WS7 — PIN 하드닝 테스트.

1) 작업자 PIN 검증 실패-시도 레이트 리미터 (429, 성공 시 리셋).
2) 관리자 PIN 을 query 가 아닌 request body 로 전달하는 하위호환 경로.
"""

from __future__ import annotations

import ast
from concurrent.futures import ThreadPoolExecutor
import inspect
from pathlib import Path
from threading import Barrier

from app.dependencies import warehouse_manager
from app.models import Department, DepartmentEnum, Employee, EmployeeLevelEnum
from app.routers import employees
from app.routers.inventory import transactions
from app.services import handover as handover_svc
from app.services import rate_limit
from app.services import sr_approval as sr_approval_svc
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin


def _make_employee(db, *, name="홍길동", code="E77", pin_hash=DEFAULT_PIN_HASH):
    emp = Employee(
        employee_code=code,
        name=name,
        role="테스트/사원",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        display_order=77,
        is_active="true",
        pin_hash=pin_hash,
        pin_requires_change=False,
    )
    db.add(emp)
    db.flush()
    return emp


# ───────────────────────── rate limiter ─────────────────────────


def test_repeated_wrong_pin_eventually_429(db_session, client):
    """실패가 임계치(10) 에 도달하면 429 를 반환한다."""
    emp = _make_employee(db_session, pin_hash=hash_pin("1234"))
    db_session.commit()
    url = f"/api/employees/{emp.employee_id}/verify-pin"

    # 10 회 실패 → 401, 그 다음부터 429
    for _ in range(10):
        r = client.post(url, json={"pin": "0000"})
        assert r.status_code == 401, r.text

    r = client.post(url, json={"pin": "0000"})
    assert r.status_code == 429
    assert r.json()["detail"]["code"] == "TOO_MANY_REQUESTS"

    # 올바른 PIN 이어도 차단 상태면 429 (시도 전 검사)
    r = client.post(url, json={"pin": "1234"})
    assert r.status_code == 429


def test_success_resets_failure_counter(db_session, client):
    """성공은 서버가 확인한 직원 credential의 실패 예산을 초기화한다."""
    emp = _make_employee(db_session, pin_hash=hash_pin("1234"))
    db_session.commit()
    url = f"/api/employees/{emp.employee_id}/verify-pin"

    for _ in range(5):
        assert client.post(url, json={"pin": "0000"}).status_code == 401

    # 성공 → 리셋
    assert client.post(url, json={"pin": "1234"}).status_code == 200
    assert not any(
        key.startswith(f"operator_pin:{emp.employee_id}:")
        for key in rate_limit._failures
    )

    # 같은 직원도 리셋 뒤 새 실패 예산 10회를 사용할 수 있다.
    for _ in range(rate_limit.DEFAULT_MAX_FAILURES):
        assert client.post(url, json={"pin": "0000"}).status_code == 401
    # 동일 직원 credential의 11번째 시도는 차단된다.
    assert client.post(url, json={"pin": "0000"}).status_code == 429


def test_few_wrong_attempts_do_not_trip(db_session, client):
    """소수 실패(테스트 일반 패턴)는 차단하지 않는다 — 테스트 안전성."""
    emp = _make_employee(db_session, pin_hash=DEFAULT_PIN_HASH)
    db_session.commit()
    url = f"/api/employees/{emp.employee_id}/verify-pin"

    assert client.post(url, json={"pin": "9999"}).status_code == 401
    assert client.post(url, json={"pin": "8888"}).status_code == 401
    # 기본 PIN은 flag가 잘못 내려가 있어도 작업 세션 대신 변경 challenge만 발급한다.
    assert client.post(url, json={"pin": "0000"}).status_code == 409


def test_reset_all_clears_state():
    """reset_all() 은 모든 키 상태를 비운다 (fixture 훅)."""
    key = "verify_pin:unit-test"
    for _ in range(rate_limit.DEFAULT_MAX_FAILURES):
        rate_limit.record_failure(key)
    assert rate_limit.is_blocked(key) is True
    rate_limit.reset_all()
    assert rate_limit.is_blocked(key) is False


def test_rate_limit_evicts_expired_keys_and_caps_tracked_keys(monkeypatch) -> None:
    now = 1000.0
    monkeypatch.setattr(rate_limit, "MAX_TRACKED_KEYS", 4)
    monkeypatch.setattr(rate_limit, "_now", lambda: now)

    for index in range(10):
        assert rate_limit.admit_attempt(f"key-{index}") is True

    assert len(rate_limit._failures) <= 4

    now += rate_limit.DEFAULT_WINDOW_SECONDS + 1
    assert rate_limit.admit_attempt("fresh-key") is True
    assert set(rate_limit._failures) == {"fresh-key"}


def test_concurrent_attempt_admission_is_atomic_at_ten() -> None:
    key = "operator_pin:concurrent-unit-test:127.0.0.1"
    barrier = Barrier(20)

    def admit() -> bool:
        barrier.wait()
        return rate_limit.admit_attempt(key)

    with ThreadPoolExecutor(max_workers=20) as pool:
        admitted = list(pool.map(lambda _index: admit(), range(20)))

    assert admitted.count(True) == 10
    assert admitted.count(False) == 10


def test_operator_step_up_services_cannot_call_raw_verify_pin() -> None:
    expected_calls = {
        warehouse_manager.__name__: 1,
        employees.__name__: 1,
        transactions.__name__: 1,
        handover_svc.__name__: 1,
        sr_approval_svc.__name__: 5,
    }

    for module in (
        warehouse_manager,
        employees,
        transactions,
        handover_svc,
        sr_approval_svc,
    ):
        tree = ast.parse(inspect.getsource(module))
        raw_calls = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "verify_pin"
        ]
        guarded_calls = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id == "rate_limit"
            and node.func.attr == "verify_operator_pin"
        ]

        assert raw_calls == []
        assert len(guarded_calls) == expected_calls[module.__name__]


def test_production_raw_verify_pin_call_surface_is_exact() -> None:
    app_root = Path(__file__).resolve().parents[2] / "app"
    raw_consumers: list[tuple[str, str]] = []

    for source_path in app_root.rglob("*.py"):
        tree = ast.parse(source_path.read_text(encoding="utf-8-sig"))
        function_stack: list[str] = []

        class RawVerifyPinVisitor(ast.NodeVisitor):
            def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
                function_stack.append(node.name)
                self.generic_visit(node)
                function_stack.pop()

            visit_AsyncFunctionDef = visit_FunctionDef

            def visit_Call(self, node: ast.Call) -> None:
                is_raw_call = (
                    isinstance(node.func, ast.Name) and node.func.id == "verify_pin"
                ) or (
                    isinstance(node.func, ast.Attribute)
                    and node.func.attr == "verify_pin"
                )
                if is_raw_call:
                    raw_consumers.append(
                        (
                            source_path.relative_to(app_root).as_posix(),
                            function_stack[-1] if function_stack else "<module>",
                        )
                    )
                self.generic_visit(node)

        RawVerifyPinVisitor().visit(tree)

    assert sorted(raw_consumers) == [
        ("routers/settings.py", "_matches_admin_pin_value"),
        ("services/rate_limit.py", "verify_operator_pin"),
    ]


# ───────────────────────── body PIN (하위호환) ─────────────────────────


def _make_dept(db, name="삭제대상부서"):
    dept = Department(name=name, display_order=50, is_active=True)
    db.add(dept)
    db.flush()
    return dept


def test_delete_department_accepts_body_pin(db_session, client):
    """DELETE /departments/{id} 가 body 의 PIN 을 받는다 (query 없이)."""
    dept = _make_dept(db_session)
    db_session.commit()

    resp = client.request(
        "DELETE", f"/api/departments/{dept.id}", json={"pin": "0000"}
    )
    assert resp.status_code == 204, resp.text


def test_delete_department_query_pin_is_rejected(db_session, client):
    """access log에 남는 query string PIN은 삭제 인증에 쓰지 않는다."""
    dept = _make_dept(db_session, name="레거시쿼리부서")
    db_session.commit()

    resp = client.delete(f"/api/departments/{dept.id}?pin=0000")
    assert resp.status_code == 400, resp.text
    assert db_session.get(Department, dept.id) is not None


def test_delete_department_missing_pin_400(db_session, client):
    """body·query 어디에도 PIN 이 없으면 400."""
    dept = _make_dept(db_session, name="핀없음부서")
    db_session.commit()

    resp = client.request("DELETE", f"/api/departments/{dept.id}", json={})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "BAD_REQUEST"


def test_delete_department_wrong_body_pin_403(db_session, client):
    dept = _make_dept(db_session, name="잘못된핀부서")
    db_session.commit()

    resp = client.request(
        "DELETE", f"/api/departments/{dept.id}", json={"pin": "9999"}
    )
    assert resp.status_code == 403


def test_integrity_inventory_get_accepts_body_pin(client, make_item):
    """GET /settings/integrity/inventory 가 body PIN 을 받는다."""
    from decimal import Decimal

    make_item(name="정합성 body GET", warehouse_qty=Decimal("4"))
    resp = client.request(
        "GET", "/api/settings/integrity/inventory", json={"pin": "0000"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["checked"] == 1


def test_integrity_inventory_get_missing_pin_400(client):
    resp = client.request("GET", "/api/settings/integrity/inventory", json={})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "BAD_REQUEST"
