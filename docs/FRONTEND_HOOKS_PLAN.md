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
| **AdminPackagesContext + useAdminPackages** | ✅ Phase 5 — Props 18 → 0 |
| **AdminMasterItemsContext + useAdminMasterItems** | ✅ Phase 5 — Props 9 → 0 |
| **AdminEmployeesContext + useAdminEmployees** | ✅ Phase 5 — Props 8 → 0 |
| **AdminModelsContext + useAdminModels** | ✅ Phase 5 — Props 6 → 0 |
| **BOM Where-Used UI** | ✅ Phase 5 — 관리자 BOM 우측 패널에 추가 |
| **`erp_code` 타입 백엔드 정합** | ✅ Phase 5.1 — `TransactionLog / ShipPackageItemDetail / ProductionCheckComponent / BackflushDetail` 등 4 타입을 `string \| null` 로 정정 (백엔드 응답이 Optional). HistoryDetailPanel 의 `[string,string][]` 단언 자리에 `?? "-"` 가드 추가. |
| **`useAdminBom.saveBomQty` 후 전체 BOM 갱신** | ✅ Phase 5.1 — 수량 수정 후 `refreshAllBom()` 호출 누락 수정. add/delete 와 동일하게 우측 "전체 BOM 현황" 즉시 갱신. |
| **`useWarehouseData.loading` 플래그** | ✅ **Phase 4** — 메인 데이터 첫 로딩 상태 노출. |
| **`_warehouse_steps.tsx` (1,135줄) 파일 분할** | ✅ **Phase 4** — `_warehouse_steps/` 디렉토리 8개 파일로 분리 (constants/atoms + 5 step). 외부 import 경로 호환. |
| **`AdminBomContext` + `useAdminBom`** | ✅ **Phase 4** — DesktopAdminView 의 BOM useState 10개 + useMemo 2개 + 액션 3개를 Provider/hook 으로 흡수. AdminBomSection Props 22 → 0. |
| **전역 ErrorBoundary** | ✅ **Phase 4** — `app/error.tsx` + `app/global-error.tsx`. |
| **에러 detail 파서** | ✅ **Phase 4** — `lib/api.ts:extractErrorMessage` 가 str / 구 dict / 신 dict (`{code, message, extra}`) 모두 처리. |

| 파일 | Phase 1 진입 시 | Phase 3 완료 후 |
|---|---|---|
| `DesktopAdminView.tsx` | 1,794줄 | ~830줄 |
| `DesktopWarehouseView.tsx` | 924줄 | ~492줄 |
| `DesktopInventoryView.tsx` | 1,015줄 | ~308줄 |
| `DesktopHistoryView.tsx` | 919줄 | ~336줄 |

이하 본문은 *왜 그렇게 분할했는가*에 대한 근거 자료로 남겨둔다.

---

## 구 설계서 (배경 — 완료된 항목)

## 배경

| 컴포넌트 | 줄 수 | useState 개수 | 평가 |
|---|---|---|---|
| `DesktopAdminView.tsx` | 1,783 | 다수 | 가장 큼 — 단계별 분할 필요 |
| `DesktopWarehouseView.tsx` | 1,074 | 20+ | wizard 부모. hook 추출 강한 후보 |
| `_warehouse_steps.tsx` | 1,056 | 분리 OK | 5개 step 컴포넌트 잘 나뉨 |
| `DesktopInventoryView.tsx` | 1,024 | 다수 | KPI/필터/테이블 섹션 분할 가능 |
| `DesktopHistoryView.tsx` | 909 | 다수 | 필터/테이블/상세 패널 분할 가능 |

이번 단계에서는 안전성 우선으로 분할 작업을 보류했다. 공용 부품 치환만 적용했고 핵심 로직(`submit`/`dispatchSingleItem`/`selectedItems: Map`)은 손대지 않았다.

## 1. `useWarehouseWizardState`

### 추출 범위

`DesktopWarehouseView.tsx` 의 다음 state + derivation 을 한 hook으로 묶는다.

