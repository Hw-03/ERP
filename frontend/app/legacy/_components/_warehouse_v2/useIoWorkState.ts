import { useMemo, useState } from "react";
import type { IoBundle, IoLine, IoSubType, IoWorkType } from "./types";
import { DEFAULT_SUB_TYPE, isDefectInventorySubType, type DeptIoDirection } from "./ioWorkType";
import type { DefectLocation } from "@/lib/api/types/defects";
import { validateDecisionTree, type ChildDecision } from "../_defect_hub/DisassembleTree";

export type IoStep = 1 | 2 | 3 | 4 | 5;

export const IO_STEP_LABELS: Record<IoStep, string> = {
  1: "작업 유형",
  2: "세부 작업",
  3: "대상 선택",
  4: "실제 반영",
  5: "제출 확인",
};

export function useIoWorkState(initialWorkType?: IoWorkType, initialDepartment?: string | null) {
  const [workType, setWorkTypeBase] = useState<IoWorkType>(initialWorkType ?? "receive");
  const [subType, setSubType] = useState<IoSubType>("receive_supplier");
  const [fromDepartment, setFromDepartment] = useState<string>(initialDepartment || "조립");
  const [toDepartment, setToDepartment] = useState<string>(initialDepartment || "조립");
  const [bundles, setBundles] = useState<IoBundle[]>([]);
  const [notes, setNotes] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [step, setStep] = useState<IoStep>(1);
  // process workType 한정: 방향(입고/출고) 선택. null = 미선택 → Step 2 advance 차단.
  const [deptIoDirection, setDeptIoDirectionBase] = useState<DeptIoDirection | null>(null);
  const [defectSelectedLocation, setDefectSelectedLocation] = useState<DefectLocation | null>(null);
  const [defectAction, setDefectAction] = useState<"scrap" | "restore" | "supplier_return" | "disassemble" | null>(null);
  const [defectReasonCategory, setDefectReasonCategory] = useState("");
  const [defectReasonMemo, setDefectReasonMemo] = useState("");
  const [defectBomDecisions, setDefectBomDecisions] = useState<ChildDecision[]>([]);

  function setWorkType(next: IoWorkType) {
    setWorkTypeBase(next);
    setSubType(DEFAULT_SUB_TYPE[next]);
    setDeptIoDirectionBase(null);
    setBundles([]);
    setDefectSelectedLocation(null);
    setDefectAction(null);
    setDefectReasonCategory("");
    setDefectReasonMemo("");
    setDefectBomDecisions([]);
    setStep(1);
  }

  // process workType 방향 설정 — bundle 비우고 sub_type 기본값 재설정
  function setDeptIoDirection(dir: DeptIoDirection) {
    setDeptIoDirectionBase(dir);
    setBundles([]);
    setSubType(dir === "in" ? "produce" : "disassemble");
  }

  // draft 복원 전용 — bundle 보존, raw set
  function setDeptIoDirectionRaw(dir: DeptIoDirection | null) {
    setDeptIoDirectionBase(dir);
  }

  const includedLines = useMemo(
    () => bundles.flatMap((bundle) => bundle.lines).filter((line) => line.included),
    [bundles],
  );
  const excludedLines = useMemo(
    () => bundles.flatMap((bundle) => bundle.lines).filter((line) => !line.included),
    [bundles],
  );
  const hasShortage = includedLines.some((line) => line.shortage > 0);
  const hasInvalidQuantity = includedLines.some((line) => line.quantity <= 0);

  const canAdvance = useMemo<Record<IoStep, boolean>>(() => {
    const defectInvMode = workType === "defect" && isDefectInventorySubType(subType);
    // 재작업(disassemble) 시 Step 5 가 BOM 분해 결정. 그 외 defect 케이스는 Step 4 에서 submit.
    const isDisassemble = subType === "defect_process" && defectAction === "disassemble";
    return {
      1: true,
      2: workType !== "process" || deptIoDirection != null,
      3: defectInvMode ? defectSelectedLocation !== null : bundles.length > 0,
      4: defectInvMode
        ? !!defectReasonCategory && (subType !== "defect_process" || !!defectAction)
        : includedLines.length > 0 && !hasShortage && !hasInvalidQuantity,
      5: isDisassemble
        ? defectBomDecisions.length > 0 && validateDecisionTree(defectBomDecisions)
        : true,
    };
  }, [workType, subType, deptIoDirection, bundles.length, includedLines.length, hasShortage, hasInvalidQuantity, defectSelectedLocation, defectAction, defectReasonCategory, defectBomDecisions]);

  function goNext() {
    setStep((s) => (s < 5 ? ((s + 1) as IoStep) : s));
  }
  function goPrev() {
    setStep((s) => (s > 1 ? ((s - 1) as IoStep) : s));
  }
  function goTo(target: IoStep) {
    setStep(target);
  }

  function updateLine(bundleId: string, lineId: string, updater: (line: IoLine) => IoLine) {
    setBundles((prev) =>
      prev.map((bundle) =>
        bundle.bundle_id === bundleId
          ? { ...bundle, lines: bundle.lines.map((line) => (line.line_id === lineId ? updater(line) : line)) }
          : bundle,
      ),
    );
  }

  function removeLine(bundleId: string, lineId: string) {
    setBundles((prev) =>
      prev
        .map((bundle) =>
          bundle.bundle_id === bundleId
            ? { ...bundle, lines: bundle.lines.filter((line) => line.line_id !== lineId) }
            : bundle,
        )
        .filter((bundle) => bundle.lines.length > 0),
    );
  }

  function reset() {
    setBundles([]);
    setNotes("");
    setReferenceNo("");
    setDefectSelectedLocation(null);
    setDefectAction(null);
    setDefectReasonCategory("");
    setDefectReasonMemo("");
    setDefectBomDecisions([]);
    setStep(1);
  }

  return {
    workType,
    subType,
    fromDepartment,
    toDepartment,
    bundles,
    notes,
    referenceNo,
    step,
    deptIoDirection,
    includedLines,
    excludedLines,
    hasShortage,
    hasInvalidQuantity,
    canAdvance,
    defectSelectedLocation,
    defectAction,
    defectReasonCategory,
    defectReasonMemo,
    defectBomDecisions,
    setWorkType,
    setSubType,
    setFromDepartment,
    setToDepartment,
    setBundles,
    setNotes,
    setReferenceNo,
    setDeptIoDirection,
    setDeptIoDirectionRaw,
    setDefectSelectedLocation,
    setDefectAction,
    setDefectReasonCategory,
    setDefectReasonMemo,
    setDefectBomDecisions,
    updateLine,
    removeLine,
    goNext,
    goPrev,
    goTo,
    reset,
  };
}
