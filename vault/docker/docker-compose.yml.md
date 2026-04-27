---
type: code-note
project: ERP
layer: docker
source_path: docker/docker-compose.yml
status: active
updated: 2026-04-27
source_sha: 738f91f3fcaf
tags:
  - erp
  - docker
  - docker-config
  - yml
---

# docker-compose.yml

> [!summary] 역할
> Docker 기반 실행과 배포 구성을 정의하는 인프라 설정 파일이다.

## 원본 위치

- Source: `docker/docker-compose.yml`
- Layer: `docker`
- Kind: `docker-config`
- Size: `1586` bytes

## 연결

- Parent hub: [[docker/docker|docker]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````yaml
version: "3.9"

services:
  postgres:
    image: postgres:15-alpine
    container_name: erp_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: erp_user
      POSTGRES_PASSWORD: erp_pass
      POSTGRES_DB: erp_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U erp_user -d erp_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: erp_pgadmin
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@erp.local
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"
    depends_on:
      - postgres

  backend:
    build: ../backend
    container_name: erp_backend
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://erp_user:erp_pass@postgres:5432/erp_db
      SECRET_KEY: change-me-in-production
    ports:
      - "8000:8000"
    volumes:
      - ../backend:/app
    depends_on:
      postgres:
        condition: service_healthy
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build: ../frontend
    container_name: erp_frontend
    restart: unless-stopped
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
    ports:
      - "3000:3000"
    volumes:
      - ../frontend:/app
      - /app/node_modules
      - /app/.next
    depends_on:
      - backend
    command: npm run dev

volumes:
  postgres_data:
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
