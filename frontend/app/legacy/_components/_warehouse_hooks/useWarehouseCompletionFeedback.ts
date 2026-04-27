"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Direction,
  TransferDirection,
  WorkType,
} from "../_warehouse_steps";

type Args = {
  lastResult: { count: number; label: string } | null;
  workType: WorkType;
  rawDirection: Direction;
  warehouseDirection: TransferDirection;
  deptDirection: Direction;
};

export function useWarehouseCompletionFeedback({
  lastResult,
  workType,
  rawDirection,
  warehouseDirection,
  deptDirection,
}: Args) {
  // nonce: 매 실행마다 새 값 → overlay div의 key로 사용 → 강제 remount 보장
  const [completionFlyout, setCompletionFlyout] = useState<
    { nonce: number; kind: "in" | "out"; count: number } | null
  >(null);
  const [completionPhase, setCompletionPhase] = useState<"show" | "out">("show");
  const flyoutTimer1Ref = useRef<number | null>(null);
  const flyoutTimer2Ref = useRef<number | null>(null);

  useEffect(() => {
    if (!lastResult) return;

    if (flyoutTimer1Ref.current != null) window.clearTimeout(flyoutTimer1Ref.current);
    if (flyoutTimer2Ref.current != null) window.clearTimeout(flyoutTimer2Ref.current);

    const isIn = (() => {
      if (workType === "raw-io") return rawDirection === "in";
      if (workType === "warehouse-io") return warehouseDirection === "dept-to-wh";
      if (workType === "dept-io") return deptDirection === "in";
      return false;
    })();

    const nonce = Date.now();
    setCompletionPhase("show");
    setCompletionFlyout({ nonce, kind: isIn ? "in" : "out", count: lastResult.count });

    flyoutTimer1Ref.current = window.setTimeout(() => {
      setCompletionPhase("out");
    }, 1100);

    flyoutTimer2Ref.current = window.setTimeout(() => {
      setCompletionFlyout(null);
    }, 1100 + 380);

    return () => {
      if (flyoutTimer1Ref.current != null) window.clearTimeout(flyoutTimer1Ref.current);
      if (flyoutTimer2Ref.current != null) window.clearTimeout(flyoutTimer2Ref.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResult]);

  return { completionFlyout, completionPhase };
}
