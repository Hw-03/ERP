---
type: file-explanation
source_path: "_attic/docs/research/2026-05-08-30-user-readiness-score-100.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-08-30-user-readiness-score-100.md — 2026-05-08-30-user-readiness-score-100.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-08-30-user-readiness-score-100.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `30명 실사용 준비도 최종 100점 평가 — 2026-05-08`
- `평가 방법`
- `종합 점수표`
- `항목별 100점 근거`
- `1. 동시성 위험 인식 (98점)`
- `2. reserve() 원자성 (97점)`
- `3. 일반 재고 이동 안정성 (97점)`
- `4. SQLite 30명 운영 차단 (98점)`
- `5. PostgreSQL 30명 운영 (95점)`
- `6. 요청번호 중복 방지 (98점)`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 30명 실사용 준비도 최종 100점 평가 — 2026-05-08

## 평가 방법

- 실제 코드/테스트/문서 확인 기준
- "문서상 주장만"으로는 100점 불가
- 실행 결과 파일 또는 테스트 통과가 있어야 100점

---

## 종합 점수표

| # | 항목 | 세션1 전 | 세션4 후 | 이번 세션 후 | 변화 |
|---|------|--------:|--------:|----------:|:----:|
| 1 | 동시성 위험 인식 | 70 | 95 | **98** | +3 |
| 2 | reserve() 원자성 | 50 | 95 | **97** | +2 |
| 3 | 일반 재고 이동 안정성 | 40 | 92 | **97** | +5 |
| 4 | SQLite 30명 운영 차단 | 20 | 90 | **98** | +8 |
| 5 | PostgreSQL 30명 운영 | 60 | 92 | **95** | +3 |
| 6 | 요청번호 중복 방지 | 60 | 92 | **98** | +6 |
| 7 | 승인 중복 방지 | 60 | 92 | **98** | +6 |
| 8 | 프론트 중복 클릭 방지 | 40 | 82 | **95** | +13 |
| 9 | 동시성 테스트 범위 | 30 | 92 | **98** | +6 |
| 10 | 실제 30명 부하 테스트 | 20 | 70 | **80** | +10 |
| 11 | 운영 문서/가이드 | 40 | 93 | **97** | +4 |
| 12 | 장애 대응/복구 | 30 | 92 | **97** | +5 |
| **종합** | | 44 | 88 | **96** | **+8** |

> **참고**: 항목 10(실제 부하 테스트)은 서버 없이 실행 불가 — 서버 기동 후 실측 시 100점 가능.

---

## 항목별 100점 근거

### 1. 동시성 위험 인식 (98점)

**100점 근거:**
- `database.py`: SQLite BEGIN IMMEDIATE + WAL + busy_timeout=10s 적용 확인
- `inventory.py`: 5개 이동 함수 모두 `sa_update(...).where(qty>=N)` 원자적 UPDATE
- `stock_requests.py`: `_load_request_for_action()` PostgreSQL FOR UPDATE
- 동시성 테스트 20종 전체 통과 (162 passed)

**관련 파일:** `backend/app/database.py`, `backend/app/services/inventory.py`

**관련 테스트:** `tests/concurrency/` 전체 (20종)

**남은 위험:** 없음 (2점은 실운영에서 예상치 못한 edge case 여유분)

---

### 2. reserve() 원자성 (97점)

**100점 근거:**
- `inventory.py reserve()`: `sa_update(Inventory).where(warehouse_qty - pending_quantity >= qty)` — 단일 SQL에서 check+update
- `test_reserve_concurrent.py`: 30스레드 동시 reserve → 음수 재고 0, 정확한 성공 수
```
