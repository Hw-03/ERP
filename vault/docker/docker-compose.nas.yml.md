---
type: code-note
project: ERP
layer: infra
source_path: docker-compose.nas.yml
status: active
tags:
  - erp
  - infra
  - docker
  - compose
  - production
aliases:
  - 도커 컴포즈 (NAS 운영)
---

# docker-compose.nas.yml

> [!summary] 역할
> NAS(Synology 등) 서버에서 **실제 운영 환경**으로 ERP를 실행하는 Docker Compose 설정.
> PostgreSQL 없이 **SQLite 파일**을 직접 마운트하여 사용한다.

> [!info] 서비스 구성
> | 서비스 | 포트 | 설명 |
> |--------|------|------|
> | `backend` | 8010 | FastAPI (SQLite 마운트) |
> | `frontend` | 3000 | Next.js (production 빌드) |

> [!info] 개발용(`docker-compose.yml`)과의 차이
> | 항목 | 개발용 | NAS 운영용 |
> |------|--------|-----------|
> | DB | PostgreSQL 컨테이너 | SQLite 파일 마운트 |
> | 포트 | 8000 | 8010 |
> | Frontend CMD | `npm run dev` | `npm run build && npm run start` |
> | pgAdmin | 포함 | 없음 |

> [!warning] 주의
> `backend/erp.db` 파일이 컨테이너 내부에 마운트(`/app/erp.db`)된다.
> DB 파일 손실 방지를 위해 NAS 백업 설정을 별도로 유지할 것.

---

## 쉬운 말로 설명

**실제 서비스 중인 NAS 용 컴포즈 파일**. SQLite 파일 하나를 컨테이너에 마운트해서 그대로 쓰는 단순 구조. DB 관리 도구(pgAdmin) 없이 최소 구성.

운영 배포 명령:
```bash
docker compose -f docker-compose.nas.yml up -d --build
```

## 백업 전략

SQLite 파일 (`backend/erp.db`) 하나만 복사하면 전체 데이터 백업 완료.

```bash
# 매일 스냅샷
cp backend/erp.db backup/erp-$(date +%Y%m%d).db
```

NAS 자체 스냅샷 기능도 추가로 설정 권장.

## FAQ

**Q. PostgreSQL 로 이관?**
`docker-compose.yml` 로 전환 + `schema.sql` 기반 스키마 재생성 + 데이터 덤프/임포트 필요. 마이그레이션 스크립트는 따로 없어 수동.

**Q. 포트 8000 대신 8010 인 이유?**
NAS 내부 다른 서비스와 충돌 피하려고. 방화벽/역프록시 설정과 매칭.

---

## 관련 문서

- [[docker-compose.yml.md]] — 개발 환경 설정
- [[start.bat.md]] — 로컬 직접 실행
- [[backend/app/database.py.md]] — SQLite WAL 모드

Up: ERP MOC
