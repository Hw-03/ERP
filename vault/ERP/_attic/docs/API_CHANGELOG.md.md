---
type: file-explanation
source_path: "_attic/docs/API_CHANGELOG.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# API_CHANGELOG.md — API_CHANGELOG.md 설명

## 이 파일은 무엇을 책임지나

`API_CHANGELOG.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `API CHANGELOG`
- `Phase 5.6 (2026-04-27)`
- `Changed`
- `Fixed (Internal)`
- `Phase 5.5 (2026-04-27)`
- `Added (DB)`
- `Phase 5.4 (2026-04-26)`
- `Fixed`

## 연결되는 파일

- [[ERP/_attic/docs/📁_docs]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# API CHANGELOG

DEXCOWIN MES 의 외부 노출 가능한 API 변경 이력. 내부 LAN 운영 기준이지만 향후 외부 통합을 위한 형식 안정성을 추적한다.

각 항목 = 영향받은 엔드포인트 + 변경 종류 (Added / Changed / Fixed / Deprecated / Removed) + 호환성 영향 (Breaking ✗ / Non-breaking ✓).

---

## Phase 5.6 (2026-04-27)

### Changed
- `GET /api/codes/symbols`, `PUT /api/codes/symbols/{slot}`, `GET /api/codes/options`, `GET /api/codes/process-types`, `GET /api/codes/process-flows`, `POST /api/codes/parse`, `...
- `GET /api/models`, `POST /api/models`, `DELETE /api/models/{slot}` — 한국어 `summary` 추가. `delete_model` 은 `response_model=None` + `-> None` 명시 (이미 204). 응답 형태 동일. ✓
- 6 라우터(`alerts`, `codes`, `counts`, `loss`, `models`, `scrap`) 의 모든 write 핸들러 — 내부 commit 패턴 `commit_and_refresh` / `commit_only` 헬퍼로 일관화. **응답 형태 동일, 동시성/refresh 안정성만 개선**. ✓

### Fixed (Internal)
- 마이그 스크립트 `add_invloc_check_5_5.py` — 백업이 `shutil.copy2` → `sqlite3.Connection.backup()` API. **WAL transaction-consistent 백업**. API 영향 없음. ✓

---

## Phase 5.5 (2026-04-27)

### Changed
- `DELETE /api/queue/{batch_id}/lines/{line_id}` — OpenAPI summary/description 강화. **응답 형태 동일 (200 + `QueueBatchResponse`)**. ✓

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
```
