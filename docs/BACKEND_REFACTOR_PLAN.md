# 백엔드 리팩터링 설계서

`feat/erp-overhaul` 브랜치 Phase 3에서 일부 항목 구현 완료. 전반은 여전히 다음 단계 후보로 남는다.

## 진행 상태 (2026-04-26 Phase 5 update)

| Phase 5 항목 | 상태 |
|---|---|
| **모든 라우터 에러 응답 표준화** | ✅ Phase 5 — 12개 라우터의 ~76 HTTPException 을 `http_error` 로 일괄 마이그. settings.py(PIN 라우터)는 보안/인증/권한 제외 규칙 따라 보존. |
| **request_id middleware** | ✅ Phase 5 — X-Request-Id 자동 발급 + 응답 헤더 부착. |
| **OpenAPI 태그·요약 보강** | ✅ Phase 5 — 16개 태그 description 추가. |
| **CORS_EXTRA_ORIGINS env wiring** | ✅ Phase 5 — `main.py` 가 환경 변수 콤마 split 해서 origin 추가. |
| services/inventory.py 분할 (445줄) | ⏸ 보류 — 트랜잭션 로직 위험. Phase 6+ 에서 테스트와 함께. |
| items.py / production.py 분할 | ⏸ 보류 — 비즈니스 로직 복합. 동상. |

## 진행 상태 (2026-04-26 Phase 5.1 정합 fix)

| Phase 5.1 항목 | 상태 |
|---|---|
| **`/api/production/capacity` 계산식 정합** | ✅ — `inv.quantity - pending` (부서/불량 포함) → `StockFigures.warehouse_available` (= warehouse - pending). production_receipt 의 실제 차감 검사식과 일치. 부서 생산재고/불량재고가 immediate 에 섞여 부풀려지던 문제 해소. |
| **`/capacity` N+1 제거** | ✅ — `build_bom_cache()` 1쿼리 + `bulk_compute()` 1쿼리 + Items IN 1쿼리. 루프 내 단건 쿼리 4종 제거. |
| **`bom.py get_all_bom` N+1 제거** | ✅ — parent/child 단건 쿼리 N×2회 → Items IN 1회. |
| **`services/bom.py explode_bom` 메모리 캐시** | ✅ — `BomCache` 도입. `cache=` 키워드로 호출 간 공유 가능. 단독 호출 시에도 진입점에서 1쿼리만 발사. |
| **WAL 안전 백업** | ✅ — `scripts/ops/backup_db.bat` 가 `sqlite3 .backup` → Python `sqlite3.backup` → WAL checkpoint+3종 복사 폴백 순서로 동작. |

## 진행 상태 (2026-04-26 Phase 5.2 — 4개 영역 A−)

| Phase 5.2 항목 | 상태 |
|---|---|
| **SQLite 락 정책** | ✅ `database.py` 에 `busy_timeout=5000` + `synchronous=NORMAL` 추가. WAL과 짝, 동시 쓰기 충돌 시 5초 대기 후 재시도. |
| **Inventory CheckConstraint** | ✅ `models.py Inventory.__table_args__` 에 4개 CHECK (`quantity/warehouse_qty/pending_quantity ≥ 0`, `warehouse_qty ≥ pending_quantity`). 사전 위반 0건 확인 후 적용. |
| **`_build_tree` N+1 제거** | ✅ `bom.py:_build_tree_cached` — BomCache 1회 + Items/Inventory IN 1회씩 사전 로드. 트리 깊이 무관 쿼리 수 일정. |
| **관리자 감사로그 (`AdminAuditLog`)** | ✅ 신규 모델 + `services/audit.record()` 헬퍼 + `routers/admin_audit.py` 조회 API. write-path 7곳(items / employees / bom / settings PIN·integrity·reset / codes symbols)에 통합. 재고 거래는 `transaction_logs` 가 본질적 audit 이라 제외. |
| **startup idempotent create_all** | ✅ `main.py` 가 startup 시 `Base.metadata.create_all(engine)` 호출. 기존 테이블 미변경, 신규 테이블만 자동 생성 (alembic 미도입 환경에서 안전한 마이그레이션). |
| **운영 스크립트 3종** | ✅ `restore_db.bat` (PRE-RESTORE 스냅샷 + integrity_check + wal/shm 제거), `verify_backup.bat` (최신 백업 무결성·행수), `cleanup_backups.bat` (N일 이상 자동 삭제). |
| **OpenAPI 태그 추가** | ✅ "Admin Audit" 태그 description 추가. |

