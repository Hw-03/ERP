---
type: file-explanation
source_path: "_attic/docs/FRONTEND_HOOKS_PLAN.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# FRONTEND_HOOKS_PLAN.md — FRONTEND_HOOKS_PLAN.md 설명

## 이 파일은 무엇을 책임지나

`FRONTEND_HOOKS_PLAN.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `프론트 hook / 뷰 분할 설계서`
- `진행 상태 (Phase 3 완료 기준)`
- `구 설계서 (배경 — 완료된 항목)`
- `배경`
- `1. `useWarehouseWizardState``
- `추출 범위`
- `시그니처(안)`
- `위험 / 검증`
- `2. `useWarehouseSubmit``
- `주의`

## 연결되는 파일

- [[ERP/_attic/docs/📁_docs]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 프론트 hook / 뷰 분할 설계서

`feat/erp-overhaul` 브랜치 누적 진행 결과(2026-04-25): **본 설계서의 대부분 항목이 구현 완료**됐다. 공용 UI 부품 + 5개 hook + 21개 섹션 컴포넌트가 도입됐고, 4개 Desktop View의 줄 수가 절반 이하로 줄었다.

## 진행 상태 (Phase 3 완료 기준)

| 항목 | 상태 |
|---|---|
| 공용 UI 부품(`common/` + `index.ts` 배럴) | ✅ 완료 |
| `useWarehouseFilters` | ✅ 완료 |
| `useWarehouseWizardState` | ✅ 완료 |
| `useWarehouseCompletionFeedback` | ✅ 완료 |
| `useWarehouseData` | ✅ 완료 |
| `useWarehouseScroll` | ✅ 완료 |
| `useWarehouseSubmit` (별도 분리) | ⏸ 보류 — `submit()` 본체는 부모 유지(변경 금지 정책) |
| `_inventory_sections/` 분할 | ✅ 6 섹션 분리 완료 |
| `_history_sections/` 분할 | ✅ 4 섹션 + shared 분리 완료 |
| `_admin_sections/` 분할 | ✅ 7 섹션 + shared 분리 완료 |
| **`useResource` 헬퍼** | ✅ **Phase 4** — `_components/_hooks/useResource.ts` 신설 (외부 라이브러리 미도입). 기존 3 View 데이터 페칭 적용은 Phase 5 에서 검토했으나 미세 동작 차이 가능성으로 **신규 코드 전용 인프라**로만 보존 (회귀 0 ...
| **AdminMasterItemsContext + useAdminMasterItems** | ✅ Phase 5 — Props 9 → 0 |
| **AdminEmployeesContext + useAdminEmployees** | ✅ Phase 5 — Props 8 → 0 |
| **AdminModelsContext + useAdminModels** | ✅ Phase 5 — Props 6 → 0 |
| **BOM Where-Used UI** | ✅ Phase 5 — 관리자 BOM 우측 패널에 추가 |
| **`erp_code` 타입 백엔드 정합** | ✅ Phase 5.1 — `TransactionLog / ProductionCheckComponent / BackflushDetail` 등 타입을 `string \| null` 로 정정 (백엔드 응답이 Optional). HistoryDetailPanel 의 `[s...
| **`useAdminBom.saveBomQty` 후 전체 BOM 갱신** | ✅ Phase 5.1 — 수량 수정 후 `refreshAllBom()` 호출 누락 수정. add/delete 와 동일하게 우측 "전체 BOM 현황" 즉시 갱신. |
| **`useChunkedRender` 가상 스크롤 hook** | ✅ Phase 5.2 — IntersectionObserver 기반 chunked 누적 렌더. 외부 의존성 0. |
| **InventoryItemRow / HistoryLogRow 추출 + memo** | ✅ Phase 5.2 — 거대 IIFE 행 로직을 `React.memo` 래핑된 행 컴포넌트로 추출. 부모 리렌더 시 변경 없는 행 재렌더 차단. |
| **공용 경량 컴포넌트 React.memo** | ✅ Phase 5.2 — `EmptyState / LoadFailureCard / LoadingSkeleton / StatusPill` 4개 래핑. |
| **DesktopAdminView useMemo 보강** | ✅ Phase 5.2 — `belowMin` / `stats` 매 렌더 재계산 차단. |
| **AdminTab.tsx 5섹션 분할** | ✅ Phase 5.2 — 886줄 → 75줄. `mobile/screens/admin/` 폴더에 5개 섹션(`AdminItemsSection / AdminEmployeesSection / AdminBomSection / AdminPackagesSection / Adm...
| **DeptWizardSteps.tsx 5단계 분할** | ✅ Phase 5.2 — 769줄 → re-export 9줄. `_dept_steps/` 폴더에 5개 단계(`DeptStep / PersonStep / DirectionStep / ItemsStep / ConfirmStep`) + `_shared.tsx`...
| **`useWarehouseData.loading` 플래그** | ✅ **Phase 4** — 메인 데이터 첫 로딩 상태 노출. |
| **`_warehouse_steps.tsx` (1,135줄) 파일 분할** | ✅ **Phase 4** — `_warehouse_steps/` 디렉토리 8개 파일로 분리 (constants/atoms + 5 step). 외부 import 경로 호환. |
| **`AdminBomContext` + `useAdminBom`** | ✅ **Phase 4** — DesktopAdminView 의 BOM useState 10개 + useMemo 2개 + 액션 3개를 Provider/hook 으로 흡수. AdminBomSection Props 22 → 0. |
| **전역 ErrorBoundary** | ✅ **Phase 4** — `app/error.tsx` + `app/global-error.tsx`. |
| **에러 detail 파서** | ✅ **Phase 4** — `lib/api.ts:extractErrorMessage` 가 str /
...
```
