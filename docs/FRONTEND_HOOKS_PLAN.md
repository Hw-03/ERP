# 프론트 hook / 뷰 분할 설계서 (보류)

이번 `feat/erp-overhaul` 브랜치에서 **구현하지 않고** 다음 단계 작업의 근거로 남기는 설계서다. 공용 UI 부품(`common/`) 추출은 이번 단계에서 완료된 상태.

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
