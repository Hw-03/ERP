import { useMemo, useState } from "react";
import type { IoBundle, IoLine, IoSubType, IoWorkType } from "./types";
import { DEFAULT_SUB_TYPE, type DeptIoDirection } from "./ioWorkType";

export type IoStep = 1 | 2 | 3 | 4 | 5;

export const IO_STEP_LABELS: Record<IoStep, string> = {
  1: "작업 유형",
  2: "세부 작업",
  3: "대상 선택",
  4: "실제 반영",
  5: "제출 확인",
};

export function useIoWorkState(initialWorkType?: IoWorkType, initialDepartment?: string | null) {
  const defaultDepartment = initialDepartment || "조립";
  const [workType, setWorkTypeBase] = useState<IoWorkType>(initialWorkType ?? "receive");
  const [subType, setSubType] = useState<IoSubType>("receive_supplier");
  const [fromDepartment, setFromDepartment] = useState<string>(defaultDepartment);
  const [toDepartment, setToDepartment] = useState<string>(defaultDepartment);
  const [bundles, setBundles] = useState<IoBundle[]>([]);
  const [notes, setNotes] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [step, setStep] = useState<IoStep>(1);
  // process workType 한정: 방향(입고/출고) 선택. null = 미선택 → Step 2 advance 차단.
  const [deptIoDirection, setDeptIoDirectionBase] = useState<DeptIoDirection | null>(null);

  function setWorkType(next: IoWorkType) {
    setWorkTypeBase(next);
    setSubType(DEFAULT_SUB_TYPE[next]);
    setToDepartment(next === "internal_use" ? "" : defaultDepartment);
    setDeptIoDirectionBase(null);
    setBundles([]);
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
    return {
      1: true,
      2: workType === "process"
        ? deptIoDirection != null
        : workType === "internal_use"
          ? toDepartment === "AS" || toDepartment === "연구"
          : true,
      3: bundles.length > 0,
      4: includedLines.length > 0 && !hasShortage && !hasInvalidQuantity,
      5: true,
    };
  }, [workType, deptIoDirection, toDepartment, bundles.length, includedLines.length, hasShortage, hasInvalidQuantity]);

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
    setWorkType,
    setSubType,
    setFromDepartment,
    setToDepartment,
    setBundles,
    setNotes,
    setReferenceNo,
    setDeptIoDirection,
    setDeptIoDirectionRaw,
    updateLine,
    removeLine,
    goNext,
    goPrev,
    goTo,
    reset,
  };
}
