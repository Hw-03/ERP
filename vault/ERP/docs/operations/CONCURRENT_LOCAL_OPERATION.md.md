---
type: file-explanation
source_path: "docs/operations/CONCURRENT_LOCAL_OPERATION.md"
importance: important
layer: docs
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# CONCURRENT_LOCAL_OPERATION.md — CONCURRENT_LOCAL_OPERATION.md 설명

## 이 파일은 무엇을 책임지나

`CONCURRENT_LOCAL_OPERATION.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.

## 업무 흐름에서의 의미

사람이 합의한 기준을 담지만, 코드가 바뀌었을 수 있으므로 현재 코드와 함께 읽어야 합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `30명 동시 운영 가이드`
- `SQLite vs PostgreSQL 안전 범위`
- `PostgreSQL 전환 방법`
- `1. docker-compose.yml 설정`
- `2. DATABASE_URL 변경`
- `3. 마이그레이션 실행`
- `서버 PC 운영 주의사항`
- `필수 체크리스트 (30명 운영 시작 전)`
- `SQLite로 운영 시 (10명 이하)`
- `자주 발생하는 오류와 대처법`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/README.md]] — 이 문서는 DEXCOWIN MES가 무엇인지, 어떻게 실행하는지, 어떤 폴더를 먼저 봐야 하는지 알려주는 공식 입구입니다.
- [[ERP/docs/OPERATIONS.md]] — `OPERATIONS.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.
- [[ERP/docs/operations/DAILY_OPERATION_CHECKLIST.md]] — `DAILY_OPERATION_CHECKLIST.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.

## 조심할 점

큰 위험은 낮지만, 연결된 파일과 실행 위치를 확인한 뒤 수정하는 편이 안전합니다.

## 핵심 발췌

```md
# 30명 동시 운영 가이드
**작성일**: 2026-05-08

---

## SQLite vs PostgreSQL 안전 범위

| 항목 | SQLite (기본) | PostgreSQL (**필수**) |
|------|--------------|------------------|
| 동시 쓰기 안전 범위 | **10명 이하** | **30명 이상** |
| 재고 락 방식 | WAL + busy_timeout 직렬화 | row-level FOR UPDATE |
| 동시 승인 충돌 | 대기 후 멱등 처리 | row lock으로 직렬화 |
| 503 발생 가능성 | 10명 초과 동시 쓰기 시 높음 | 거의 없음 |
| 설정 난이도 | 없음 (기본값) | Docker 설치 필요 |

> **30명 실사용 기준: PostgreSQL은 선택이 아닌 필수입니다.**  
> SQLite는 개발 환경 및 10명 이하 소규모 테스트 전용으로 제한합니다.

---

## PostgreSQL 전환 방법

### 1. docker-compose.yml 설정

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: mes_db
      POSTGRES_USER: mes
      POSTGRES_PASSWORD: mes_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

### 2. DATABASE_URL 변경

`.env` 파일 (또는 서버 환경변수):

```
DATABASE_URL=postgresql://mes:mes_password@localhost:5432/mes_db
```

SQLite(기본):
```
DATABASE_URL=sqlite:///./mes.db
```

### 3. 마이그레이션 실행

```bash
cd backend
```
