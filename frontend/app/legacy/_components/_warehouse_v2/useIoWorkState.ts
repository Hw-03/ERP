import { useMemo, useState } from "react";
import type { IoBundle, IoLine, IoSubType, IoWorkType } from "./types";
import { DEFAULT_SUB_TYPE } from "./ioWorkType";

export type IoStep = 1 | 2 | 3 | 4 | 5;

export const IO_STEP_LABELS: Record<IoStep, string> = {
  1: "작업 유형",
  2: "세부 작업",
  3: "대상 선택",
  4: "실제 반영",
  5: "제출 확인",
};

export function useIoWorkState(initialDepartment?: string | null) {
  const [workType, setWorkTypeBase] = useState<IoWorkType>("receive");
  const [subType, setSubType] = useState<IoSubType>("receive_supplier");
  const [fromDepartment, setFromDepartment] = useState<string>(initialDepartment || "조립");
  const [toDepartment, setToDepartment] = useState<string>(initialDepartment || "조립");
  const [bundles, setBundles] = useState<IoBundle[]>([]);
  const [notes, setNotes] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [step, setStep] = useState<IoStep>(1);

  function setWorkType(next: IoWorkType) {
    setWorkTypeBase(next);
    setSubType(DEFAULT_SUB_TYPE[next]);
    setBundles([]);
    setStep(1);
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
      2: true,
      3: bundles.length > 0,
      4: includedLines.length > 0 && !hasShortage && !hasInvalidQuantity,
      5: true,
    };
  }, [bundles.length, includedLines.length, hasShortage, hasInvalidQuantity]);

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
    updateLine,
    removeLine,
    goNext,
    goPrev,
    goTo,
    reset,
  };
}
