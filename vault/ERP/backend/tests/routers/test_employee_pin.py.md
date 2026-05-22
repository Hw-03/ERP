---
type: file-explanation
source_path: "backend/tests/routers/test_employee_pin.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_employee_pin.py — test_employee_pin.py 설명

## 이 파일은 무엇을 책임지나

`test_employee_pin.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_make_employee`
- `test_default_pin_is_0000`
- `test_null_pin_hash_uses_default`
- `test_verify_pin_success`
- `test_verify_pin_wrong_fails`
- `test_inactive_employee_blocked`
- `test_employee_not_found`

## 연결되는 파일

- [[ERP/backend/tests/routers/📁_routers]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""직원 PIN 검증 테스트.

작업자 식별용 PIN 로그인 — 실제 보안 인증이 아님.
"""

from __future__ import annotations

import pytest
from app.models import DepartmentEnum, Employee, EmployeeLevelEnum
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin


def _make_employee(db, *, name="홍길동", code="E99", pin_hash=None, is_active="true"):
    emp = Employee(
        employee_code=code,
        name=name,
        role="테스트/사원",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        display_order=99,
        is_active=is_active,
        pin_hash=pin_hash,
    )
    db.add(emp)
    db.flush()
    return emp


def test_default_pin_is_0000(db_session, client):
    """pin_hash가 설정된 직원은 0000으로 검증된다."""
    emp = _make_employee(db_session, pin_hash=DEFAULT_PIN_HASH)
    db_session.commit()

    resp = client.post(f"/api/employees/{emp.employee_id}/verify-pin", json={"pin": "0000"})
    assert resp.status_code == 200
    assert resp.json()["employee_id"] == str(emp.employee_id)


def test_null_pin_hash_uses_default(db_session, client):
    """pin_hash가 None이면 기본 PIN 0000으로 검증된다."""
    emp = _make_employee(db_session, pin_hash=None)
    db_session.commit()

    resp = client.post(f"/api/employees/{emp.employee_id}/verify-pin", json={"pin": "0000"})
    assert resp.status_code == 200


def test_verify_pin_success(db_session, client):
    """올바른 PIN은 200과 직원 정보를 반환한다."""
    emp = _make_employee(db_session, pin_hash=hash_pin("1234"))
    db_session.commit()

    resp = client.post(f"/api/employees/{emp.employee_id}/verify-pin", json={"pin": "1234"})
    assert resp.status_code == 200
    data = resp.json()
```
