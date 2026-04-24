---
type: code-note
project: ERP
layer: infra
source_path: frontend/Dockerfile
status: active
tags:
  - erp
  - infra
  - docker
  - frontend
aliases:
  - 프론트엔드 도커파일
---

# Dockerfile (frontend)

> [!summary] 역할
> Next.js 프론트엔드 서버를 Docker 컨테이너로 빌드하는 설정 파일.

> [!info] 주요 내용
> - 베이스 이미지: `node:20-alpine`
> - 작업 디렉토리: `/app`
> - `npm install` 후 소스 복사
> - 포트: `3000`
> - 실행 명령: `npm run dev`

> [!warning] 주의
> 현재 `CMD`가 `npm run dev` (개발 서버)로 설정되어 있다.
> 운영 환경에서는 `npm run build && npm run start` 로 변경 필요.
> `docker-compose.nas.yml` 에서는 이미 production 모드로 변경되어 있다.

---

## 쉬운 말로 설명

**프론트엔드 컨테이너 빌드 레시피**. Node 20 alpine → 의존성 설치 → 소스 복사 → dev 서버 실행.

## 두 가지 실행 모드

| 모드 | CMD | 용도 |
|------|-----|------|
| dev | `npm run dev` | 핫리로드, 개발 전용 |
| production | `npm run build && npm run start` | 정적 빌드, 운영 |

Dockerfile 자체는 dev. 운영에서는 `docker-compose.nas.yml` 이 command 를 오버라이드.

## FAQ

**Q. 빌드 캐시 활용?**
`package.json` 을 먼저 COPY 하고 `npm install` 이후에 소스 COPY. 의존성 안 바뀌면 재빌드 빠름.

**Q. 이미지 크기 줄이려면?**
multi-stage build (`builder` + `runner` 분리) 로 개선 가능. 현재는 단순 single-stage.

**Q. 환경변수 `NEXT_PUBLIC_API_BASE_URL` 어디서?**
`docker-compose.yml` 의 `environment:` 섹션에서 주입. 빌드 시점에 inline 필요하면 `ARG`로 전달.

---

## 관련 문서

- [[docker-compose.yml.md]] — 전체 서비스 실행 설정
- [[docker-compose.nas.yml.md]] — NAS 운영 환경 설정
- [[backend/Dockerfile.md]] — 백엔드 도커파일

Up: [[frontend/frontend]]