## 진행 상태 (2026-04-26 Phase 4 update)

| 항목 | 상태 | 보류/완료 사유 |
|---|---|---|
| `services/_tx.py` 의 `commit_and_refresh` / `commit_only` | ✅ Phase 3 | inventory 10곳 적용. |
| `services/export_helpers.py` 의 `csv_streaming_response` | ✅ Phase 3 | inventory + items 보일러플레이트 단축. |
| **에러 응답 dict 표준화 (`_errors.py`)** | ✅ **Phase 4** | `routers/_errors.py` + `ErrorCode` 신설. ship-package + production produce 가 `{code, message, extra}` 사용. 프론트 `extractErrorMessage` 가 str/dict 양쪽 처리. |
| **전역 예외 핸들러 + 로그 회전** | ✅ **Phase 4** | `app/_logging.py` (RotatingFileHandler 5MB×5), `main.py` 에 ValueError/IntegrityError/OperationalError/Exception 핸들러. |
| **inventory 라우터 패키지 분할** | ✅ **Phase 4** | 단일 807줄 → `routers/inventory/` 9개 파일 (query, receive, ship, transfer, defective, supplier, transactions, _shared, __init__). |
| **export endpoint limit 강제** | ✅ **Phase 4** | `/transactions/export.csv|.xlsx` 가 `start_date/end_date` 필수 + 50,000행 상한. `EXPORT_RANGE_REQUIRED` / `EXPORT_RANGE_TOO_LARGE`. |
| **stock_math bulk_compute 통일** | ✅ **Phase 4** | `get_item` 단건 + `list_inventory` 다건 모두 `bulk_compute` 경유. `to_response_bulk` 로 N+1 제거. |
| **BOM Where-Used (read-only) API** | ✅ **Phase 4** | `GET /api/bom/where-used/{item_id}` 추가. DB 스키마 변경 없음. |
| `transactional` 컨텍스트 매니저로 교체 | ⏸ 보류 | 책임 경계 재배치(서비스가 commit 소유)는 다음 사이클. 현재 라우터-주도 commit 으로도 이번 Phase 의 회귀 0건이 검증됨. |
| `ship_package` 실제 bulk transaction 구현 | ⏸ 보류 | Phase 4 평가 제외 항목. 응답 dict 모양만 표준화하고 query 패턴은 유지. |
| 운영 파일 위생(seed 폴더, alembic) | ⏸ 보류 | docker-compose 포트, 루트 erp.db 정리 등은 별도 사이클. Phase 4 는 .env.example 확장 + reconcile 스크립트만 추가. |

이번 Phase 에서는 라우터의 `db.commit() + db.refresh(...)` 18회 반복 중 inventory.py의 10건을 `commit_and_refresh(db, *objs)` 단일 호출로 대체했다. **transaction 의미·commit 위치는 동일**(여전히 라우터 책임), 단지 호출 코드가 1줄로 단축됐다.

---

## 구 설계서 (배경)

## 1. 라우터 commit/refresh 표준화

### 현재 상태

`routers/inventory.py` 안에서 다음 패턴이 **18회 반복**된다.

```py
# 비즈니스 로직 호출
result = inventory_svc.<func>(db, ...)

# 트랜잭션 마감 (라우터 책임)
db.commit()
db.refresh(result)

return _to_response(db, result)
```

라우터마다 직접 commit/refresh를 호출하므로 다음 문제가 있다.

