---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_warehouse_hooks/useWarehouseWizardState.ts
status: active
updated: 2026-04-27
source_sha: 7f34db5cddfc
tags:
  - erp
  - frontend
  - frontend-hook
  - ts
---

# useWarehouseWizardState.ts

> [!summary] 역할
> 프론트엔드 화면에서 상태, 데이터 로딩, 상호작용 흐름을 재사용하기 위한 React hook이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_warehouse_hooks/useWarehouseWizardState.ts`
- Layer: `frontend`
- Kind: `frontend-hook`
- Size: `3926` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_warehouse_hooks/_warehouse_hooks|frontend/app/legacy/_components/_warehouse_hooks]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

import { useState } from "react";
import type { Department } from "@/lib/api";
import type {
  DefectiveSource,
  Direction,
  TransferDirection,
  WorkType,
} from "../_warehouse_steps";

type Args = {
  step1Done: boolean;
  hasSelectedPackage: boolean;
  hasSelectedItems: boolean;
};

export function useWarehouseWizardState({
  step1Done,
  hasSelectedPackage,
  hasSelectedItems,
}: Args) {
  // 작업 설정
  const [workType, setWorkType] = useState<WorkType>("raw-io");
  const [rawDirection, setRawDirection] = useState<Direction>("in");
  const [warehouseDirection, setWarehouseDirection] = useState<TransferDirection>("wh-to-dept");
  const [deptDirection, setDeptDirection] = useState<Direction>("in");
  const [selectedDept, setSelectedDept] = useState<Department>("조립");
  const [defectiveSource, setDefectiveSource] = useState<DefectiveSource>("warehouse");

  // wizard 단계 제어
  const [forcedStep, setForcedStep] = useState<1 | 2 | null>(null);
  const [step2Confirmed, setStep2Confirmed] = useState(false);

  const step2Ready =
    workType === "package-out"
      ? true
      : workType === "raw-io"
        ? true
        : workType === "warehouse-io"
          ? !!selectedDept && !!warehouseDirection
          : workType === "dept-io"
            ? !!selectedDept
            : workType === "defective-register"
              ? !!selectedDept && !!defectiveSource
              : workType === "supplier-return"
                ? !!selectedDept
                : false;

  const step2Done = step2Ready && step2Confirmed;

  const step1State: "active" | "complete" | "locked" =
    forcedStep === 1 ? "active" : step1Done ? "complete" : "active";

  const step2State: "active" | "complete" | "locked" =
    forcedStep === 1 || (!step1Done && forcedStep !== 2)
      ? "locked"
      : forcedStep === 2
        ? "active"
        : step2Done
          ? "complete"
          : "active";

  const hasItems = workType === "package-out" ? hasSelectedPackage : hasSelectedItems;

  const showStep3 = step1Done && step2Done && forcedStep === null;
  const showStep4 = showStep3 && hasItems;
  const showStep5 = showStep4;

  // wizard-only wrapped setters
  function changeRawDir(d: Direction) {
    setRawDirection(d);
    setStep2Confirmed(false);
  }
  function changeWarehouseDir(d: TransferDirection) {
    setWarehouseDirection(d);
    setStep2Confirmed(false);
  }
  function changeDeptDir(d: Direction) {
    setDeptDirection(d);
    setStep2Confirmed(false);
  }
  function changeSelectedDept(d: Department) {
    setSelectedDept(d);
    setStep2Confirmed(false);
  }
  function changeDefectiveSource(s: DefectiveSource) {
    setDefectiveSource(s);
    setStep2Confirmed(false);
  }
  function confirmStep2() {
    if (!step2Ready) return;
    setStep2Confirmed(true);
    setForcedStep(null);
  }

  function resetWizardConfig() {
    setWorkType("raw-io");
    setRawDirection("in");
    setWarehouseDirection("wh-to-dept");
    setDeptDirection("in");
    setSelectedDept("조립");
    setDefectiveSource("warehouse");
    setStep2Confirmed(false);
    setForcedStep(null);
  }

  return {
    // raw state
    workType,
    rawDirection,
    warehouseDirection,
    deptDirection,
    selectedDept,
    defectiveSource,
    forcedStep,
    step2Confirmed,
    // raw setters (submit() / selectEmployee / render onChange 호환)
    setWorkType,
    setForcedStep,
    setStep2Confirmed,
    // wrapped setters
    changeRawDir,
    changeWarehouseDir,
    changeDeptDir,
    changeSelectedDept,
    changeDefectiveSource,
    confirmStep2,
    // step gating
    step2Ready,
    step2Done,
    step1State,
    step2State,
    hasItems,
    showStep3,
    showStep4,
    showStep5,
    // helpers
    resetWizardConfig,
  };
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
