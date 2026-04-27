---
type: code-note
project: ERP
layer: backend
source_path: backend/app/services/__init__.py
status: active
updated: 2026-04-27
source_sha: 156251c3f537
tags:
  - erp
  - backend
  - service
  - py
---

# __init__.py

> [!summary] 역할
> 라우터에서 직접 처리하기 무거운 `__init__` 비즈니스 로직과 계산 책임을 분리해 담는다.

## 원본 위치

- Source: `backend/app/services/__init__.py`
- Layer: `backend`
- Kind: `service`
- Size: `47` bytes

## 연결

- Parent hub: [[backend/app/services/services|backend/app/services]]
- Related: [[backend/backend]]

## 읽는 포인트

- 서비스는 라우터보다 안쪽의 업무 규칙을 담는다.
- 재고 수량이나 BOM 계산은 화면 표시와 실제 거래가 일치해야 한다.

## 원본 발췌

````python
"""Service layer for the X-Ray ERP backend."""
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
