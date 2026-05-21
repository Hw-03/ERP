---
layer: docs
---

# POSTGRES_LOCAL_SERVER_RUNBOOK.md — PostgreSQL 로컬 운영

> [!summary] Docker Compose로 PostgreSQL 15 기동. 30명 동시 운영 준비. pg_isready 헬스 체크

## 1. 역할
Docker Desktop 확인. docker compose -f docker/docker-compose.yml up -d postgres. 건강 상태 대기. DATABASE_URL 환경변수 설정(postgresql://mes_user:mes_pass@localhost).

## 2. 실제 원본 위치
erp/docs/operations/POSTGRES_LOCAL_SERVER_RUNBOOK.md

## 3. 관련 형제 파일
- [[CONCURRENT_LOCAL_OPERATION.md|30명 동시 운영 가이드]]
- [[../OPERATIONS.md|운영 매뉴얼]]
