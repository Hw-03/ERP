---
type: code-note
project: ERP
layer: backend
source_path: backend/tests/routers/test_admin_audit.py
status: active
updated: 2026-04-27
source_sha: 6687edefc516
tags:
  - erp
  - backend
  - test
  - py
---

# test_admin_audit.py

> [!summary] 역할
> 현재 ERP 동작을 회귀 없이 유지하기 위한 자동 테스트 파일이다.

## 원본 위치

- Source: `backend/tests/routers/test_admin_audit.py`
- Layer: `backend`
- Kind: `test`
- Size: `3385` bytes

## 연결

- Parent hub: [[backend/tests/routers/routers|backend/tests/routers]]
- Related: [[backend/backend]]

## 읽는 포인트

- 기능 변경 후 같은 영역 테스트를 먼저 확인한다.
- 테스트가 문서보다 최신 동작을 더 정확히 말해줄 때가 많다.

## 원본 발췌

````python
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
    from app.models import AdminAuditLog

    old = datetime(2024, 1, 1, 0, 0, 0)
    new = datetime(2026, 4, 26, 0, 0, 0)

    db_session.add(AdminAuditLog(
        actor_pin_role="admin", action="bom.create", target_type="bom", created_at=old))
    db_session.add(AdminAuditLog(
        actor_pin_role="admin", action="item.create", target_type="item", created_at=new))
    db_session.commit()

    res = client.get("/api/admin/audit-logs", params={"since": "2025-01-01T00:00:00"})
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["action"] == "item.create"


def test_audit_logs_response_schema_fields(client, db_session):
    """응답 schema 가 audit_id/action/target_type/created_at 를 포함."""
    from app.models import AdminAuditLog

    db_session.add(AdminAuditLog(
        actor_pin_role="admin", action="settings.pin_change",
        target_type="settings", target_id="admin_pin",
        payload_summary="PIN 변경", request_id="abc123",
    ))
    db_session.commit()

    res = client.get("/api/admin/audit-logs")
    rows = res.json()
    assert len(rows) == 1
    row = rows[0]
    for k in ("audit_id", "actor_pin_role", "action", "target_type",
              "target_id", "payload_summary", "request_id", "created_at"):
        assert k in row
    assert row["action"] == "settings.pin_change"
    assert row["request_id"] == "abc123"
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
