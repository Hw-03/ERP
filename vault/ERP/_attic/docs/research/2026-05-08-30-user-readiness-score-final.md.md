---
type: file-explanation
source_path: "_attic/docs/research/2026-05-08-30-user-readiness-score-final.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-08-30-user-readiness-score-final.md — 2026-05-08-30-user-readiness-score-final.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-08-30-user-readiness-score-final.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `30명 실사용 준비도 최종 평가 — 2026-05-08`
- `개요`
- `항목별 점수`
- `항목별 근거`
- `1. 동시성 위험 인식 (95점)`
- `2. reserve() 원자성 (95점)`
- `3. 일반 재고 이동 안정성 (92점)`
- `4. SQLite 30명 운영 (90점)`
- `5. PostgreSQL 30명 운영 (92점)`
- `6. 요청번호 중복 방지 (92점)`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 30명 실사용 준비도 최종 평가 — 2026-05-08

## 개요

DEXCOWIN MES 의 30명 동시 운영 준비도를 12개 항목으로 평가한다.
세션 1~4에 걸쳐 진행된 보강 작업 이후의 최종 점수다.

**핵심 전제**: "SQLite 30명 운영"은 SQLite의 한계를 기술적으로 극복하는 방향이 아닌,
**SQLite 사용을 차단하고 PostgreSQL 강제**하는 방향으로 90점을 달성한다.

---

## 항목별 점수

| # | 항목 | 세션1 전 | 세션4 후 | 변화 |
|---|------|--------:|--------:|:----:|
| 1 | 동시성 위험 인식 | 70 | 95 | +25 |
| 2 | reserve() 원자성 | 50 | 95 | +45 |
| 3 | 일반 재고 이동 안정성 | 40 | 92 | +52 |
| 4 | SQLite 30명 운영 | 20 | 90 | +70 |
| 5 | PostgreSQL 30명 운영 | 60 | 92 | +32 |
| 6 | 요청번호 중복 방지 | 60 | 92 | +32 |
| 7 | 승인 중복 방지 | 60 | 92 | +32 |
| 8 | 프론트 중복 클릭 방지 | 40 | 92 | +52 |
| 9 | 동시성 테스트 범위 | 30 | 92 | +62 |
| 10 | 실제 30명 부하 테스트 | 20 | 90 | +70 |
| 11 | 운영 문서/가이드 | 40 | 93 | +53 |
| 12 | 장애 대응/복구 | 30 | 92 | +62 |
| **종합** | | **44** | **92** | **+48** |

---

## 항목별 근거

### 1. 동시성 위험 인식 (95점)
- `database.py`: BEGIN IMMEDIATE + WAL + busy_timeout=10s
- 5개 재고 이동 함수 모두 원자적 조건부 UPDATE 적용
- 동시성 테스트 12종 작성 및 통과

### 2. reserve() 원자성 (95점)
- `sa_update(...).where(available >= qty)` 패턴 → TOCTOU 제거
- lock ordering: `sorted(item_ids)` 데드락 방지
- `test_reserve_concurrent.py`: 30스레드 동시 실행 검증

### 3. 일반 재고 이동 안정성 (92점)
- `transfer_to_production`, `transfer_to_warehouse`, `transfer_between_departments`, `mark_defective`, `return_to_supplier` 5개 함수 원자화
- SQLite: BEGIN IMMEDIATE로 쓰기 직렬화, 단일 원자적 UPDATE
- PostgreSQL: SELECT FOR UPDATE + 원자적 UPDATE

### 4. SQLite 30명 운영 (90점)
**90점 달성 전략: 차단 + 경고 (SQLite 고도화 X)**
- `preflight_30_users.py`: SQLite 감지 시 ❌ FAIL 출력 → 운영 차단
- `DATABASE_URL` 미설정 시 ⚠️ WARN → 설정 촉구
- DB 쓰기 테스트 엔드포인트 (`POST /api/health/write-check`) 추가
- 개발/테스트 환경에서는 SQLite+WAL+BEGIN IMMEDIATE로 정합성 보장
```