```ts
// state
workType, rawDirection, warehouseDirection, deptDirection, selectedDept, defectiveSource
employeeId, selectedItems, selectedPackage
referenceNo, notes
forcedStep, step2Confirmed, employeeExpanded, pendingScrollId
showConfirm, resultModal, lastResult, completionFlyout, completionPhase

// derivation
selectedEmployee, isOutbound, effectiveLabel, shortLabel, isCaution, accent
totalQty, quantityInvalid, canExecute, stockShortage, blockerText
step1Done, step2Ready, step2Done, hasItems
step1State, step2State, showStep3, showStep4, showStep5
step1Summary, step2Summary, itemsSummary, stickySummary

// wrapped setters (step2Confirmed reset)
changeWorkType, changeRawDir, changeWarehouseDir, changeDeptDir, changeSelectedDept,
changeDefectiveSource, selectEmployee, confirmStep2
```

### 시그니처(안)

```ts
type WizardArgs = {
  items: Item[];
  packages: ShipPackage[];
  employees: Employee[];
  preselectedItem?: Item | null;
};

type WizardState = {
  // 1단계
  employeeId: string;
  selectedEmployee: Employee | null;
  selectEmployee: (id: string) => void;
  // 2단계
  workType: WorkType;
  changeWorkType: (wt: WorkType) => void;
  // ... (이하 derivation/setters 모두 노출)
  // gating
  step1Done: boolean; step2Done: boolean; showStep3: boolean; showStep4: boolean; showStep5: boolean;
  // ...
};

export function useWarehouseWizardState(args: WizardArgs): WizardState
```

### 위험 / 검증

- **selectedItems: Map<string, number> 구조 유지 필수**
- 변경 후 입출고 5단계 + 6 작업유형 + 최종 확인 모달 + 부분 실패 + 부서 자동 reset 회귀 0건이어야 함
- 변경 단위는 한 번에 하나의 hook (wizardState만 먼저)

## 2. `useWarehouseSubmit`

`submit()` + `dispatchSingleItem()` + 결과 모달/플라이아웃 타이머 + Topbar pill 동기화를 묶는다.

```ts
type SubmitArgs = {
  // 입력
  api: typeof import("@/lib/api").api;
  selectedEmployee: Employee | null;
  workType: WorkType;
  rawDirection: Direction;
  warehouseDirection: TransferDirection;
  deptDirection: Direction;
  selectedDept: Department;
  defectiveSource: DefectiveSource;
  selectedItems: Map<string, number>;
  selectedPackage: ShipPackage | null;
  notes: string;
  referenceNo: string;
  effectiveLabel: string;
  // 상태/콜백
  setItems: (it: Item[]) => void;
  setSelectedItems: Dispatch<SetStateAction<Map<string, number>>>;
  setNotes: (s: string) => void;
  setReferenceNo: (s: string) => void;
  setStep2Confirmed: (b: boolean) => void;
  setForcedStep: (s: 1 | 2 | null) => void;
  globalSearch: string;
  onStatusChange: (s: string) => void;
  onSubmitSuccess?: () => void;
};

type SubmitState = {
  submitting: boolean;
  error: string | null;
  resultModal: ResultModalState | null;
  lastResult: { count: number; label: string } | null;
  completionFlyout: { nonce: number; kind: "in" | "out"; count: number } | null;
  completionPhase: "show" | "out";
  submit: () => Promise<void>;
  dismissResult: () => void;
  retryFailed: () => void;       // resultModal=partial → showConfirm 재오픈
  retryAll: () => void;          // resultModal=fail → showConfirm 재오픈
};

export function useWarehouseSubmit(args: SubmitArgs): SubmitState
```

### 주의

- API 호출 시그니처(`shipInventory`, `transferToProduction`, ...) 는 그대로 사용
- `successIds.delete` 후 selectedItems에 실패 항목만 남는 동작 유지(이중 commit 방지)
- 자동 refresh: 부분 성공 시에도 `getItems()` 재호출

## 3. `useWarehouseFilters`

