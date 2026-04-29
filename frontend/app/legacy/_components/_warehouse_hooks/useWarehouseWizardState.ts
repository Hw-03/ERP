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
  initialDept?: Department;
};

export function useWarehouseWizardState({
  step1Done,
  hasSelectedPackage,
  hasSelectedItems,
  initialDept,
}: Args) {
  // 작업 설정
  const [workType, setWorkType] = useState<WorkType>("raw-io");
  const [rawDirection, setRawDirection] = useState<Direction>("in");
  const [warehouseDirection, setWarehouseDirection] = useState<TransferDirection>("wh-to-dept");
  const [deptDirection, setDeptDirection] = useState<Direction>("in");
  const [selectedDept, setSelectedDept] = useState<Department>(initialDept ?? "조립");
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
