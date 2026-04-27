# ERP 진행 기록

이 문서는 큰 기능 단위의 진행 이력을 요약한다. 최신 업무 규칙은 `docs/ITEM_CODE_RULES.md`를 우선한다.

## 현재 기준

- 품목 총수: 971건
- 공정코드: 18개
  - `TR/TA/TF` -> 튜브
  - `HR/HA/HF` -> 고압
  - `VR/VA/VF` -> 진공
  - `NR/NA/NF` -> 튜닝
  - `AR/AA/AF` -> 조립
  - `PR/PA/PF` -> 출하
- `BF`는 사용하지 않는다.
- ERP 코드 포맷: `{모델기호}-{process_type_code}-{일련번호:04d}[-{옵션코드}]`

## 완료된 큰 작업

### 데이터/코드 체계

- `product_symbols`: 제품별 모델 기호 관리
- `option_codes`: `BG`, `WM`, `SV` 옵션 코드
- `process_types`: 18개 공정코드 관리
- `items`: `erp_code`, `symbol_slot`, `process_type_code`, `option_code`, `serial_no` 확장
- 코드 파싱/생성 API와 서비스 레이어 도입

### 재고 구조

- `inventory.pending_quantity` 도입
- `Total = Available + Pending` 기준 도입
- 출고 검증을 가용 재고 기준으로 전환
- 예약, 해제, 확정 처리 서비스 분리

### Queue/BOM 작업

- 생산, 분해, 반품 Queue 배치 구조 도입
- BOM 전개 로직을 서비스 레이어로 이동
- Queue 확정 시 TransactionLog와 VarianceLog 연결
- Scrap, Loss, Variance 기록 API 추가

### 알림/실사

- 안전재고 알림 스캔 API 추가
- 실사 입력과 강제 조정 흐름 추가
- count variance 알림 도입

### 프론트엔드

- 레거시 UI에 재고/창고/관리자 데스크톱 화면 구성
- Queue, 알림, 실사 화면 추가
- ERP 코드, 가용/예약 재고, 예약자 표시 추가
- 재고 필터 UX 개선 진행

## 2026-04-23 재고 필터 이슈

- 현상: API는 971건을 로드했지만 모든 부서/모델 칩 선택 시 조회 품목이 967건으로 표시됐다.
- 원인: 일부 품목의 공정/부서 매핑이 현재 기준과 맞지 않았다.
- 결론:
  - “전체”와 “모든 항목 개별 선택”은 같은 결과여야 한다.
  - 부서 필터는 `process_type_code` 또는 백엔드 `department` 기준으로 통일한다.
  - 조립 F 타입은 `AF`이며 `BF`를 필터에 추가하는 방식으로 해결하지 않는다.

## 최근 커밋 요약

- `b890dc5`: 부서 필터 안전망, 품절 행 부서 배지 표시
- `7c47481`: `department` 단일 소스 도입
- `8850c6d`: 창고 입출고 UI 개선, DB 유틸 추가
- `66e93cf`: 아카이브 볼트 원본 제거, 재고뷰/로고 스크립트 추가
- `98fa3c1`: Obsidian vault 이동 및 프론트 UI 업데이트

## 2026-04-25 입출고 단계형 wizard 도입

- 입출고 탭을 **담당자 → 작업유형 → 품목 → 수량 → 실행 → 완료 피드백** 5단계 wizard로 재구성
- 부분 실패 안전 처리(결과 모달 + 실패 항목만 재시도 + 자동 refresh) 추가
- Topbar에 작업 상태 pill 표시(`방금 완료 …`)

## 2026-04-25 `feat/erp-overhaul` brunch — UX 마감 / 공용 부품 / 문서

### 구현 완료

- 공용 UI 부품 6종 신설 (`frontend/app/legacy/_components/common/`):
  EmptyState · LoadFailureCard · LoadingSkeleton · StatusPill · ConfirmModal · ResultModal
