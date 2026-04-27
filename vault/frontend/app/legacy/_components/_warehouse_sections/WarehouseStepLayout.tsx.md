---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_warehouse_sections/WarehouseStepLayout.tsx
status: active
updated: 2026-04-27
source_sha: 53f509b909e7
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# WarehouseStepLayout.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_warehouse_sections/WarehouseStepLayout.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `8535` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_warehouse_sections/_warehouse_sections|frontend/app/legacy/_components/_warehouse_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

> 전체 285줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````tsx
"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Department, Employee, Item, ProductModel, ShipPackage } from "@/lib/api";
import {
  EmployeeStep,
  ExecuteStep,
  ItemPickStep,
  QuantityStep,
  WizardStepCard,
  WorkTypeStep,
  type DefectiveSource,
  type Direction,
  type TransferDirection,
  type WorkType,
} from "../_warehouse_steps";

type StepState = "active" | "complete" | "locked";

type WizardLike = {
  workType: WorkType;
  rawDirection: Direction;
  warehouseDirection: TransferDirection;
  deptDirection: Direction;
  selectedDept: Department;
  defectiveSource: DefectiveSource;
  changeRawDir: (d: Direction) => void;
  changeWarehouseDir: (d: TransferDirection) => void;
  changeDeptDir: (d: Direction) => void;
  changeSelectedDept: (d: Department) => void;
  changeDefectiveSource: (s: DefectiveSource) => void;
  confirmStep2: () => void;
  step2Ready: boolean;
  step1State: StepState;
  step2State: StepState;
  hasItems: boolean;
  showStep3: boolean;
  showStep4: boolean;
  showStep5: boolean;
};

type FilterLike = {
  localSearch: string;
  setLocalSearch: Dispatch<SetStateAction<string>>;
  dept: string;
  setDept: Dispatch<SetStateAction<string>>;
  modelFilter: string;
  setModelFilter: Dispatch<SetStateAction<string>>;
  categoryFilter: string;
  setCategoryFilter: Dispatch<SetStateAction<string>>;
  displayLimit: number;
  setDisplayLimit: Dispatch<SetStateAction<number>>;
  filteredItems: Item[];
  filteredPackages: ShipPackage[];
  hiddenSelectedCount: number;
  hasActiveFilter: boolean;
  clearFilters: () => void;
};

type Props = {
  wizard: WizardLike;
  filter: FilterLike;

  refs: {
    step1Ref: RefObject<HTMLDivElement>;
    step2Ref: RefObject<HTMLDivElement>;
    step3Ref: RefObject<HTMLDivElement>;
    step4Ref: RefObject<HTMLDivElement>;
  };

  step1Done: boolean;

  // step1
  step1Summary: string;
  employees: Employee[];
  employeeId: string;
  onSelectEmployee: (id: string) => void;
  employeeExpanded: boolean;
  setEmployeeExpanded: Dispatch<SetStateAction<boolean>>;
  onEditStep1: () => void;

  // step2
  step2Summary: string;
  step2Accent: string;
  onChangeWorkType: (wt: WorkType) => void;
  onEditStep2: () => void;

  // step3 (selection / data)
  itemsSummary: string;
  selectedItems: Map<string, number>;
  selectedPackage: ShipPackage | null;
  onToggleItem: (itemId: string) => void;
  onSelectPackage: (pkg: ShipPackage | null) => void;
  productModels: ProductModel[];
  pendingScrollId: string | null;
  onScrolled: () => void;

  // step4
  accent: string;
  selectedEntries: { item: Item; quantity: number }[];
  isOutbound: boolean;
  onQuantityChange: (itemId: string, qty: number) => void;
  onRemoveItem: (itemId: string) => void;
  onClearPackage: () => void;
  notes: string;
  setNotes: Dispatch<SetStateAction<string>>;
  totalQty: number;

  // step5
  shortLabel: string;
  canExecute: boolean;
  isCaution: boolean;
  blockerText: string | null;
  submitting: boolean;
  onSubmit: () => void;
};

export function WarehouseStepLayout({
  wizard: w,
  filter: f,
  refs,
  step1Done,
  step1Summary,
  employees,
  employeeId,
  onSelectEmployee,
  employeeExpanded,
  setEmployeeExpanded,
  onEditStep1,
  step2Summary,
  step2Accent,
  onChangeWorkType,
  onEditStep2,
  itemsSummary,
  selectedItems,
  selectedPackage,
  onToggleItem,
  onSelectPackage,
  productModels,
  pendingScrollId,
  onScrolled,
  accent,
  selectedEntries,
  isOutbound,
  onQuantityChange,
  onRemoveItem,
  onClearPackage,
  notes,
  setNotes,
  totalQty,
  shortLabel,
  canExecute,
  isCaution,
  blockerText,
  submitting,
  onSubmit,
}: Props) {
  return (
    <>
      {/* 1단계: 담당자 */}
      <div ref={refs.step1Ref} style={{ scrollMarginTop: 56 }}>
        <WizardStepCard
          n={1}
          title={w.step1State === "active" ? "담당자를 선택하세요" : "담당자"}
          state={w.step1State}
          summary={step1Summary}
          onChange={w.step1State === "complete" ? onEditStep1 : undefined}
        >
          <EmployeeStep
            employees={employees}
            selectedId={employeeId}
            onSelect={onSelectEmployee}
            expanded={employeeExpanded}
            setExpanded={setEmployeeExpanded}
          />
        </WizardStepCard>
      </div>

      {/* 2단계: 작업 유형 */}
      {step1Done && (
        <div ref={refs.step2Ref} style={{ scrollMarginTop: 56 }}>
          <WizardStepCard
            n={2}
            title={w.step2State === "active" ? "작업 유형을 선택하세요" : "작업 유형"}
            state={w.step2State}
            summary={step2Summary}
            onChange={w.step2State === "complete" ? onEditStep2 : undefined}
            accent={step2Accent}
          >
            <WorkTypeStep
              workType={w.workType}
              onWorkTypeChange={onChangeWorkType}
              rawDirection={w.rawDirection}
              setRawDirection={w.changeRawDir}
              warehouseDirection={w.warehouseDirection}
              setWarehouseDirection={w.changeWarehouseDir}
              deptDirection={w.deptDirection}
              setDeptDirection={w.changeDeptDir}
              selectedDept={w.selectedDept}
              setSelectedDept={w.changeSelectedDept}
              defectiveSource={w.defectiveSource}
              setDefectiveSource={w.changeDefectiveSource}
              ready={w.step2Ready}
              onConfirm={w.confirmStep2}
            />
          </WizardStepCard>
        </div>
      )}

      {/* 3단계: 품목 선택 */}
      {w.showStep3 && (
        <div ref={refs.step3Ref} style={{ scrollMarginTop: 56 }}>
          <WizardStepCard
            n={3}
            title={w.hasItems ? `품목 ${itemsSummary}` : "품목을 선택하세요"}
            state="active"
          >
            <ItemPickStep
              workType={w.workType}
              filteredItems={f.filteredItems}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
