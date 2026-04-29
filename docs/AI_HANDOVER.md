# AI Handover

이 문서는 Claude/Codex가 같은 MES 프로젝트를 이어서 작업할 때 보는 최신 인수인계 문서다.

## 현재 상태 (2026-04-26 Phase 4 update)

- 프로젝트: DEXCOWIN 재고 관리 MES (경량 MES 프로토타입)
- 백엔드: FastAPI + SQLAlchemy + SQLite (`backend/erp.db`)
- 프론트엔드: Next.js 14 + Tailwind CSS
- 주 화면: `/legacy` (대시보드 / 입출고 / 입출고 내역 / 관리자)
- 기준 데이터: 통합 품목 971건
- 현재 브랜치: `feat/erp-overhaul`

## Phase 5 결과 (2026-04-26)

회귀 0 보장 하에 76점 → 약 84~86 도달을 목표로 한 안전 한정 개선.

### 백엔드
- 모든 라우터(19개 중 settings.py 제외 12개)의 ~76 HTTPException 을 `routers/_errors.http_error` 로 마이그. 메시지 동일, code 추가만.
- 새 ErrorCode: NOT_FOUND, BAD_REQUEST, CONFLICT, UNPROCESSABLE, BUSINESS_RULE.
- `request_id` middleware: X-Request-Id 헤더 자동 발급 + 응답 헤더 부착. 로그에 포함.
- OpenAPI 16개 태그 description 보강 (system/items/employees/inventory/...).
- `.env` `CORS_EXTRA_ORIGINS` 변수 실제 wiring (콤마 구분, 변수 미설정 시 기본 origins 그대로).

### 프론트엔드
- Admin Context 4섹션 확장 (Phase 4 의 BomContext 패턴 복제):
  - AdminPackagesProvider: 18-prop drilling → 0
  - AdminMasterItemsProvider: 9-prop → 0 (visibleItems 메모 + addItem/saveItemField 흡수)
  - AdminEmployeesProvider: 8-prop → 0
  - AdminModelsProvider: 6-prop → 0
- DesktopAdminView 대폭 축소: 733줄 → 약 500줄 예상 (검증 필요).
- BOM Where-Used UI: 관리자 BOM 우측 패널에 "이 품목이 사용되는 곳" 카드 추가. parent 선택 시 자동 fetch.
- `lib/api.ts:getBOMWhereUsed` 추가.
- useResource 훅은 Phase 4 에 도입했으나 기존 3 View 의 데이터 페칭은 미세 동작 차이 위험으로 **무변경**. 신규 코드 전용 인프라로 보존.

### 절대 무변경 (Phase 5 금지 항목)
- services/inventory.py (445줄), routers/items.py (436줄), routers/production.py (331줄)
- ItemPickStep.tsx (359줄), Mobile/Desktop wizard 공유 훅
- start.bat 포트 파라미터화, settings.py PIN 라우터
- selectedItems Map, submit() 본체, completionFlyout 타이밍, LEGACY_COLORS 토큰

## Phase 4 결과 (2026-04-26)

10개 항목 모두 80점 이상 목표. 17개 체크포인트 작업 완료. 자동 검증 통과(tsc/lint/build, compileall).

### 백엔드
- `routers/_errors.py` 신설 — `ErrorCode` 상수 + `http_error()` 표준 dict 응답.
- `app/_logging.py` 신설 — RotatingFileHandler `backend/logs/erp.log` (5MB × 5).
- 전역 예외 핸들러 — ValueError(422) / IntegrityError(409) / OperationalError(503) / Exception(500). Pydantic ValidationError 는 500 으로 분리.
- `routers/inventory.py` (807줄) → `routers/inventory/` 패키지 9개 파일 분할.
- BOM Where-Used: `GET /api/bom/where-used/{item_id}`.
- export endpoint: `start_date/end_date` 필수 + 50,000행 상한.
- `stock_math.bulk_compute` 단건/다건 통일, `to_response_bulk` 로 N+1 제거.

### 프론트엔드
- `_warehouse_steps.tsx` (1,135줄) → `_warehouse_steps/` 디렉토리 8 파일.
- `AdminBomProvider` + `useAdminBom` — AdminBomSection Props 22 → 0, DesktopAdminView 827 → 733줄.
- `app/error.tsx` + `app/global-error.tsx` — 전역 ErrorBoundary.
- `lib/api.ts:extractErrorMessage` — str / 구 dict / 신 dict 응답 통일 파싱.
- `useResource` 훅 + `useWarehouseData.loading` 플래그.

### 문서/운영
- `docs/GLOSSARY.md`, `docs/ERD.md` 신설.
- `docs/BACKEND_REFACTOR_PLAN.md`, `docs/FRONTEND_HOOKS_PLAN.md` 보류 사유 + Phase 4 완료 표기.
- `.env.example` 확장 (PORT, LOG_LEVEL, LOG_DIR, CORS_EXTRA_ORIGINS).
- `scripts/ops/reconcile_inventory.bat` — 정합성 1차 진단 + 백업.

## 반드시 지킬 기준

