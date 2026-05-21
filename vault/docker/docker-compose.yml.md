---
layer: docker
---

# docker-compose.yml — 개발 DB 오케스트레이션

> [!summary] PostgreSQL 15 + pgAdmin. healthcheck + persistent volume

## 1. 역할
postgres:15-alpine (mes_user/mes_pass/mes_db). pgAdmin (admin/admin). pg_isready healthcheck. postgres_data 볼륨.

## 2. 실제 원본 위치
erp/docker/docker-compose.yml

## 3. 관련 형제 파일
- [[docker-compose.nas.yml.md|NAS 버전 (백엔드+프론트)]]
- [[../backend/Dockerfile.md|백엔드 빌드]]
