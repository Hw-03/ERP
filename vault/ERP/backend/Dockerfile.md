---
type: code-note
project: ERP
layer: backend
source_path: erp/backend/Dockerfile
status: active
updated: 2026-04-27
source_sha: 44e6b605710a
tags:
  - erp
  - backend
  - source-file
  - file
---

# Dockerfile

> [!summary] 역할
> 원본 프로젝트의 `Dockerfile` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `backend/Dockerfile`
- Layer: `backend`
- Kind: `source-file`
- Size: `219` bytes

## 연결

- Parent hub: [[backend/backend|backend]]
- Related: [[backend/backend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````text
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
````
