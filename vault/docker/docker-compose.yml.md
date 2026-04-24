---
type: code-note
project: ERP
layer: infra
source_path: docker-compose.yml
status: active
tags:
  - erp
  - infra
  - docker
  - compose
aliases:
  - 도커 컴포즈 (개발용)
---

# docker-compose.yml

> [!summary] 역할
> 개발 환경에서 **PostgreSQL + pgAdmin + 백엔드 + 프론트엔드**를 한 번에 실행하는 Docker Compose 설정.

> [!info] 서비스 구성
> | 서비스 | 이미지 | 포트 | 설명 |
> |--------|--------|------|------|
> | `postgres` | postgres:15-alpine | 5432 | PostgreSQL DB |
> | `pgadmin` | dpage/pgadmin4 | 5050 | DB 관리 웹 UI |
> | `backend` | ./backend (빌드) | 8000 | FastAPI 서버 |
> | `frontend` | ./frontend (빌드) | 3000 | Next.js 서버 |

> [!warning] 주의
> 이 파일은 **PostgreSQL을 사용하는 개발 환경** 설정이다.
> 현재 실제 운영은 `docker-compose.nas.yml` (SQLite 기반)로 실행 중이다.
> 로컬 개발 시에는 `start.bat` 으로 직접 실행하는 것이 일반적이다.

---

## 쉬운 말로 설명

**개발자가 "한 번의 명령"으로 모든 서비스 띄우는 설정 파일**. `docker compose up` 하면 4개 컨테이너가 네트워크로 연결되어 기동.

```
docker compose up -d      # 백그라운드 실행
docker compose logs -f    # 로그 확인
docker compose down       # 모두 종료
```

## 접속 경로

- 프론트엔드: `http://localhost:3000`
- 백엔드 API: `http://localhost:8000/docs` (Swagger)
- pgAdmin: `http://localhost:5050`
- PostgreSQL: `localhost:5432` (외부 툴로 접속)

## 실제 사용 빈도

- 개발 시 PostgreSQL 테스트 필요 → 이거 사용
- 일반 로컬 개발 → `start.bat` 이 더 빠름 (SQLite)
- 운영 → `docker-compose.nas.yml` 사용

## FAQ

**Q. pgAdmin 비밀번호?**
`docker-compose.yml` 의 `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD` 환경변수 참조.

**Q. 데이터 볼륨 유지?**
`postgres-data` named volume. `docker compose down -v` 해야 삭제됨.

---

## 관련 문서

- [[docker-compose.nas.yml.md]] — NAS 운영 환경 (SQLite)
- [[start.bat.md]] — 로컬 직접 실행 스크립트
- [[backend/Dockerfile.md]], [[frontend/Dockerfile.md]]

Up: ERP MOC