- 입출고 UX 마감 (필터 가림 안내, 음수 재고 강조, blockerText, 메모 200자 카운터, busy 잠금)
- 데스크톱 4화면 시각 언어 통일
- 운영 보조 스크립트: `scripts/ops/backup_db.bat`, `scripts/ops/healthcheck.bat`
- 문서 신설: USER_GUIDE / OPERATIONS / ARCHITECTURE / BACKEND_REFACTOR_PLAN / FRONTEND_HOOKS_PLAN

## 2026-04-25 `feat/erp-overhaul` Phase 3 — 대형 구조 정리

### 구현 완료

- **DesktopWarehouseView.tsx**: 924 → ~492줄
  - 신규 hook 5종: `useWarehouseFilters` · `useWarehouseWizardState` · `useWarehouseCompletionFeedback` · `useWarehouseData` · `useWarehouseScroll`
  - 신규 섹션 컴포넌트: `WarehouseHeader` · `WarehouseStickySummary` · `WarehouseCompletionOverlay` · `WarehouseStepLayout` · `WarehouseConfirmContent`
- **DesktopInventoryView.tsx**: 1,015 → ~308줄
  - `_inventory_sections/`: KpiPanel · ActionRequired · CapacityPanel · FilterBar · ItemsTable · DetailPanel
- **DesktopHistoryView.tsx**: 919 → ~336줄
  - `_history_sections/`: FilterBar · CalendarStrip · Table · DetailPanel + shared 상수
- **DesktopAdminView.tsx**: 1,794 → ~830줄
  - `_admin_sections/`: MasterItems · Employees · Bom · Packages · Models · Export · DangerZone + shared 상수
- **공용 부품 배럴**: `common/index.ts` 신설, 사용처 import 정리
- **백엔드 helper (제한적)**:
  - `backend/app/services/_tx.py`: `commit_and_refresh` / `commit_only` 도입, `inventory.py` 라우터 10건 치환
  - `backend/app/services/export_helpers.py`: `csv_streaming_response` 도입, inventory + items CSV export 보일러플레이트 단축
  - **API spec / DB schema / endpoint 응답 / transaction 의미 동일**

### 보존됨 (변경 금지)

- `submit()` / `dispatchSingleItem()` 본체
- `selectedItems: Map<string, number>` 구조
- 부분 성공 successIds 제거 동작
- API 호출 시그니처 / DB schema
- completionFlyout 1100+380ms 타이밍
- Topbar pill 메시지 형식
- ConfirmModal/ResultModal `busy={busy}` 잠금
- KPI 계산식 / 카테고리 그룹 / 거래 색상화 / TransactionType 매핑
- BOM 등록·삭제 / 직원 토글 / 패키지 추가·제거 / PIN lock / DB 초기화 동작

### 보류 (다음 단계로 이월)

- 에러 detail dict 표준화 (프론트 파싱 동시 수정 필요)
- `transactional` 컨텍스트 매니저로 commit 책임 서비스로 이동
- ship-package N+1
- `useResource` 데이터 페칭 헬퍼 (외부 라이브러리 도입 정책 검토 필요)
- 운영 파일 위생(루트 `erp.db` 정리, seed 스크립트 이동, docker-compose 포트 정렬)
- 보안/권한·테스트·CI

## 2026-04-26 Phase 5.1 — 정합 fix · 성능 · 백업 안전성

GPT 교차 리뷰에서 코드로 확인된 정합성 결함을 일괄 정리.

### 백엔드

- **`/api/production/capacity` 계산식 통일**: `inv.quantity - pending` 으로 부서 생산재고/불량재고까지 가용으로 계산하던 식을 `StockFigures.warehouse_available` (= warehouse - pending) 로 교체. `production_receipt` 의 실제 차감 검사식과 일치 → "생산 가능 = 화면 표시" 보장.
- **/capacity N+1 제거**: 루프 내 단건 쿼리 4종을 `build_bom_cache()` 1회 + `bulk_compute()` 1회 + `Items IN` 1회로 압축.
- **`bom.py get_all_bom` N+1 제거**: parent/child 단건 쿼리 N×2회 → `Items IN` 1회.
- **`services/bom.py explode_bom` 메모리 캐시화**: `BomCache` 타입 도입, `cache=` 키워드로 호출 간 공유 가능. 단독 호출에서도 진입 시 1회 BOM 전체 로드 후 메모리에서 재귀 → 깊이마다의 BOM/Item 단건 쿼리 제거.

