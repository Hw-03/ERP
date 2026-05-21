---
layer: docker
---

# backend/Dockerfile — 백엔드 빌드

> [!summary] Python 3.11 + uvicorn. --reload 금지(안정성). 포트 8010

## 1. 역할
pip install requirements.txt (캐시). 포트 8010 EXPOSE. CMD: uvicorn app.main:app (--host 0.0.0.0).

## 2. 실제 원본 위치
erp/backend/Dockerfile

## 3. 관련 형제 파일
- [[docker-compose.nas.yml.md|NAS 배포]]
- [[docker-compose.yml.md|개발 DB]]
