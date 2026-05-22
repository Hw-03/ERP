---
type: file-explanation
source_path: "docker/docker-compose.nas.yml"
importance: normal
layer: docker
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# docker-compose.nas.yml — docker-compose.nas.yml 설명

## 이 파일은 무엇을 책임지나

`docker-compose.nas.yml`는 YAML 설정입니다. 프로젝트 구조 안에서 `docker/docker-compose.nas.yml` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

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
  backend:
    build: ../backend
    container_name: mes_backend
    restart: unless-stopped
    environment:
      DATABASE_URL: sqlite:////app/mes.db
    ports:
      - "8010:8010"
    volumes:
      - ../backend/mes.db:/app/mes.db
    # backend.command 제거 — backend/Dockerfile CMD 와 동일 (8010, no --reload).

  frontend:
    build: ../frontend
    container_name: mes_frontend
    restart: unless-stopped
    environment:
      BACKEND_INTERNAL_URL: http://backend:8010
    ports:
      - "3000:3000"
    depends_on:
      - backend
    # frontend.command — npm run start 만. 빌드는 frontend/Dockerfile RUN npm run build 에서 완료.
    command: npm run start
```
