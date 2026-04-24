---
type: code-note
project: ERP
layer: infra
source_path: backend/Dockerfile
status: active
tags:
  - erp
  - infra
  - docker
aliases:
  - 백엔드 도커파일
---

# Dockerfile (backend)

> [!summary] 역할
> 백엔드 FastAPI 서버를 Docker 컨테이너로 빌드하는 설정 파일.

> [!info] 주요 내용
> - Python 베이스 이미지 사용
> - `requirements.txt` 설치
> - uvicorn으로 앱 실행

---

## 쉬운 말로 설명

**백엔드 컨테이너 빌드 레시피**. `python:3.11-slim` 등 경량 이미지 기반 → `requirements.txt` 설치 → 앱 복사 → `uvicorn` 실행.

## 빌드 예시

```bash
docker build -t erp-backend ./backend
docker run -p 8000:8000 erp-backend
```

## FAQ

**Q. pip install 느림?**
베이스 이미지 캐시 적극 활용. `COPY requirements.txt` 를 `COPY . .` 보다 먼저 하면 requirements 변경 없는 한 빌드 재사용.

**Q. SQLite 파일은 컨테이너 안에?**
`docker-compose*.yml` 에서 호스트 파일을 volume 으로 마운트. 이미지에는 포함 X.

---

## 관련 문서

- [[docker-compose.yml.md]] — 프론트+백 합쳐서 실행하는 설정
- [[docker-compose.nas.yml.md]] — NAS 운영 설정
- [[backend/requirements.txt.md]]

Up: [[backend/backend]]
