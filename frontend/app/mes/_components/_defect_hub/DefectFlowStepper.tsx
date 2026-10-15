"use client";

import type { JSX } from "react";
import type { DefectSourceKind, DefectWorkAction } from "./DefectWorkChoice";
import styles from "./DefectFlowStepper.module.css";

interface Props {
  action: DefectWorkAction | null;
  source: DefectSourceKind | null;
  currentStep: 1 | 2 | 3 | 4;
  onMenuSelect: () => void;
  busy?: boolean;
  onStepSelect?: (step: 1 | 2 | 3) => void;
}

/** 입출고 단계바 형태를 공유하고 불량의 진행 상태는 로즈 톤으로 구분한다. */
export function DefectFlowStepper({ action, source, currentStep, onMenuSelect, busy = false, onStepSelect }: Props): JSX.Element {
  const labels = action === "rework" ? ["작업·출처", "품목 선택", "수량·처리 정보", "BOM 확인"] : ["작업·출처", "품목 선택", "수량·처리 정보"];
  const workLabel = action === "add" ? "격리 등록" : action === "scrap" ? "즉시 폐기" : action === "rework" ? "즉시 재작업" : "";
  const summary = [workLabel, source === "warehouse" ? "창고 재고" : source === "production" ? "부서 재고" : ""].filter(Boolean).join(" · ");
  return <nav aria-label="불량 처리 단계" data-testid="defect-flow-stepper" className={`iwp shrink-0 ${styles.root}`} style={{ gridTemplateColumns: `repeat(${labels.length + 1}, minmax(0, 1fr))` }}>
    <button type="button" className="iwpb done" disabled={busy} onClick={onMenuSelect}><span className="iwpl">불량</span></button>
    {labels.map((label, index) => {
      const number = index + 1;
      const active = currentStep === number;
      const done = number < currentStep;
      return <button key={label} type="button" className={`iwpb ${active ? "a" : done ? "done" : "locked"}`}
        disabled={!done || busy} aria-current={active ? "step" : undefined} onClick={() => { if (number === 1 || number === 2 || number === 3) onStepSelect?.(number); }}>
        <span className="iwpl">{label}</span>
        {number === 1 && done && summary && <span className="iwps">{summary}</span>}
      </button>;
    })}
  </nav>;
}
