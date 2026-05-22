---
type: file-explanation
source_path: "backend/tests/routers/test_admin_audit.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_admin_audit.py — test_admin_audit.py 설명

## 이 파일은 무엇을 책임지나

`test_admin_audit.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `test_audit_logs_empty_returns_empty_list`
- `test_audit_logs_limit_bound`
- `test_audit_logs_action_prefix_filter`
- `test_audit_logs_target_type_filter`
- `test_audit_logs_since_filter`
- `test_audit_logs_response_schema_fields`

## 연결되는 파일

- [[ERP/backend/tests/routers/📁_routers]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""GET /api/admin/audit-logs smoke 테스트."""

from __future__ import annotations

from datetime import datetime, timedelta


def test_audit_logs_empty_returns_empty_list(client):
    res = client.get("/api/admin/audit-logs")
    assert res.status_code == 200
    assert res.json() == []


def test_audit_logs_limit_bound(client):
    """A-1 통일: limit le=2000 허용."""
    res = client.get("/api/admin/audit-logs", params={"limit": 2000})
    assert res.status_code == 200
    res2 = client.get("/api/admin/audit-logs", params={"limit": 2001})
    assert res2.status_code == 422


def test_audit_logs_action_prefix_filter(client, db_session):
    """action='bom.' 으로 prefix 필터 동작."""
    from app.models import AdminAuditLog

    db_session.add_all([
        AdminAuditLog(actor_pin_role="admin", action="bom.create", target_type="bom"),
        AdminAuditLog(actor_pin_role="admin", action="bom.update", target_type="bom"),
        AdminAuditLog(actor_pin_role="admin", action="item.create", target_type="item"),
    ])
    db_session.commit()

    res = client.get("/api/admin/audit-logs", params={"action": "bom."})
    assert res.status_code == 200
    actions = [row["action"] for row in res.json()]
    assert sorted(actions) == ["bom.create", "bom.update"]


def test_audit_logs_target_type_filter(client, db_session):
    from app.models import AdminAuditLog

    db_session.add_all([
        AdminAuditLog(actor_pin_role="admin", action="bom.create", target_type="bom"),
        AdminAuditLog(actor_pin_role="admin", action="item.create", target_type="item"),
    ])
    db_session.commit()

    res = client.get("/api/admin/audit-logs", params={"target_type": "bom"})
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["target_type"] == "bom"


def test_audit_logs_since_filter(client, db_session):
```
