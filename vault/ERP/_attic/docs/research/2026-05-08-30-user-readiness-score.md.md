---
type: file-explanation
source_path: "_attic/docs/research/2026-05-08-30-user-readiness-score.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-08-30-user-readiness-score.md — 2026-05-08-30-user-readiness-score.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-08-30-user-readiness-score.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `30명 실사용 준비도 점수표`
- `개선 전 점수 (174387e, 1차 보강 완료 시점)`
- `2차 보강 내용`
- `Phase A — Lock 순서 정렬 (deadlock 방지)`
- `Phase B — 원자적 consume (TOCTOU 제거)`
- `Phase C — 동시성 테스트 5종 추가`
- `Phase D — Frontend client_request_id`
- `Phase E — 운영 도구 및 문서`
- `개선 후 점수`
- `잔존 위험`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 30명 실사용 준비도 점수표
**작성일**: 2026-05-08 | **커밋 기준**: 174387e (1차) → 2차 보강 후

---

## 개선 전 점수 (174387e, 1차 보강 완료 시점)

| 항목 | 점수 | 판단 |
|------|---:|---|
| 동시성 위험 인식 | 90 | 위험 지점 잘 파악 |
| reserve() 원자성 | 95 | 조건부 UPDATE 적용 |
| 일반 재고 이동 안정성 | 75 | PostgreSQL 괜찮음, SQLite 위험 |
| SQLite 30명 운영 | 35 | 다음주 실사용 기준 부적합 |
| PostgreSQL 30명 운영 | 82 | 가능권, 부하테스트 필요 |
| 요청번호 중복 방지 | 85 | 랜덤+재시도 구조 |
| 승인 중복 방지 | 82 | FOR UPDATE 기준 |
| 프론트 중복 클릭 방지 | 55 | 일부만 적용 |
| 동시성 테스트 범위 | 65 | 3종 (reserve/approve/코드) |
| 실제 30명 부하 테스트 | 40 | 스크립트만 있음 |
| 마이그레이션/운영 준비 | 65 | 절차 보강 필요 |
| 장애 대응/복구 | 60 | 문서화 부족 |
| **총점** | **68** | 실운영 투입 전 보강 필요 |

---

## 2차 보강 내용

### Phase A — Lock 순서 정렬 (deadlock 방지)

| 수정 | 내용 |
|------|------|
| `lock_inventories()` | `.order_by(Inventory.item_id)` 추가 — 모든 호출자 동일 순서 락 |
| `_execute_all_lines()` | 라인 처리 전 item_id 정렬 후 일괄 선락 |
| `submit_adjustment()` | 라인 처리 전 item_id 정렬 후 일괄 선락 |

### Phase B — 원자적 consume (TOCTOU 제거)

| 수정 | 내용 |
|------|------|
| `consume_warehouse()` | lock+check+write → 원자적 조건부 UPDATE (WHERE warehouse_qty >= qty) |
| `consume_from_department()` | lock+check+write → 원자적 조건부 UPDATE (WHERE quantity >= qty) |

SQLite에서도 안전 (DB 엔진 수준 원자성 보장).

### Phase C — 동시성 테스트 5종 추가

| 테스트 | 결과 |
|--------|------|
| `test_consume_warehouse_concurrent` | ✅ 30스레드, 음수 없음, 정확한 차감 |
| `test_transfer_concurrent` | ✅ 20스레드, 총량 불변, 음수 없음 |
| `test_defective_concurrent` | ✅ 20스레드, 총량 불변, 부서 음수 없음 |
| `test_dept_adjustment_concurrent` | ✅ 교차 순서 20스레드, deadlock 없음 |
| `test_package_ship_concurrent` | ✅ 10스레드, 양쪽 구성품 음수 없음 |

### Phase D — Frontend client_request_id
```
