---
type: file-explanation
source_path: "docker/docker-compose.yml"
importance: normal
layer: docker
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# docker-compose.yml — docker-compose.yml 설명

## 이 파일은 무엇을 책임지나

`docker-compose.yml`는 YAML 설정입니다. 프로젝트 구조 안에서 `docker/docker-compose.yml` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

프로젝트 운영과 개발을 이해하기 위한 보조 정보입니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/docker/📁_docker]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:15-alpine
    container_name: mes_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: mes_user
      POSTGRES_PASSWORD: mes_pass
      POSTGRES_DB: mes_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mes_user -d mes_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: mes_pgadmin
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@mes.local
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"
    depends_on:
      - postgres

  backend:
    build: ../backend
    container_name: mes_backend
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://mes_user:mes_pass@postgres:5432/mes_db
      # WS2 가드: 운영 표식. SQLite/DATABASE_URL 미설정 시 backend 기동 거부(fail-fast).
      APP_ENV: production
    ports:
      - "8010:8010"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      # 경량 liveness: DB-down 시 /health/live 가 503 → unhealthy (정적 /health 아님).
      # python:slim 에 curl 없음 → urllib. 503/연결실패 시 예외→비0 종료.
      test: ["CMD", "python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8010/health/live',timeout=3).status==200 else 1)"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    volumes:
```
