---
type: file-explanation
source_path: "_attic/docs/research/2026-05-08-concurrent-io-hardening-audit.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-08-concurrent-io-hardening-audit.md — 2026-05-08-concurrent-io-hardening-audit.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-08-concurrent-io-hardening-audit.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `동시성 취약점 감사 보고서`
- `요약`
- `발견된 취약점`
- `수정 내용`
- `1. 재고 reserve() — 원자적 조건부 UPDATE`
- `2. 재고 쓰기 함수 — _lock_inventory() 적용`
- `3. _sync_total() 시그니처 변경`
- `4. request_code 중복 — 시간+랜덤hex`
- `5. 이중 승인 방지`
- `6. Idempotency Key — client_request_id`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 동시성 취약점 감사 보고서
**작성일**: 2026-05-08  
**대상**: DEXCOWIN MES 백엔드 — 30명 동시 입출고 운영 안정성 보강

---

## 요약

로컬 내부망 서버에서 30명이 동시에 재고 입출고/요청/승인 작업을 수행할 때 발생할 수 있는 데이터 정합성 취약점을 분석하고, 수정 방안을 적용했다.

---

## 발견된 취약점

| 위치 | 취약점 | 심각도 | 상태 |
|------|--------|--------|------|
| `inventory.py`: `reserve()` | Check-then-act — SELECT → avail check → UPDATE 사이 락 없음 | 🔴 High | ✅ 수정 |
| `inventory.py`: 모든 쓰기 함수 | `get_or_create_inventory()` 공유로 stale read 가능 | 🔴 High | ✅ 수정 |
| `stock_requests.py`: `_generate_request_code` | count+1 방식 → 동시 생성 시 request_code 중복 | 🔴 High | ✅ 수정 |
| `stock_requests.py`: `approve_request` | 상태 검증 후 재고 이동 사이 갭 — 이중 승인 가능 | 🔴 High | ✅ 수정 |
| `inventory.py`: `_sync_total()` | item_id로 inv 재조회 → stale read 가능 | 🟠 Medium | ✅ 수정 |
| `production.py`: BOM 검증 | 사전 avail 검증 → 실제 차감 사이 TOCTOU 갭 | 🟠 Medium | ✅ 수정 |
| `DraftsListPanel.tsx` | 삭제 버튼 loading 상태 없음 — 더블클릭 중복 요청 | 🟡 Low | ✅ 수정 |
| API 레이어 | 409/503 status 코드 미전달 | 🟡 Low | ✅ 수정 |

---

## 수정 내용

### 1. 재고 reserve() — 원자적 조건부 UPDATE

**문제**: 30개 스레드가 동시에 `SELECT pending, warehouse_qty WHERE item_id=X`를 실행하면 모두 동일한 stale 값을 읽고, 모두 avail check를 통과해 모두 pending을 증가시킨다. 결과적으로 warehouse_qty=10인 재고에 30개 예약이 걸린다.

**수정**: SQLAlchemy Core `sa_update` 방식으로 단일 SQL 문으로 원자적 처리:

```python
result = db.execute(
    sa_update(Inventory)
    .where(Inventory.item_id == item_id)
    .where(Inventory.warehouse_qty - Inventory.pending_quantity >= qty)
    .values(pending_quantity=Inventory.pending_quantity + qty)
    .execution_options(synchronize_session=False)
)
db.flush()
if result.rowcount == 0:
    raise ValueError("재고 부족 또는 예약 가능 수량 초과")
db.expire_all()
```

이 방식은 SQLite와 PostgreSQL 모두에서 안전하다. DB 엔진이 WHERE절 평가와 UPDATE를 원자적으로 처리하기 때문이다.

### 2. 재고 쓰기 함수 — _lock_inventory() 적용

**문제**: PostgreSQL에서 복수 트랜잭션이 동시에 같은 Inventory 행을 읽고 수정할 경우 last-write-wins로 일부 변경이 유실된다.
```
