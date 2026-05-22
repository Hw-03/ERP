---
type: file-explanation
source_path: "backend/tests/routers/test_pin_hardening.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_pin_hardening.py — test_pin_hardening.py 설명

## 이 파일은 무엇을 책임지나

`test_pin_hardening.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_make_employee`
- `test_repeated_wrong_pin_eventually_429`
- `test_success_resets_failure_counter`
- `test_few_wrong_attempts_do_not_trip`
- `test_reset_all_clears_state`
- `_make_dept`
- `test_delete_department_accepts_body_pin`
- `test_delete_department_query_pin_still_works`
- `test_delete_department_missing_pin_400`
- `test_delete_department_wrong_body_pin_403`
- 그 외 2개 항목

## 연결되는 파일

- [[ERP/backend/tests/routers/📁_routers]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""WS7 — PIN 하드닝 테스트.

1) 작업자 PIN 검증 실패-시도 레이트 리미터 (429, 성공 시 리셋).
2) 관리자 PIN 을 query 가 아닌 request body 로 전달하는 하위호환 경로.
"""

from __future__ import annotations

import pytest
from app.models import Department, DepartmentEnum, Employee, EmployeeLevelEnum
from app.services import rate_limit
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

    # 10 회 실패 → 403, 그 다음부터 429
    for _ in range(10):
        r = client.post(url, json={"pin": "0000"})
        assert r.status_code == 403, r.text

    r = client.post(url, json={"pin": "0000"})
    assert r.status_code == 429
    assert r.json()["detail"]["code"] == "TOO_MANY_REQUESTS"

    # 올바른 PIN 이어도 차단 상태면 429 (시도 전 검사)
    r = client.post(url, json={"pin": "1234"})
    assert r.status_code == 429


def test_success_resets_failure_counter(db_session, client):
    """성공하면 실패 카운터가 초기화되어 다시 시도 가능."""
```
