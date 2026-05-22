---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/API_CHANGELOG.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# API_CHANGELOG.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/API_CHANGELOG.md]]

## 원본 첫 줄 (또는 메타)

```
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

```