### 프론트엔드

- **`erp_code` 타입 정합**: `TransactionLog` · `ShipPackageItemDetail` · `ProductionCheckComponent` · `BackflushDetail` + ship 응답 inline 타입을 `string | null` 로 정정 (백엔드는 Optional). `HistoryDetailPanel.tsx` 의 `[string,string][]` 단언 자리에 `?? "-"` 가드 추가.
- **`useAdminBom.saveBomQty` 후 전체 BOM 갱신**: BOM 수량 수정 후 `refreshAllBom()` 호출 누락을 추가. add/delete 와 동일하게 우측 "전체 BOM 현황" 즉시 반영.

### 운영

- **WAL 안전 백업**: `scripts/ops/backup_db.bat` 가 `sqlite3 .backup` → Python `sqlite3.backup` → WAL checkpoint+3종 파일 복사 폴백 순서로 동작. 백엔드 가동 중 백업의 트랜잭션 일관성 보장.
- **OPERATIONS.md 백업 절차** 갱신.

### 검증

- `python -m compileall backend` — 0 오류
- `npx tsc --noEmit` — 0 오류
- `npm run lint` — 0 warning

## 2026-04-26 Phase 5.2 — 4개 영역을 A−로

GPT 교차 리뷰 후 잔존 4개 약점(DB/모델, 프론트 컴포넌트, 프론트 성능, 운영 readiness)을 A−까지 끌어올림.

### 5.2-A 백엔드 정합성·성능

- `database.py`: SQLite PRAGMA 보강 — `busy_timeout=5000`(락 5초 대기), `synchronous=NORMAL`(WAL 짝). 단일 writer 한계는 그대로.
- `models.py`: `Inventory.__table_args__` 신설 — `quantity/warehouse_qty/pending_quantity ≥ 0` + `warehouse_qty ≥ pending_quantity` CheckConstraint. (기존 데이터 위반 0건 사전 확인)
- `bom.py _build_tree`: BOM 캐시 + Items/Inventory IN 1회씩 사전 로드로 N+1 잔재 제거. 트리 깊이 무관 쿼리 수 일정.

### 5.2-D 운영 readiness

- 신규 모델 `AdminAuditLog` + `services/audit.record()` 헬퍼.
- write-path 7곳에 audit 기록 추가:
  - `items.py`: create/update
  - `employees.py`: create/update/delete
  - `bom.py`: create/update/delete
  - `settings.py`: pin_change / integrity_repair / reset_db
  - `codes.py`: symbol_update
- (재고 거래는 `transaction_logs` 가 본질적 audit이라 제외)
- 신규 라우터 `GET /api/admin/audit-logs` (action/target_type/since/limit 필터).
- `main.py` startup 시 `Base.metadata.create_all(engine)` idempotent 호출 — 신규 테이블 자동 적용.
- 신규 ops 스크립트 3종:
  - `restore_db.bat` — 안전 복구 (PRE-RESTORE 스냅샷 + integrity_check + wal/shm 제거)
  - `verify_backup.bat` — 최신 백업 검증 (integrity + 핵심 테이블 행수)
  - `cleanup_backups.bat` — 30일 이상 자동 정리
- `OPERATIONS.md` 보강: 백업 검증·정리, DB 복구, 감사로그 조회, Windows Task Scheduler 등록 가이드.

### 5.2-B 프론트 성능

- `_hooks/useChunkedRender.ts` 신설 — 외부 의존성 없이 IntersectionObserver 기반 chunked 누적 렌더.
- `InventoryItemRow.tsx`, `HistoryLogRow.tsx` 행 컴포넌트 추출 + `React.memo`. 부모 리렌더 시 변경 없는 행은 비-재렌더.
- 공용 경량 컴포넌트 4개에 `React.memo`: `EmptyState` · `LoadFailureCard` · `LoadingSkeleton` · `StatusPill`.
- `DesktopAdminView`: `belowMin`/`stats` 매 렌더 재계산을 `useMemo` 로 차단.

