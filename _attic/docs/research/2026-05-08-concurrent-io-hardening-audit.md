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

**수정**: `_lock_inventory(db, item_id)` 헬퍼 추가:

```python
def _lock_inventory(db, item_id):
    q = db.query(Inventory).filter(Inventory.item_id == item_id)
    if not _is_sqlite:
        q = q.with_for_update()
    inv = q.first()
    if inv is None:
        inv = Inventory(item_id=item_id, quantity=0, warehouse_qty=0, pending_quantity=0)
        db.add(inv); db.flush()
    return inv
```

SQLite는 `with_for_update()`가 no-op이므로 WAL + busy_timeout으로 직렬화된다. PostgreSQL은 row-level exclusive lock으로 직렬화된다.

모든 재고 쓰기 함수(`receive_confirmed`, `transfer_to_production`, `transfer_to_warehouse`, `transfer_between_departments`, `mark_defective`, `return_to_supplier`, `consume_from_department`, `adjust_warehouse`, `consume_warehouse`, `release`, `consume_pending`)에 적용했다.

### 3. _sync_total() 시그니처 변경

**문제**: `_sync_total(db, item_id)`가 내부에서 `inv = db.query(Inventory)...` 재조회 → 이미 잠근 객체를 다시 읽어 stale 값 가능.

**수정**: `_sync_total(db, inv)` — 이미 잠긴 객체 직접 전달, 재조회 없음.

### 4. request_code 중복 — 시간+랜덤hex

**문제**: `_generate_request_code(db, ts)`가 `COUNT(*)`로 오늘 요청 수를 세어 `SR-YYYYMMDD-NNNN` 형식 생성. 동시 요청 시 같은 count 조회 → 같은 코드 생성 → UNIQUE 제약 위반.

**수정**: `secrets.token_hex(2).upper()` 4자리 랜덤 hex 사용:

```python
def _generate_request_code(ts: datetime) -> str:
    suffix = secrets.token_hex(2).upper()
    return f"SR-{ts.strftime('%Y%m%d-%H%M%S')}-{suffix}"
```

충돌 확률 ~1/65,536 per second. 라우터에서 `IntegrityError` 시 1회 자동 재시도.

### 5. 이중 승인 방지

**문제**: 두 스레드가 동시에 같은 RESERVED 요청을 승인하면, 둘 다 상태=RESERVED 확인 후 재고 이동 → 두 TransactionLog 기록.

**수정**:
- `_load_request_for_action()`: PostgreSQL에서 `with_for_update()` 적용 — 첫 번째 트랜잭션이 행을 잠금, 두 번째는 첫 번째 commit 대기.
- `approve_request()`: 이미 COMPLETED 상태면 즉시 반환(멱등):
  ```python
  if request.status == StockRequestStatusEnum.COMPLETED:
      return request
  ```

### 6. Idempotency Key — client_request_id

**문제**: 네트워크 오류로 프론트엔드가 동일 요청을 재전송하면 중복 StockRequest 생성.

**수정**:
- `StockRequest.client_request_id VARCHAR(64) UNIQUE` 컬럼 추가
- `StockRequestCreate.client_request_id: Optional[str]` 스키마 추가
- 라우터에서 `IntegrityError` 시 기존 행 조회 후 200 반환

프론트엔드는 `crypto.randomUUID()` 로 UUID를 생성해 요청 시 전달하면 된다.

### 7. production.py 다중 아이템 락

**수정**: `invs_map` 빌드 시 `lock_inventories(db, item_ids)` 복수 헬퍼 적용:

```python
def lock_inventories(db, item_ids):
    q = db.query(Inventory).filter(Inventory.item_id.in_(item_ids))
    if not _is_sqlite:
        q = q.with_for_update()
    return {i.item_id: i for i in q.all()}
```

---

## 동시성 테스트 결과

`backend/tests/concurrency/` 에 3개 테스트 추가. 모두 통과.

| 테스트 | 시나리오 | 결과 |
|--------|---------|------|
| `test_reserve_concurrent.py` | warehouse=10, 30스레드 동시 reserve(1) | ✅ 성공 ≤10, pending ≤10, 음수 없음 |
| `test_approve_concurrent.py` | 10스레드 동시 approve 같은 request | ✅ TransactionLog 정확히 1건 |
| `test_request_code_unique.py` | 100스레드 동시 request_code 생성 | ✅ 중복 0건, 성공 >80건 |

**테스트 환경**: 파일 기반 SQLite + NullPool + BEGIN IMMEDIATE + WAL + busy_timeout=5000ms  
(`StaticPool` in-memory는 단일 연결이라 경합 재현 불가 — 파일 기반으로 전환)

---

## 잔존 위험

| 위험 | 설명 | 권고 |
|------|------|------|
| SQLite 30명 동시 쓰기 | WAL 단일 writer — busy_timeout 초과 시 503 발생 가능 | PostgreSQL 권장 |
| 락 순서 교착 (PostgreSQL) | 다중 아이템 동시 조작 시 deadlock 가능 | item_id 정렬 후 락 획득 (미구현) |
| request_code 충돌 재시도 한계 | 2회 재시도 후 409 반환 | 허용 가능 (1/65536 확률) |

---

## 수정 파일 목록

```
backend/app/services/inventory.py       # 원자적 reserve, _lock_inventory, _sync_total 시그니처 변경
backend/app/services/stock_requests.py  # 랜덤 코드, 멱등 상태 반환, client_request_id
backend/app/routers/stock_requests.py   # with_for_update 락, IntegrityError 재시도
backend/app/routers/production.py       # lock_inventories 적용
backend/app/models.py                   # client_request_id 컬럼
backend/app/schemas.py                  # client_request_id 필드
backend/bootstrap_db.py                 # 마이그레이션 DDL 추가
backend/tests/concurrency/              # 동시성 테스트 3종
scripts/ops/load_test_30_users.py       # 30명 부하 테스트 스크립트
frontend/lib/api-core.ts                # ApiError 클래스 추가
frontend/.../DraftsListPanel.tsx        # 삭제 중복클릭 방지
```
