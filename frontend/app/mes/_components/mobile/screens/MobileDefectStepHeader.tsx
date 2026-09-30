"use client";

import { ArrowLeft } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { IconButton, WizardProgress } from "../primitives";

/** 모바일 불량 작업의 현재 단계만 표시한다. 단계 전환은 호출자가 소유한다. */
export function MobileDefectStepHeader({
  title,
  context = "불량 처리",
  steps,
  current,
  onBack,
  backLabel = "이전",
}: {
  title: string;
  context?: string;
  steps: readonly string[];
  current: number;
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <div
      className="flex min-h-10 shrink-0 items-center gap-2 rounded-[12px] border px-3 py-2"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <IconButton icon={ArrowLeft} label={backLabel} size="md" onClick={onBack} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{context}</div>
        <h2 className="truncate text-[15px] font-semibold" style={{ color: LEGACY_COLORS.text }}>{title}</h2>
      </div>
      <WizardProgress
        steps={steps.map((label, index) => ({ key: String(index), label }))}
        current={current}
        variant="inline"
        className="max-w-[45%] flex-1"
      />
    </div>
  );
}
