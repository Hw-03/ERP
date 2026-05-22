---
type: file-explanation
source_path: "docs/operations/DAILY_OPERATION_CHECKLIST.md"
importance: important
layer: docs
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DAILY_OPERATION_CHECKLIST.md — DAILY_OPERATION_CHECKLIST.md 설명

## 이 파일은 무엇을 책임지나

`DAILY_OPERATION_CHECKLIST.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.

## 업무 흐름에서의 의미

사람이 합의한 기준을 담지만, 코드가 바뀌었을 수 있으므로 현재 코드와 함께 읽어야 합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `일일 운영 체크리스트 — DEXCOWIN MES`
- `1. 아침 시작 점검 (오전 8시 전)`
- `2. 운영 전 확인 (첫 작업 시작 시)`
- `3. 운영 중 모니터링 (30분마다)`
- `4. 점심 시간 점검 (오전 근무 종료 후)`
- `5. 퇴근 전 마무리 (오후 6시)`
- `6. 주간 점검 (매주 금요일 퇴근 전)`
- `참조 문서`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/README.md]] — 이 문서는 DEXCOWIN MES가 무엇인지, 어떻게 실행하는지, 어떤 폴더를 먼저 봐야 하는지 알려주는 공식 입구입니다.
- [[ERP/docs/OPERATIONS.md]] — `OPERATIONS.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.

## 조심할 점

큰 위험은 낮지만, 연결된 파일과 실행 위치를 확인한 뒤 수정하는 편이 안전합니다.

## 핵심 발췌

```md
# 일일 운영 체크리스트 — DEXCOWIN MES

> 30명 동시 운영 기준. 매 근무일 시작 전, 운영 중, 종료 시 수행.

---

## 1. 아침 시작 점검 (오전 8시 전)

```
[ ] 서버 상태 확인
    python scripts/ops/preflight_30_users.py --url http://localhost:8000

[ ] 재고 무결성 점검 (서버 없이 직접 DB)
    python scripts/ops/check_inventory_integrity.py

[ ] 미처리 요청 확인 (전일 잔여 RESERVED 요청)
    - GET /api/stock-requests?status=reserved
    - 50건 초과 시 창고 담당자에게 알림

[ ] DB 백업 실행
    python scripts/ops/backup_db.py
```

**판정 기준:**
- preflight 전 항목 PASS → 운영 가능
- FAIL 1건 이상 → 장애 대응 절차 참조: docs/operations/INCIDENT_RESPONSE.md

---

## 2. 운영 전 확인 (첫 작업 시작 시)

```
[ ] PostgreSQL 확인 (DATABASE_URL 환경변수)
    echo $DATABASE_URL  # postgresql:// 로 시작해야 함

[ ] 로그인 담당자 PIN 확인
    - 모든 창고 담당자 PIN 설정 여부 확인

[ ] 동시 사용자 수 예측
    - 30명 초과 예상 시: 팀장에게 보고, PostgreSQL 연결풀 점검
```

---

## 3. 운영 중 모니터링 (30분마다)

```
[ ] 503 오류 발생 여부
    - 서버 로그 확인: 'database is locked' → BEGIN IMMEDIATE 정상 작동 중
    - 503 연속 3건 이상 → INCIDENT_RESPONSE.md §2 참조

[ ] 요청 대기 적체 여부
    - RESERVED 상태 요청이 급격히 증가하면 창고 담당자에게 승인 촉구

[ ] 재고 이상 여부
```
