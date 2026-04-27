---
type: code-note
project: ERP
layer: docker
source_path: docker/docker-compose.nas.yml
status: active
updated: 2026-04-27
source_sha: 9e18de828161
tags:
  - erp
  - docker
  - docker-config
  - yml
---

# docker-compose.nas.yml

> [!summary] 역할
> Docker 기반 실행과 배포 구성을 정의하는 인프라 설정 파일이다.

## 원본 위치

- Source: `docker/docker-compose.nas.yml`
- Layer: `docker`
- Kind: `docker-config`
- Size: `624` bytes

## 연결

- Parent hub: [[docker/docker|docker]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````yaml
version: "3.9"

services:
  backend:
    build: ../backend
    container_name: erp_backend
    restart: unless-stopped
    environment:
      DATABASE_URL: sqlite:////app/erp.db
    ports:
      - "8010:8010"
    volumes:
      - ../backend/erp.db:/app/erp.db
    command: uvicorn app.main:app --host 0.0.0.0 --port 8010

  frontend:
    build: ../frontend
    container_name: erp_frontend
    restart: unless-stopped
    environment:
      BACKEND_INTERNAL_URL: http://backend:8010
    ports:
      - "3000:3000"
    depends_on:
      - backend
    command: sh -c "npm run build && npm run start"
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