- 품목코드 기준 문서: `docs/ITEM_CODE_RULES.md`
- 조립 F 타입은 `AF`. `BF` 는 사용하지 않는다.
- 부서 필터는 `process_type_code` 또는 백엔드 `department` 기준.
- "전체" 와 "모든 부서/모델 개별 선택" 은 같은 결과여야 한다.
- 입출고 wizard 5단계 흐름 / `selectedItems: Map` / `submit`·`dispatchSingleItem` 본체 / API 스펙 / DB 스키마 모두 보존한다.

## 이번 brunch (`feat/erp-overhaul`) 결과

### 구현됨

1. **공용 UI 부품 6종** — `frontend/app/legacy/_components/common/` + `index.ts` 배럴
   - `EmptyState.tsx` / `LoadFailureCard.tsx` / `LoadingSkeleton.tsx`
   - `StatusPill.tsx` (+ `inferToneFromStatus()`)
   - `ConfirmModal.tsx` / `ResultModal.tsx` (busy 잠금 / primaryAction)
2. **입출고 UX 마감** — 필터 가림 안내 / 음수 재고 강조 / blockerText / 메모 200자 카운터 / busy 잠금
3. **Inventory / History / Admin / Topbar 시각 언어 통일** — EmptyState · StatusPill 통일
4. **Phase 3 — 대형 구조 정리 (이번 단계 핵심)**
   - DesktopWarehouseView.tsx 924 → ~492줄
     - 신규 hook: `useWarehouseFilters` · `useWarehouseWizardState` · `useWarehouseCompletionFeedback` · `useWarehouseData` · `useWarehouseScroll`
     - 신규 섹션 컴포넌트: `WarehouseHeader` · `WarehouseStickySummary` · `WarehouseCompletionOverlay` · `WarehouseStepLayout` · `WarehouseConfirmContent`
   - DesktopInventoryView.tsx 1,015 → ~308줄 (`_inventory_sections/` 6 컴포넌트)
   - DesktopHistoryView.tsx 919 → ~336줄 (`_history_sections/` 4 컴포넌트 + shared)
   - DesktopAdminView.tsx 1,794 → ~830줄 (`_admin_sections/` 7 컴포넌트 + shared)
5. **백엔드 helper 도입 (제한적)**
   - `backend/app/services/_tx.py` — `commit_and_refresh(db, *objs)` / `commit_only(db)`
   - `backend/app/services/export_helpers.py` — `csv_streaming_response(buffer, filename)`
   - `routers/inventory.py`의 10개 commit/refresh 패턴 helper 치환
   - `routers/items.py` + `routers/inventory.py` CSV export 보일러플레이트 통합
   - **API spec / DB schema / endpoint 응답 / transaction 의미 동일.**
6. **운영 스크립트** — `scripts/ops/backup_db.bat`, `scripts/ops/healthcheck.bat`
7. **문서 신설/갱신**
   - 갱신: `docs/ARCHITECTURE.md`, `docs/FRONTEND_HOOKS_PLAN.md`, `docs/BACKEND_REFACTOR_PLAN.md`, `docs/AI_HANDOVER.md`, `docs/CODEX_PROGRESS.md`
   - 운영: `docs/USER_GUIDE.md`, `docs/OPERATIONS.md`, `README.md`

### 변경 없음 (의도적)

- 백엔드 모델 / DB schema / API endpoint 시그니처 / Pydantic schemas
- `submit()` / `dispatchSingleItem()` 본체 / `selectedItems: Map<string, number>` 구조
- 부분 성공 successIds 제거 동작 / Topbar pill 형식 / completionFlyout 1100+380ms 타이밍
- ConfirmModal/ResultModal 동작·시각·props
- AA/AF, BA/BF 코드 / Alembic / 보안/인증 / 테스트 / CI
- `frontend/lib/api.ts`
- `start.bat`, `docker-compose.yml`
- `backend/erp.db`, 루트 `erp.db`
- `backend/seed*.py`, `bootstrap_db.py` 등 운영 보조 스크립트의 위치

### 검증

- `cd frontend && npx tsc --noEmit` — 통과
- `cd frontend && npm run lint` — No ESLint warnings or errors
- `cd frontend && npm run build` — 통과 (13/13 정적 페이지 생성)
- `python -m compileall backend` — 통과

## 다음 작업 후보 (남은 항목)

`docs/BACKEND_REFACTOR_PLAN.md`, `docs/FRONTEND_HOOKS_PLAN.md` 참고.

- 백엔드: 에러 detail dict 표준화, ship-package N+1, transactional context manager, 운영 파일 위생 (이번 Phase 3에서 commit/refresh helper + CSV export helper만 도입됨)
- 프론트: `useResource` 데이터 페칭 헬퍼 (외부 라이브러리 도입 정책 검토 필요)
- 운영: docker-compose 포트 정렬, 루트 `erp.db` 정리, seed 스크립트 위치 정리

## 검증 명령

```bash
python -m compileall backend
cd frontend
npm run lint
npx tsc --noEmit
npm run build
```

## 협업 규칙

- 코드 파일을 수정할 때는 `git diff` 로 현재 변경을 먼저 확인한다.
- `_archive/`, `_backup/`, `frontend/_archive/` 는 보관용 — 일반 작업 대상 아님.
- 보안/PIN/권한·CI·테스트는 별도 사이클에서 진행한다(이번 단계 범위 외).
