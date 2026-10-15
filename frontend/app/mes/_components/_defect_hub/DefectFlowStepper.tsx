"use client";

import type { CSSProperties, JSX } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import type { DefectSourceKind, DefectWorkAction } from "./DefectWorkChoice";

interface Props {
  action: DefectWorkAction | null;
  source: DefectSourceKind | null;
  currentStep: 1 | 2 | 3 | 4;
  onMenuSelect: () => void;
  busy?: boolean;
  onStepSelect?: (step: 1 | 2 | 3) => void;
}

/** 완료한 단계만 다시 열며 작업의 의미 색은 입출고 단계바 형태 안에서 유지한다. */
export function DefectFlowStepper({ action, source, currentStep, onMenuSelect, busy = false, onStepSelect }: Props): JSX.Element {
  const tone = action === "rework" ? LEGACY_COLORS.yellow : LEGACY_COLORS.red;
  const labels = action === "rework" ? ["작업·출처", "품목 선택", "수량·처리 정보", "BOM 확인"] : ["작업·출처", "품목 선택", "수량·처리 정보"];
  const workLabel = action === "add" ? "격리 등록" : action === "scrap" ? "즉시 폐기" : action === "rework" ? "즉시 재작업" : "";
  const summary = [workLabel, source === "warehouse" ? "창고 재고" : source === "production" ? "부서 재고" : ""].filter(Boolean).join(" · ");
  return <nav aria-label="불량 처리 단계" data-testid="defect-flow-stepper" className="iwp shrink-0" style={{ gridTemplateColumns: `repeat(${labels.length + 1}, minmax(0, 1fr))` }}>
    <button type="button" className="iwpb done" disabled={busy} onClick={onMenuSelect}><span className="iwpl">불량</span></button>
    {labels.map((label, index) => {
      const number = index + 1;
      const active = currentStep === number;
      const done = number < currentStep;
      const toneStyle: CSSProperties | undefined = active ? { color: tone, borderColor: tone, background: tint(tone, 12) } : undefined;
      return <button key={label} type="button" className={`iwpb ${active ? "a" : done ? "done" : "locked"}`} style={toneStyle}
        disabled={!done || busy} aria-current={active ? "step" : undefined} onClick={() => { if (number === 1 || number === 2 || number === 3) onStepSelect?.(number); }}>
        <span className="iwpl">{label}</span>
        {number === 1 && done && summary && <span className="iwps">{summary}</span>}
      </button>;
    })}
  </nav>;
}
