---
type: code-note
project: ERP
layer: backend
source_path: backend/requirements.txt
status: active
updated: 2026-04-27
source_sha: 2ae926058177
tags:
  - erp
  - backend
  - source-file
  - txt
---

# requirements.txt

> [!summary] 역할
> 원본 프로젝트의 `requirements.txt` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `backend/requirements.txt`
- Layer: `backend`
- Kind: `source-file`
- Size: `265` bytes

## 연결

- Parent hub: [[backend/backend|backend]]
- Related: [[backend/backend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````text
fastapi==0.111.0
uvicorn[standard]==0.29.0
sqlalchemy>=2.0.31
psycopg2-binary>=2.9.10
alembic==1.13.1
python-dotenv==1.0.1
pydantic[email]>=2.9.0
python-multipart==0.0.9
openpyxl==3.1.5

# Testing (Phase 5.3-D)
pytest>=8.0
pytest-cov>=5.0
httpx>=0.27
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