- 같은 패턴 18곳을 전수 리뷰해야 한다(누락 위험).
- 어떤 함수는 서비스가 자체 `db.flush()` 를, 어떤 함수는 라우터가 `db.commit()` 을 책임 — 경계가 흐림.
- 부분 실패 시 이미 수행된 변경이 롤백되지 않는 경우가 있다.

### 권장 접근

`backend/app/services/_tx.py` 신설.

```py
from contextlib import contextmanager

@contextmanager
def transactional(db: Session):
    try:
        yield
        db.commit()
    except Exception:
        db.rollback()
        raise
```

서비스 함수는 자기 책임으로 마감하도록 정렬한다.

```py
# services/inventory.py
def receive_confirmed(db: Session, ...) -> Inventory:
    with transactional(db):
        inv = _get_or_create_inventory(db, ...)
        # ... mutations ...
        db.flush()
    db.refresh(inv)
    return inv
```

라우터는 호출 + 응답만 다룬다.

```py
@router.post("/receive", response_model=InventoryResponse)
def post_receive(body: InventoryReceive, db: Session = Depends(get_db)):
    try:
        inv = inventory_svc.receive_confirmed(db, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _to_response(db, inv)
```

### 진입 단위

- 라우터 1개씩(`inventory.py` → `production.py` → `queue.py` → `items.py` → `bom.py` → ...) 점진 변환
- 각 변환 후 통합 smoke 호출(`/api/inventory/receive`, `/ship`, `/transfer-*`, `/mark-defective`, `/return-to-supplier`, `/ship-package`) 으로 회귀 확인

## 2. 에러 응답 표준화

### 현재 상태

```py
# 95% — 단순 문자열 detail
raise HTTPException(status_code=400, detail="품목을 찾을 수 없습니다.")

# 5% — 부분 실패 정보 dict
raise HTTPException(
    status_code=409,
    detail={"message": "재고 부족...", "shortages": [...]}
)
```

클라이언트는 둘을 모두 처리해야 한다(현재는 일부 화면에서만 dict를 인식).

### 권장 표준

`backend/app/routers/_errors.py` 신설.

```py
from typing import Any, TypedDict

class ErrorDetail(TypedDict, total=False):
    code: str          # "STOCK_SHORTAGE" | "ITEM_NOT_FOUND" | ...
    message: str       # 한국어 사용자 표시용
    extra: dict[str, Any]  # 부분 실패 시 shortages 등

def http_error(status_code: int, code: str, message: str, **extra) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message, **({"extra": extra} if extra else {})},
    )
```

기존 `str` detail 엔드포인트는 호환을 위해 그대로 둘 수 있다 — 새 detail 모양만 추가 인식. 프론트 `lib/api.ts` 에 detail 파서를 둔다.

```ts
function extractErrorMessage(data: unknown): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "message" in data) {
    return String((data as { message: string }).message);
  }
  return "처리 실패";
}
```

### 우선 마이그레이션 대상

- `POST /inventory/ship-package` (이미 dict 반환 — 정형화)
- `POST /production/produce` (이미 shortages 반환 — 정형화)
- `POST /inventory/ship`, `/transfer-to-production`, `/mark-defective`, `/return-to-supplier` 등 부분 실패가 의미 있는 엔드포인트

## 3. ship-package N+1 / 부분 실패 롤백

### 현재 상태

`POST /inventory/ship-package` 가 패키지 안의 각 자재에 대해 루프로 `consume_from_department()` 를 호출한다. 매 호출마다 `_get_or_create_location` → 단건 SELECT 가 발생한다.

또한 루프 도중 한 건이 실패하면 그 시점까지 수행된 차감이 롤백되지 않을 수 있다(서비스가 `db.flush()` 만 호출).

### 권장

1. `services.inventory.bulk_consume_from_department(db, items: list[(item_id, dept, qty)])` 신설
   - 한 번의 SELECT로 (item_id, dept) 조합의 InventoryLocation 을 prefetch
   - 한 번의 검증 라운드로 모든 부족분 수집 → 부족분이 있으면 차감 시작 전에 422 반환 (선처리 후 롤백 회피)
   - 모든 검증 통과 후 일괄 차감 + transactional context 마감