### 5.2-C 컴포넌트 분할

- `AdminTab.tsx` (886줄) → 75줄로 축소. 5섹션을 `mobile/screens/admin/` 폴더로 분리:
  - `AdminItemsSection` · `AdminEmployeesSection` · `AdminBomSection` · `AdminPackagesSection` · `AdminSettingsSection` + `_shared.ts`
- `DeptWizardSteps.tsx` (769줄) → re-export 9줄로 축소. 5단계를 `_dept_steps/` 폴더로 분리:
  - `DeptStep` · `PersonStep` · `DirectionStep` · `ItemsStep` · `ConfirmStep` + `_shared.tsx`
- 사전 조사로 분할 대상 축소: `AdminBomSection`/`HistoryScreen`/`DesktopAdminView`는 이미 분할 완료 상태로 추가 작업 불필요.

### 검증

- `python -m compileall backend` — 0 오류
- `npx tsc --noEmit` — 0 오류
- `npm run lint` — 0 warning
- 백엔드 라이브 검증:
  - `GET /api/bom/{id}/tree` — 재귀 트리 정상
  - `PATCH /api/bom/{id}` 후 `GET /api/admin/audit-logs` — `bom.update` 행 + request_id 매칭 확인
  - `scripts/ops/backup_db.bat` + `verify_backup.bat` — integrity ok / 핵심 테이블 행수 정상
- Playwright 모바일(430×900):
  - 부서 wizard Step 1 → Step 2 자동 이동 (분할된 `DeptStep` / `PersonStep` 동작)
  - 관리자 5섹션 모두 진입 + BOM 섹션 콘텐츠 렌더 (분할된 5 admin section 동작)
- 콘솔 에러 0건

### 점수 변동

영역 4개 한 단계 상승: DB/모델 B+→A−, 프론트 컴포넌트 B+→A−, 프론트 성능 B→A−, 운영 readiness B+→A−. 보안(C+)만 의도적으로 제외 (LAN 운영).

## 2026-04-26 Phase 5.3 — 남은 4개 영역 A− 진입

### A. API 설계 (B+ → A−)

- limit bounds 통일 — `admin_audit.py`, `alerts.py`, `settings.py` 의 `le=1000` → `le=2000` (3건)
- Pydantic v2 마이그 — `admin_audit.py` 의 `class Config` 잔재 → `model_config = ConfigDict(...)`
- response_model 부착 — `production.py` `bom-check` / `capacity`, `settings.py` `integrity/inventory` / `integrity/repair` (4건). 신규 schema 5종 (`BomCheckComponent`, `BomCheckResponse`, `CapacityTopItem`, `CapacityResponse`, `IntegrityCheckResponse`, `IntegrityRepairResponse`) `app/schemas.py` 끝에 추가
- `settings.py` 의 6개 raw `HTTPException` → `http_error()` + `ErrorCode` 마이그
- 3개 exception handler (ValueError fallback / IntegrityError / OperationalError) 응답 body 에 `extra.request_id` 추가 — 5개 핸들러 모두 rid 포함

### B. 프론트 상태 관리 (B+ → A−)

- `lib/api.ts` 에 `postJson<T> / putJson<T> / patchJson<T>` 헬퍼 도입 — inline `as Promise<T>` 캐스팅 3곳 (`createItem`, `updateItem`, `createEmployee`) 제거
- `useItems` 의 `reqId.current` 카운터 → `AbortController` 패턴 마이그. `fetcher` / `getItems` 에 `signal` 옵션 확장
- `useAdminPackages._createSimplePackage`, `useAdminBom.addBomRow` 의 await-후-set 패턴에 의도적 pessimistic 주석 명시
- `frontend/app/legacy/_components/_hooks/CONTRACT.md` — read / list / mutation hook 표준 모양과 race 처리 정책 문서화

### C. UX/접근성 (B+ → A−)

