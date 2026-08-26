import { useMemo, useState } from "react";
import type { IoBundle, IoLine, IoSubType, IoWorkType } from "./types";
import {
  DEFAULT_SUB_TYPE,
  processBomEffectLine,
  type DeptIoDirection,
} from "./ioWorkType";
import { hasUnselectedInternalUseBomMode } from "./internalUseBom";

export type IoStep = 1 | 2 | 3 | 4 | 5;

export const IO_STEP_LABELS: Record<IoStep, string> = {
  1: "작업 유형",
  2: "세부 작업",
  3: "대상 선택",
  4: "실제 반영",
  5: "제출 확인",
};

type GetAvailable = (line: IoLine) => number | null;

export function useIoWorkState(
  initialWorkType?: IoWorkType,
  initialDepartment?: string | null,
  getAvailable?: GetAvailable,
) {
  const defaultDepartment = initialDepartment || "조립";
  const [workType, setWorkTypeBase] = useState<IoWorkType>(initialWorkType ?? "receive");
  const [subType, setSubType] = useState<IoSubType>("receive_supplier");
  const [fromDepartment, setFromDepartment] = useState<string>(defaultDepartment);
  const [toDepartment, setToDepartment] = useState<string>(defaultDepartment);
  const [bundles, setBundles] = useState<IoBundle[]>([]);
  const [notes, setNotes] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [step, setStep] = useState<IoStep>(1);
  // process/warehouse_adjust 방향(입고/출고) 선택. null = 미선택 → Step 2 advance 차단.
  const [deptIoDirection, setDeptIoDirectionBase] = useState<DeptIoDirection | null>(null);

  function setWorkType(next: IoWorkType) {
    setWorkTypeBase(next);
    setSubType(DEFAULT_SUB_TYPE[next]);
    setToDepartment(next === "internal_use" ? "" : defaultDepartment);
    setDeptIoDirectionBase(null);
    setBundles([]);
    setStep(1);
  }

  // 방향 설정 — 작업 유형에 맞는 sub_type으로 바꾸고 기존 bundle을 비운다.
  function setDeptIoDirection(dir: DeptIoDirection) {
    setDeptIoDirectionBase(dir);
    setBundles([]);
    setSubType(
      workType === "warehouse_adjust"
        ? dir === "in"
          ? "warehouse_adjust_in"
          : "warehouse_adjust_out"
        : dir === "in"
          ? "produce"
          : "disassemble",
    );
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
  const effectIncludedLines = useMemo(
    () => bundles.flatMap((bundle) =>
      bundle.lines.flatMap((line) => {
        const effectLine = processBomEffectLine(subType, bundle, line);
        return effectLine ? [effectLine] : [];
      }),
    ),
    [bundles, subType],
  );
  const hasShortage = effectIncludedLines.some((line) => {
    if (!getAvailable) return line.shortage > 0;
    if (line.from_bucket === "none") return false;
    const available = getAvailable(line);
    return available == null
      ? line.shortage > 0
      : Number(line.quantity) > available;
  });
  const hasInvalidQuantity = effectIncludedLines.some((line) => line.quantity <= 0);
  const hasMissingInternalUseBomMode =
    workType === "internal_use" && hasUnselectedInternalUseBomMode(bundles);

  const canAdvance = useMemo<Record<IoStep, boolean>>(() => {
    return {
      1: true,
      2: workType === "process" || workType === "warehouse_adjust"
        ? deptIoDirection != null
        : workType === "internal_use"
          ? toDepartment === "AS" || toDepartment === "연구"
          : true,
      3: bundles.length > 0,
      4:
        effectIncludedLines.length > 0 &&
        !hasShortage &&
        !hasInvalidQuantity &&
        !hasMissingInternalUseBomMode,
      5: true,
    };
  }, [workType, deptIoDirection, toDepartment, bundles.length, effectIncludedLines.length, hasShortage, hasInvalidQuantity, hasMissingInternalUseBomMode]);

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
    hasMissingInternalUseBomMode,
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