2. ship-package 라우터는 위 bulk 함수 1회 호출로 단순화

## 4. CSV/XLSX export 중복

### 현재 상태

`routers/inventory.py:transactions/export.csv|xlsx`, `routers/items.py:export.csv|xlsx` 가 각각 별도로 row spec → 파일 응답 코드를 가진다.

### 권장

`backend/app/services/export.py` 신설.

```py
def write_csv(rows: Iterable[dict], headers: list[str]) -> StreamingResponse: ...
def write_xlsx(rows: Iterable[dict], headers: list[str], sheet_name: str) -> StreamingResponse: ...
```

라우터는 row spec(헤더 + 행 generator) 만 넘긴다.

## 5. 운영 파일 위생

### 현재 상태 (이번 작업에서 의도적으로 보류)

- `start.bat` (8010) ↔ `docker-compose.yml` 백엔드 (8000) 포트 불일치
- 루트 `erp.db` 와 `backend/erp.db` 가 둘 다 존재
- `backend/seed*.py`, `bootstrap_db.py`, `assign_models.py`, `fix_unclassified.py`, `sync_excel_stock.py` 가 backend 루트에 산재 — `scripts_internal/` 같은 폴더 미사용
- Alembic 패키지는 설치되어 있으나 마이그레이션 디렉토리 미사용

### 권장 (다음 작업에서 진행)

1. docker-compose 포트를 8010 으로 정렬하고, 운영 표준은 `start.bat` 임을 README/OPERATIONS 에 명시한 그대로 유지
2. 루트 `erp.db` 의 의미 확인(언제 생긴 파일인지, 둘의 mtime/내용 비교) → 루트 파일은 삭제 또는 사용자가 직접 확인 후 결정
3. `backend/scripts_internal/` 신설 후 seed 스크립트 이동(import 경로 영향 점검 후)
4. Alembic 도입 여부 결정 — 도입한다면 첫 마이그레이션은 현재 스키마 baseline

## 6. 로깅

현재 FastAPI 기본 로깅(uvicorn access)만 사용. 외부 라이브러리 추가 금지 전제로:

- 표준 `logging` 모듈로 포맷터를 정의 (timestamp · level · path · request_id)
- `RequestContextMiddleware` 에서 request_id 발급
- `/health/detailed` 의 `inventory_mismatch_count` 가 > 0 이면 WARNING 로그를 매 호출마다 남기도록(Topbar 점등과 연동)

## 7. 변경 영향 / 호환성 매트릭스

| 작업 | API 호환 | DB 스키마 호환 | 프론트 영향 |
|---|---|---|---|
| 1. commit/refresh 표준화 | 유지 | 유지 | 없음(응답 동일) |
| 2. 에러 detail 표준화 | 유지(추가) | 유지 | 신규 detail 인식 추가 — 기존 str detail 는 그대로 처리 |
| 3. ship-package bulk | 유지 | 유지 | 응답 모양 동일 |
| 4. export 헬퍼 | 유지 | 유지 | 없음 |
| 5. 운영 파일 위생 | 유지 | 유지 | 없음 |
| 6. 로깅 | 유지 | 유지 | Topbar 점등과 연동만 |

## 8. 검증 체크리스트

각 작업 종료 시:

```bash
python -m compileall backend
```

수동 호출(API 응답 모양 동일):

```text
GET  /health
GET  /health/detailed
GET  /api/items
GET  /api/inventory/summary
POST /api/inventory/receive          (1건)
POST /api/inventory/ship             (1건)
POST /api/inventory/transfer-to-production
POST /api/inventory/mark-defective
POST /api/inventory/return-to-supplier
POST /api/inventory/ship-package
```

프론트 회귀:

- 입출고 wizard 5단계 모두 정상
- 부분 실패 모달 동작 동일
- Topbar pill / completionFlyout / 자동 refresh 동일
