---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/FRONTEND_HOOKS_PLAN.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# FRONTEND_HOOKS_PLAN.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/FRONTEND_HOOKS_PLAN.md]]

## 원본 첫 줄 (또는 메타)

```
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
| **`useResource` 헬퍼** | ✅ **Phase 4** — `_components/_hooks/useResource.ts` 신설 (외부 라이브러리 미도입). 기존 3 View 데이터 페칭 적용은 Phase 5 에서 검토했으나 미세 동작 차이 가능성으로 **신규 코드 전용 인프라**로만 보존 (회귀 0 원칙). |
| **AdminMasterItemsContext + useAdminMasterItems** | ✅ Phase 5 — Props 9 → 0 |
| **AdminEmployeesContext + useAdminEmployees** | ✅ Phase 5 — Props 8 → 0 |
| **AdminModelsContext + useAdminModels** | ✅ Phase 5 — Props 6 → 0 |
| **BOM Where-Used UI** | ✅ Phase 5 — 관리자 BOM 우측 패널에 추가 |
| **`erp_code` 타입 백엔드 정합** | ✅ Phase 5.1 — `TransactionLog / ProductionCheckComponent / BackflushDetail` 등 타입을 `string \| null` 로 정정 (백엔드 응답이 Optional). HistoryDetailPanel 의 `[string,string][]` 단언 자리에 `?? "-"` 가드 추가. |
| **`useAdminBom.saveBomQty` 후 전체 BOM 갱신** | ✅ Phase 5.1 — 수량 수정 후 `refreshAllBom()` 호출 누락 수정. add/delete 와 동일하게 우측 "전체 BOM 현황" 즉시 갱신. |
```
