---
type: code-note
project: ERP
layer: backend
source_path: backend/pytest.ini
status: active
updated: 2026-04-27
source_sha: fc720458515b
tags:
  - erp
  - backend
  - source-file
  - ini
---

# pytest.ini

> [!summary] 역할
> 원본 프로젝트의 `pytest.ini` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `backend/pytest.ini`
- Layer: `backend`
- Kind: `source-file`
- Size: `97` bytes

## 연결

- Parent hub: [[backend/backend|backend]]
- Related: [[backend/backend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````ini
[pytest]
testpaths = tests
addopts = -ra -q
filterwarnings =
    ignore::DeprecationWarning
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
