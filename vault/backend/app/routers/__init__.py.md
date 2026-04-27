---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/__init__.py
status: active
updated: 2026-04-27
source_sha: da39a3ee5e6b
tags:
  - erp
  - backend
  - router
  - py
---

# __init__.py

> [!summary] 역할
> FastAPI 라우터 계층의 `__init__` 영역 API 엔드포인트를 담당한다.

## 원본 위치

- Source: `backend/app/routers/__init__.py`
- Layer: `backend`
- Kind: `router`
- Size: `0` bytes

## 연결

- Parent hub: [[backend/app/routers/routers|backend/app/routers]]
- Related: [[backend/backend]]

## 읽는 포인트

- 라우터는 API 표면이다. 요청/응답 계약은 `schemas.py`와 함께 확인한다.
- DB 변경은 서비스/모델/테스트까지 같이 본다.

## 원본 발췌

````python

````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