```ts
type FilterState = {
  dept: string; setDept: (v: string) => void;
  modelFilter: string; setModelFilter: (v: string) => void;
  categoryFilter: string; setCategoryFilter: (v: string) => void;
  localSearch: string; setLocalSearch: (v: string) => void;
  displayLimit: number; setDisplayLimit: Dispatch<SetStateAction<number>>;
  filteredItems: Item[];
  filteredPackages: ShipPackage[];
  hiddenSelectedCount: number;
  hasActiveFilter: boolean;
  clearFilters: () => void;
};

export function useWarehouseFilters(args: {
  items: Item[];
  packages: ShipPackage[];
  selectedItems: Map<string, number>;
  globalSearch: string;
}): FilterState
```

(현재 `_warehouse_steps.tsx:ItemPickStep` 안에 인라인으로 들어간 `hiddenSelectedCount`/`clearFilters` 도 이 hook으로 옮긴다.)

## 4. View 섹션 분할

거대 컴포넌트 본체는 다음과 같이 의미 단위로 자른다.

```
_inventory_sections/
  KpiCards.tsx
  ActionRequiredPanel.tsx
  CategoryBreakdown.tsx
  ItemsTable.tsx

_history_sections/
  HistoryFilters.tsx
  HistoryCalendar.tsx
  HistoryTable.tsx
  HistoryDetailPanel.tsx

_admin_sections/
  MasterItemsSection.tsx
  EmployeesSection.tsx
  ModelsSection.tsx
  BomSection.tsx
  PackagesSection.tsx
  ExportSection.tsx
  SettingsSection.tsx       # PIN/위험 영역 — 별도 검토
```

분할 원칙:

1. **단순 JSX 분리가 아니라 의미 단위**
2. props로 데이터·콜백을 받고 상태는 부모가 보유 → 섹션은 stateless에 가깝게
3. `DesktopAdminView` 의 위험 영역(삭제·초기화·PIN)은 마지막에 별도 검토 — 보안과 함께 다루는 다음 단계로 미룸

## 5. 데이터 페칭 헬퍼 `useApi`

외부 라이브러리 추가 금지 전제로 자체 hook.

```ts
type Resource<T> = {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useResource<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  options?: { initial?: T },
): Resource<T>
```

각 View가 동일한 모양의 로딩/에러/재시도를 갖게 하여 `LoadFailureCard` 와 `LoadingSkeleton` 의 사용을 평준화한다.

## 6. 진행 순서 (권장)

1. `useWarehouseFilters` 단독 추출 → 빌드/회귀 확인
2. `useWarehouseSubmit` 추출 → 빌드/회귀 확인 (submit 본체 로직 동일성 확인)
3. `useWarehouseWizardState` 추출 → 빌드/회귀 확인
4. `useResource` 도입 + InventoryView 1곳에서 시범 적용
5. `_history_sections/` 분할
6. `_inventory_sections/` 분할
7. `_admin_sections/` 분할 (위험 영역 제외)

각 단계마다 `npm run lint` / `npx tsc --noEmit` / `npm run build` 통과 + 다크/라이트 + 입출고 wizard 회귀 0건.

## 7. 변경 금지 항목

- `selectedItems: Map<string, number>` 구조
- API 호출 시그니처(`api.shipInventory` 등)
- 부분 성공 시 successIds 제거 동작
- Topbar pill 메시지 형식("방금 완료 · ...")
- completionFlyout 1.1s + 380ms 애니메이션 타이밍
- `LEGACY_COLORS` 토큰 키 변경
- 새 외부 라이브러리(virtual scroll, SWR, React Query 등)

## 8. 보류 사유

- 단일 PR로 진행하면 디프가 너무 커서 회귀 식별이 어렵다
- wizard 핵심 로직 이동은 운영 데이터에 직접 영향이 가는 부분 — 신중한 별도 사이클 권장
- 본 단계에서는 사용자 체감 마감(공용 부품 + UX 마감) 을 먼저 끝내는 것이 ROI 가 높다
