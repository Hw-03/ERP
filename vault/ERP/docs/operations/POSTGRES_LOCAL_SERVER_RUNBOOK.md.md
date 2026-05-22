---
type: file-explanation
source_path: "docs/operations/POSTGRES_LOCAL_SERVER_RUNBOOK.md"
importance: important
layer: docs
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# POSTGRES_LOCAL_SERVER_RUNBOOK.md — POSTGRES_LOCAL_SERVER_RUNBOOK.md 설명

## 이 파일은 무엇을 책임지나

`POSTGRES_LOCAL_SERVER_RUNBOOK.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.

## 업무 흐름에서의 의미

사람이 합의한 기준을 담지만, 코드가 바뀌었을 수 있으므로 현재 코드와 함께 읽어야 합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `PostgreSQL 로컬 서버 운영 매뉴얼`
- `1. 사전 요구사항`
- `Docker 설치 확인`
- `Python 3.11+ 확인`
- `2. PostgreSQL 기동`
- `프로젝트 루트에서 실행`
- `상태 확인 (healthy 상태가 될 때까지 30초 내외 소요)`
- `3. 환경변수 설정`
- `backend/.env`
- `4. 데이터베이스 마이그레이션`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/README.md]] — 이 문서는 DEXCOWIN MES가 무엇인지, 어떻게 실행하는지, 어떤 폴더를 먼저 봐야 하는지 알려주는 공식 입구입니다.
- [[ERP/docs/OPERATIONS.md]] — `OPERATIONS.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.
- [[ERP/docs/operations/DAILY_OPERATION_CHECKLIST.md]] — `DAILY_OPERATION_CHECKLIST.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.

## 조심할 점

큰 위험은 낮지만, 연결된 파일과 실행 위치를 확인한 뒤 수정하는 편이 안전합니다.

## 핵심 발췌

```md
# PostgreSQL 로컬 서버 운영 매뉴얼
**작성일**: 2026-05-08 | **대상**: 30명 동시 운영 서버 담당자

---

## 1. 사전 요구사항

```bash
# Docker 설치 확인
docker --version        # Docker 20.x 이상
docker compose version  # Docker Compose v2.x 이상

# Python 3.11+ 확인
python --version
```

Docker Desktop이 없으면 [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/) 에서 설치.

---

## 2. PostgreSQL 기동

```bash
# 프로젝트 루트에서 실행
docker compose -f docker/docker-compose.yml up -d postgres

# 상태 확인 (healthy 상태가 될 때까지 30초 내외 소요)
docker compose -f docker/docker-compose.yml ps postgres
```

접속 정보 (기본값):
| 항목 | 값 |
|------|-----|
| 호스트 | localhost:5432 |
| DB 이름 | mes_db |
| 사용자 | mes_user |
| 비밀번호 | mes_pass |

---

## 3. 환경변수 설정

`backend/.env` 파일을 생성(없으면) 또는 수정:

```bash
# backend/.env
DATABASE_URL=postgresql://mes_user:mes_pass@localhost:5432/mes_db
```

SQLite로 운영하던 기존 서버라면 `.env`에 해당 줄이 없거나 sqlite가 적혀 있을 수 있다.

---

## 4. 데이터베이스 마이그레이션
```
