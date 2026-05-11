import { useMemo, useState } from "react";
import type { IoBundle, IoLine, IoSubType, IoWorkType } from "./types";
import { DEFAULT_SUB_TYPE } from "./ioWorkType";

export function useIoWorkState(initialDepartment?: string | null) {
  const [workType, setWorkTypeBase] = useState<IoWorkType>("receive");
  const [subType, setSubType] = useState<IoSubType>("receive_supplier");
  const [fromDepartment, setFromDepartment] = useState<string>(initialDepartment || "조립");
  const [toDepartment, setToDepartment] = useState<string>(initialDepartment || "조립");
  const [bundles, setBundles] = useState<IoBundle[]>([]);
  const [notes, setNotes] = useState("");
  const [referenceNo, setReferenceNo] = useState("");

  function setWorkType(next: IoWorkType) {
    setWorkTypeBase(next);
    setSubType(DEFAULT_SUB_TYPE[next]);
    setBundles([]);
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
  }

  return {
    workType,
    subType,
    fromDepartment,
    toDepartment,
    bundles,
    notes,
    referenceNo,
    includedLines,
    excludedLines,
    hasShortage,
    hasInvalidQuantity,
    setWorkType,
    setSubType,
    setFromDepartment,
    setToDepartment,
    setBundles,
    setNotes,
    setReferenceNo,
    updateLine,
    removeLine,
    reset,
  };
}
