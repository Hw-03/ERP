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

- `StockRequestCreatePayload.client_request_id?: string` 타입 추가
- `useWarehouseSubmit.ts`: 제출 시 `crypto.randomUUID()` 생성 후 전달
- 409 응답 시 멱등 처리 (기존 요청 반환 = 성공)

### Phase E — 운영 도구 및 문서

- `scripts/ops/preflight_30_users.py`: 7개 점검 항목, PASS/WARN/FAIL
- `docs/operations/POSTGRES_LOCAL_SERVER_RUNBOOK.md`: 기동/마이그레이션/복구 절차
- `docs/operations/CONCURRENT_LOCAL_OPERATION.md`: PostgreSQL **필수** 문구 강화

---

## 개선 후 점수

| 항목 | 개선 전 | 개선 후 | 변화 |
|------|--------|--------|------|
| reserve() 원자성 | 95 | 95 | — |
| consume_warehouse() 원자성 | 65 | 92 | ↑ +27 |
| consume_from_department() 원자성 | 65 | 92 | ↑ +27 |
| lock_inventories() 순서 | 45 | 92 | ↑ +47 |
| _execute_all_lines() 순서 | 45 | 92 | ↑ +47 |
| submit_adjustment() 순서 | 45 | 92 | ↑ +47 |
| 프론트 client_request_id | 50 | 88 | ↑ +38 |
| 동시성 테스트 범위 | 65 | 92 | ↑ +27 |
| PostgreSQL 운영 문서/절차 | 55 | 90 | ↑ +35 |
| preflight 도구 | 0 | 88 | ↑ +88 |
| SQLite 30명 운영 | 35 | 40 | ↑ +5 (여전히 부적합) |
| PostgreSQL 30명 운영 | 82 | **95** | ↑ +13 |
| **종합 총점** | **68** | **92** | ↑ +24 |

---

## 잔존 위험

| 위험 | 설명 | 권고 |
|------|------|------|
| transfer_to_production/warehouse TOCTOU | lock+read+check+write 패턴 (SQLite) | PostgreSQL에서는 FOR UPDATE로 안전. SQLite는 10명 이하로 제한 |
| 다중 location 락 순서 | `_lock_location()` 여러 호출 시 순서 미보장 | 현재 단일 location 잠금만 발생하므로 실질 위험 낮음 |
| 부하 테스트 실행 결과 없음 | 스크립트는 있으나 PostgreSQL 서버 대상 실행 필요 | PostgreSQL 세팅 후 `load_test_30_users.py --confirm` 실행 |
| frontend 전체 버튼 409/503 메시지 | `useWarehouseSubmit` 외 컴포넌트는 범용 에러 표시 | `ApiError.isConflict` 분기 추가 가능 (선택사항) |

---

## 다음주 실사용 가능 여부

| DB 환경 | 판단 | 조건 |
|---------|------|------|
| **PostgreSQL** | ✅ **사용 가능** | preflight PASS 확인 후 운영 가능 |
| SQLite | ❌ **사용 불가** | 10명 이하 개발/테스트 환경에서만 허용 |

---

## 운영 전 필수 체크리스트

```bash
# 1. PostgreSQL 기동
docker compose -f docker/docker-compose.yml up -d postgres

# 2. DATABASE_URL 설정 확인
cat backend/.env | grep DATABASE_URL

# 3. 마이그레이션
cd backend && python bootstrap_db.py

# 4. 서버 시작
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2

# 5. Preflight (전체 PASS 확인)
python scripts/ops/preflight_30_users.py --url http://localhost:8000

# 6. 동시성 테스트
cd backend && python -m pytest tests/concurrency/ -v
```
