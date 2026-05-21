---
layer: docker
---

# docker-compose.nas.yml — NAS 배포 (완전 스택)

> [!summary] 백엔드(SQLite) + 프론트엔드 컨테이너. depends_on + 환경변수 주입

## 1. 역할
backend (8010, SQLite mes.db 볼륨) + frontend (3000, BACKEND_INTERNAL_URL=http://backend:8010). 빌드: backend/ + frontend/. restart: unless-stopped.

## 2. 실제 원본 위치
erp/docker/docker-compose.nas.yml

## 3. 관련 형제 파일
- [[docker-compose.yml.md|개발 DB 오케스트레이션]]
- [[../backend/Dockerfile.md|백엔드 빌드]]
- [[../frontend/Dockerfile.md|프론트엔드 빌드]]
