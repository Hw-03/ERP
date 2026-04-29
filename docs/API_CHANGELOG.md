# API CHANGELOG

DEXCOWIN MES 의 외부 노출 가능한 API 변경 이력. 내부 LAN 운영 기준이지만 향후 외부 통합을 위한 형식 안정성을 추적한다.

각 항목 = 영향받은 엔드포인트 + 변경 종류 (Added / Changed / Fixed / Deprecated / Removed) + 호환성 영향 (Breaking ✗ / Non-breaking ✓).

---

## Phase 5.6 (2026-04-27)

### Changed
- `GET /api/codes/symbols`, `PUT /api/codes/symbols/{slot}`, `GET /api/codes/options`, `GET /api/codes/process-types`, `GET /api/codes/process-flows`, `POST /api/codes/parse`, `POST /api/codes/generate` — 한국어 `summary` 추가. **OpenAPI `/docs` 만 변경, 응답 형태 동일**. ✓
- `GET /api/models`, `POST /api/models`, `DELETE /api/models/{slot}` — 한국어 `summary` 추가. `delete_model` 은 `response_model=None` + `-> None` 명시 (이미 204). 응답 형태 동일. ✓
- 6 라우터(`alerts`, `codes`, `counts`, `loss`, `models`, `scrap`) 의 모든 write 핸들러 — 내부 commit 패턴 `commit_and_refresh` / `commit_only` 헬퍼로 일관화. **응답 형태 동일, 동시성/refresh 안정성만 개선**. ✓

### Fixed (Internal)
- 마이그 스크립트 `add_invloc_check_5_5.py` — 백업이 `shutil.copy2` → `sqlite3.Connection.backup()` API. **WAL transaction-consistent 백업**. API 영향 없음. ✓

---

## Phase 5.5 (2026-04-27)

### Changed
- `DELETE /api/queue/{batch_id}/lines/{line_id}` — OpenAPI summary/description 강화. **응답 형태 동일 (200 + `QueueBatchResponse`)**. ✓
- `DELETE /api/ship-packages/{package_id}/items/{package_item_id}` — OpenAPI summary/description 강화. **응답 형태 동일 (200 + `ShipPackageDetailResponse`)**. ✓

### Added (DB)
- `inventory_locations.quantity` 에 `CHECK (quantity >= 0)` (마이그 스크립트 1회). API 영향 없음. ✓
- `transaction_logs (item_id, created_at)` 복합 인덱스. API 영향 없음 (성능만). ✓

---

## Phase 5.4 (2026-04-26)

### Changed
- `GET /api/production/capacity` — `CapacityResponse` 의 `immediate` / `maximum` 필드에 Pydantic `Field(description=...)` 추가. **OpenAPI `/docs` 에서 의미 명확화**. 응답 형태 동일. ✓

### Fixed
- `POST /api/production/receipt` — 내부 N+1 제거 (Items/Inventory IN 쿼리 사전 로드). **응답 형태 동일, 성능 개선만**. ✓

### Removed (Internal)
- `main.py` 의 startup `Base.metadata.create_all` 제거. 신규 테이블은 `bootstrap_db.py --schema` (start.bat 자동 호출). API 영향 없음. ✓

---

## Phase 5.3 (2026-04-26)

### Added
- `GET /api/production/bom-check/{item_id}` — `response_model=BomCheckResponse` 부착. ✓
- `GET /api/production/capacity` — `response_model=CapacityResponse`. ✓
- `GET /api/settings/integrity/inventory` — `response_model=IntegrityCheckResponse`. ✓
- `POST /api/settings/integrity/repair` — `response_model=IntegrityRepairResponse`. ✓
- 모든 응답에 `extra.request_id` 포함 (5 exception handler 일관). ✓

### Changed
- `limit` 파라미터 상한 통일 — `admin_audit / alerts / settings`: `le=1000` → `le=2000`. ✓ (기존 클라이언트는 영향 없음, 더 큰 값 허용)
- `settings.py` 의 6개 raw `HTTPException` → `http_error()` + `ErrorCode` 마이그 — error response 본문이 `{"detail":{"code","message"}}` 일관. ✓ (`extractErrorMessage` 가 자동 처리)

### Internal
- Pydantic v2 마이그 (`AdminAuditLogResponse` 의 `class Config` → `model_config = ConfigDict`). API 영향 없음. ✓

---

## Phase 5.2 (2026-04-26)

### Added
- `GET /api/admin/audit-logs` — 관리자 감사로그 조회 (filter: `action`, `target_type`, `since`, `limit`). ✓
- `audit.record(...)` 내부 통합 — 5개 라우터 (items/employees/bom/settings/codes) 의 마스터/설정 변경에 자동 기록. **응답 형태 변경 없음**. ✓

---

## Phase 5.1 (2026-04-26)

### Fixed
- `GET /api/production/capacity` — `immediate` 가 `warehouse_available` 기준으로 정정 (이전: `total - pending`, 이후: `warehouse - pending`). **production_receipt 의 실제 차감식과 일치**. ✓ (계산 결과만 변경, 형태 동일)
- `GET /api/bom/{parent_id}/tree` — 내부 N+1 제거 (`build_bom_cache` + IN 쿼리). **응답 형태 동일**. ✓
- `schemas.py` 의 응답 모델 `erp_code` 타입 통일 (`Optional[str] = None`). ✓

---

## Conventions

- **Breaking 표시**: ✗ (기존 클라이언트가 영향받음)
- **Non-breaking 표시**: ✓ (기존 클라이언트 호환 유지)
- **Internal**: 외부 API 영향 없는 내부 정리

향후 외부 노출 시:
- Versioned routing (`/api/v1/...` 등) 도입
- Breaking 변경은 별도 phase 로 분리
- Deprecated 표기 후 N개 phase 후 Removed