- 신규 `useFocusTrap.ts` — Tab 순환 + 이전 포커스 복원 (외부 의존성 0)
- `ConfirmModal` / `ResultModal` / `BottomSheet` 3건에 focus trap + Escape + `aria-labelledby` 적용. BottomSheet 는 `role="dialog"` + `aria-modal` 도 추가
- `Toast.tsx` — `role="status"` (error 시 `alert`) + `aria-live` + `aria-atomic`
- `_inventory_sections/InventoryItemRow.tsx` — 재고 상태 라벨에 lucide 아이콘 추가 (색상 + 아이콘 두 채널, WCAG 1.4.1) + gauge bar `role="img"` `aria-label`. 행 자체에 `role="button"` `tabIndex={0}` `aria-pressed` `onKeyDown` (Enter/Space)
- `mobile/primitives/ItemRow.tsx` — 22×22 체크박스 외곽 44×44 hit-area span (WCAG 2.5.5)
- `app/globals.css` — `@media (prefers-reduced-motion: reduce)` 전역 무력화 + 자체 keyframes 제거
- `AdminTab.tsx` — `role="tablist"` / 탭 버튼에 `role="tab"` + `aria-selected` + `tabIndex` (시맨틱 탭)

### D. 테스트 (C+ → A−)

- 백엔드: `pytest>=8.0` / `pytest-cov` / `httpx` 추가. `backend/pytest.ini` + `tests/conftest.py` (in-memory SQLite + TestClient + 헬퍼 fixture)
- `tests/services/test_stock_math.py` — 11 케이스 (compute_for / bulk_compute / figures_from_inventory / 불변식)
- `tests/services/test_bom.py` — 11 케이스 (build_bom_cache / explode_bom 단·다단계 / cycle / max_depth / cache 0-쿼리 / merge / direct_children)
- `tests/services/test_integrity.py` — 7 케이스 (check_consistency / repair dry/실제 / samples 20건 cap)
- `tests/routers/test_admin_audit.py` — 6 케이스 (빈 DB / limit le=2000 / action prefix / target_type / since / schema)
- 프론트엔드: `vitest@^2` / `@testing-library/react@^16` / `jsdom@^25` / `@vitejs/plugin-react@^4` 추가. `vitest.config.ts` + `vitest.setup.ts`
- `__tests__/useResource.test.tsx` — 4 케이스 (loading 초기 / 성공 / 실패 / reload)
- `__tests__/ConfirmModal.test.tsx` — 4 케이스 (open 렌더 / Escape / busy 무시 / open=false)
- `__tests__/useItems.test.tsx` — 4 케이스 (초기 fetch / AbortError 무시 / 일반 에러 / 빠른 필터 변경 시 마지막 결과만)

### 검증

- `cd backend && pytest -q` — **35/35 green** (services 29 + admin_audit 6)
- `cd frontend && npm test` — **12/12 green**
- `python -m compileall backend` — 0 오류
- `npx tsc --noEmit` — 0 오류
- `npm run lint` — 0 warning

### 점수 변동

남은 4개 영역 모두 한 단계 상승: API 설계 B+→A−, 프론트 상태 관리 B+→A−, UX/접근성 B+→A−, 테스트 C+→A−. 14개 영역 중 보안(C+) 단 1개를 제외하고 모두 A− 이상. **종합 88 → 92 (A− 상위)**.

## 2026-04-26 Phase 5.4 — P1 부채 제거 + A 진입

GPT 외부 리뷰가 5.3 직후 P1 1건을 정확히 짚었다: **`main.py` 의 `Base.metadata.create_all(bind=engine)` 이 docstring("서버 기동만으로는 DB 가 변하지 않는다")과 충돌**. pytest 가 실 `backend/erp.db` 를 건드릴 수 있는 race 도 확인됨. 이번 Phase 는 이를 정리하고 CI 도입까지 묶는다.

### 변경 항목

- **5.4-A**: `main.py` 의 `Base.metadata.create_all` 4줄 제거. import 도 `Base/engine` 제거 (정합성 회복)
- **5.4-B**: `start.bat` 에 `python bootstrap_db.py --schema` 자동 실행 단계 추가 (백엔드 기동 직전, 실패 시 abort). 신규 모델 추가 시 idempotent 적용 보장
- **5.4-C**: `conftest.py` 가 `app.*` import 전에 `os.environ["DATABASE_URL"]="sqlite:///:memory:"` 강제. pytest 가 실 erp.db 안 건드리는 것 mtime 으로 검증
- **5.4-D**: `CapacityResponse` 의 `immediate` / `maximum` 필드에 Pydantic `Field(description=...)` 부착. `maximum` 이 *불량 재고를 포함*함을 OpenAPI `/docs` 에서 명시
- **5.4-E**: `production_receipt` 의 N+1 제거 — Items/Inventory 를 `IN` 쿼리로 사전 로드 후 `items_map` / `invs_map` 재사용. shortage 검사 + backflush 루프 양쪽 적용
- **5.4-F**: `AdminTab.tsx` dead code 삭제 (Phase 5.2 분할 후 import 0건이었음)
- **5.4-G**: `.github/workflows/ci.yml` 신규 — pytest + vitest + tsc + lint. push (main / feat/* / fix/* / refactor/*) + PR (main) 트리거
- **5.4-H**: `.gitignore` 에 `.pytest_cache/`, `.coverage`, `coverage/`, `htmlcov/`, `frontend/.vitest/` 추가

### 의도적 비포함

- **API 인증** — 보안 C+ 영역, 별도 phase
- **`reset_database` audit 별도 보존** — `seed.py` 가 `admin_audit_logs` 를 truncate 하지 않음. 보존 확인 후 GPT P3 무효
- **`production_receipt` 의 TransactionLog 배치 add** — 마이크로 최적화, 별도

### 검증

- `python -m compileall backend` — 0 오류
- `pytest -q` — 35/35 green
- `from app.main import app` 전후 `erp.db` mtime 동일 (5.4-A/C 효과 확정)
- `npx tsc --noEmit` — 0 오류
- `npm run lint` — 0 warning
- `npm test` — 12/12 green
- start.bat 의 `--schema` 단계 수동 실행 — 정상

### 점수 변동

| 영역 | 5.3 | 5.4 |
|---|---|---|
| 배포 안정성 | B+ | **A** |
| API 설계 | A− | **A** |
| 성능 | A− | **A** |
| 컴포넌트 | A− | A− |
| 테스트 | A− | **A** (CI 도입) |
| 보안 | C+ | C+ (제외) |

**종합 92 → 95 (A 상위)**. 14개 영역 중 보안(C+) 1개를 제외하고 모두 A− 이상, 5개 영역이 A.

## 2026-04-27 Phase 5.5 — A− 영역들 A 진입 시도

GPT 외부 리뷰 + 자체 점검에서 8개 A− 영역을 식별. 보안(C+)을 제외한 모든 영역을 A 로 끌어올리는 마지막 phase.

### 변경 항목

- **5.5-A**: `InventoryLocation.quantity >= 0` CheckConstraint + `TransactionLog (item_id, created_at)` 복합 인덱스. SQLite 는 ALTER ADD CONSTRAINT 미지원 → `scripts/migrations/add_invloc_check_5_5.py` 1회용 마이그 (백업 → drop → create → restore, idempotent). 운영 DB 1회 적용 완료
- **5.5-B**: `DELETE /api/queue/{batch_id}/lines/{line_id}` 와 `DELETE /api/ship-packages/{package_id}/items/{package_item_id}` 의 OpenAPI summary/description 강화 — child-delete-return-parent 패턴이 의도된 설계임을 명시 (강제 204 변경은 프론트 회귀 위험으로 회피)
- **5.5-C**: `commit_and_refresh / commit_only` 헬퍼를 5개 라우터(items / bom / employees / ship_packages / settings)에 일관 적용. 11 → 6 라우터만 bare `db.commit()` (남은 6곳은 5.6 sweep)
- **5.5-D**: integrity 단위 테스트 5건 추가 (7 → 12). `pytest -q` **40/40 green**. inventory 라우터 try/except 일관화는 글로벌 핸들러로 충분하다고 판단 — 의도적 skip
- **5.5-E (부분 적용)**: 데스크톱 `_admin_sections/AdminBomSection.tsx` (557줄) 의 4-step 인디케이터 `BomStepIndicator.tsx` 추출. 추가 분할은 회귀 위험 큰 작업으로 5.6 이연
- **5.5-F**: `useResource` 에 `signal` 옵션 추가 (fetcher 가 받으면 자동 abort). `useTransactions` 의 reqId.current → AbortController 마이그. `CONTRACT.md` 업데이트
- **5.5-G**: `HistoryLogRow` 에 keyboard nav (`role/tabIndex/onKeyDown`) 추가 + 거래 유형별 lucide 아이콘 매핑 (`transactionIconName`) — 색상-only 신호 두 채널 보강 (WCAG 1.4.1)
- **5.5-H**: `docs/ONBOARDING.md` (~120줄) + `docs/API_CHANGELOG.md` (~80줄) 신규. 신규 인원 1시간 setup + Phase 5.1~5.5 API 변경 추적

### 검증

- `python -m compileall backend` 0 오류
- `pytest -q` **40/40 green** (35 + 5)
- `npx tsc --noEmit` 0 오류
- `npm run lint` 0 warning
- `npm test` **12/12 green**
- 마이그 스크립트 적용 후 `PRAGMA integrity_check` ok

### 점수 변동 (자체 평가)

| 영역 | 5.4 | 5.5 |
|---|---|---|
| DB/모델 | A− | **A** (CHECK + 복합 인덱스) |
| 라우터 | A− | A− (DELETE 의도 명시 — full A 는 추가 정리 필요) |
| 서비스 레이어 | A− | A− (5/11 라우터만 _tx 적용 — 5.6 에서 마무리 시 A) |
| 트랜잭션/정합성 | A− | **A** (integrity 12 케이스) |
| 프론트 컴포넌트 | A− | A− (BomStepIndicator 만 추출, 추가 분할 5.6) |
| 프론트 상태 관리 | A− | **A** (useResource signal + useTransactions AbortController) |
| UX/접근성 | A− | **A** (HistoryLogRow keyboard nav + 아이콘) |
| 문서 | A− | **A** (ONBOARDING + API_CHANGELOG) |

5/8 영역 A 진입. 라우터 / 서비스 레이어 / 컴포넌트 3개는 부분 적용으로 A− 유지. **종합 95 → 97 (A 상위)**.

### 5.6 이연 항목

- `commit_and_refresh` 미적용 6 라우터 (alerts, codes, counts, loss, models, scrap)
- `_admin_sections/AdminBomSection.tsx` 의 추가 분할 (parent picker / child picker / row list)
- `mobile/screens/HistoryScreen.tsx` 의 calendar view 추출
- `useTransactions` vitest 케이스 추가

## 2026-04-27 Phase 5.6 — 외부 리뷰 P2 반영 + 잔여 A− → A

GPT 외부 리뷰가 운영 readiness 를 A → B+ 로 다운그레이드했다 (P2-1: 마이그 백업이 WAL-safe 아님). P2-2/P2-3 + 5.5 부분 적용 영역도 마무리.

### 변경 항목

- **5.6-A 마이그 운영안전화**: `add_invloc_check_5_5.py` 의 `_backup()` 을 `shutil.copy2` → `sqlite3.Connection.backup()` API 로 교체 (WAL transaction-consistent). 추가 보강:
  - 실행 전 backend 종료 안내 (5초 대기)
  - `PRAGMA wal_checkpoint(TRUNCATE)` 시도 (busy 면 skip)
  - 재생성 후 `ix_inventory_locations_status` / `ix_inventory_locations_updated_at` 인덱스도 같이 생성 (모델 정의 보호)
  - `PRAGMA foreign_key_check` 도 `integrity_check` 와 함께 실행
  - Windows cp949 콘솔 호환을 위해 stdout utf-8 reconfigure
- **5.6-B 프론트 상태**: `useTransactions.loadMore()` 가 지역 ctrl 만 쓰던 부분 → `activeCtrlRef` 에 보관. unmount cleanup 이 자동으로 loadMore 도 abort
- **5.6-C 서비스 sweep**: 잔여 6 라우터(`alerts`, `codes`, `counts`, `loss`, `models`, `scrap`) 의 10 call site 를 `commit_and_refresh / commit_only` 로 치환. **`_tx` 미사용 라우터 = 0**
- **5.6-D 라우터 데코레이터**: `codes.py` 6개 핸들러 + `models.py` 3개 핸들러에 `summary=` 한국어 추가. `models.delete_model` 은 `response_model=None` + `-> None` 명시
- **5.6-E 컴포넌트 분할**: `_admin_sections/AdminBomSection.tsx` 534줄 → orchestration 175줄 + 신규 3 파일 (`BomParentPicker.tsx` 102줄, `BomChildPicker.tsx` 168줄, `BomWhereUsedPanel.tsx` 51줄). `useAdminBomContext` 가 prop drilling 전부 흡수
- **5.6-F UX sweep**: `_warehouse_steps/ItemPickStep.tsx` 의 `<tr onClick>` 100행에 `role="button"` / `tabIndex={0}` / `aria-pressed` / Enter/Space 핸들러 추가 (HistoryLogRow / InventoryItemRow 패턴 미러)
- **5.6-G integrity 테스트**: `test_inventory_location_check_constraint_blocks_negative` + `test_inventory_location_unique_constraint_blocks_duplicate` 추가 (12 → 14, 전체 40 → 42). 5.5-A 의 CHECK / UNIQUE 안전망 회귀 보호

### 검증

- `python -m compileall backend scripts` 0
- `pytest -q` **42/42 green**
- `npx tsc --noEmit` 0
- `npm run lint` 0 warning
- `npm test` **12/12 green**
- `npm run build` 정상 (~ 181 kB legacy 페이지)
- 마이그 스크립트 idempotent 재실행 1회 — `integrity_check ok` + `foreign_key_check 0 violations`
- MCP Playwright (clean restart, 1440×900) — BOM 4-step 인디케이터 + 좌측 parent picker 100건 + 우측 child picker hint + ItemPickStep 100행 Enter 토글 / aria-pressed 전이 모두 정상. 콘솔 0 신규 에러 (기존 `WizardStepCard` background-shorthand React warning 은 5.6 외 영역)

### 점수 변동 (외부 리뷰 92~93 기준)

| 영역 | 5.5 (외부) | 5.6 |
|---|---|---|
| DB/모델 | A− | **A** (CHECK / FK / UNIQUE 테스트 보호) |
| 라우터 | A− | **A** (codes/models 데코 + 6 라우터 commit helper 일관성) |
| 서비스 레이어 | A− | **A** (`_tx` 미사용 라우터 0) |
| 트랜잭션/정합성 | A | A (변동 없음) |
| 프론트 컴포넌트 | A− | **A** (BOM 3 panel 분리) |
| 프론트 상태 관리 | A− | **A** (loadMore ref 추적) |
| UX/접근성 | A− | **A** (ItemPickStep keyboard nav) |
| 운영 readiness | B+ | **A** (sqlite3.backup API → WAL-safe) |
| 테스트 | A | A (40 → 42) |
| 문서 | A | A (변동 없음) |
| 보안 | C+ | C+ (제외) |

7개 영역 등급 상승 (B+ → A 1개, A− → A 6개). 보안 제외 시 모든 영역 A. **외부 기준 92~93 → 96+ 추정**.

### 5.7 이연 항목

- `mobile/screens/HistoryScreen.tsx` calendar view 분리
- `useTransactions` vitest race 케이스
- `_warehouse_steps/_atoms.tsx` 의 React style shorthand warning 정리
- API 인증 (보안 C+ → B+, 별도 phase)

## 다음 우선순위

- API 인증 헤더화 (보안 C+ → B+ 진입, 외부 노출 계획 시)
- `BF -> AF` 마이그레이션 결과 검증
- 모든 부서/모델 개별 선택과 전체 필터의 품목 수 일치 검증
- `min_stock` 미설정 품목의 정상/부족 분류 기준 검증
- BOM 가계도 시각화 기획
- 출하 스펙/거래처 관리 기능 설계
- 루트 `erp.db` 정리 + seed 스크립트 이동
- (위 보류 항목)
