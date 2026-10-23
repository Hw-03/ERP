"use client";

import { useId, type JSX, type Ref } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { IoBundle, IoSubType, IoWorkType } from "./types";
import { requiresDepartmentApprovalMemo } from "./ioWorkType";
import { ReasonFormFields } from "../_defect_hub/ReasonFormFields";

export const MEMO_REQUIRED_MESSAGE = "메모를 입력해야 작업을 진행할 수 있습니다.";

/** 두 작성 단계가 같은 작업 메모와 사유 입력 규칙을 사용한다. */
export function IoWorkMemo({ workType, subType, bundles, notes, onNotesChange, invalid = false, inputRef,
  employeeId = "", reasonCategory = "", reasonCategoryId, onReasonCategoryChange, mobilePresentation = false,
}: {
  workType?: IoWorkType;
  subType: IoSubType;
  bundles: IoBundle[];
  notes: string;
  onNotesChange: (value: string) => void;
  invalid?: boolean;
  inputRef?: Ref<HTMLTextAreaElement>;
  employeeId?: string;
  reasonCategory?: string;
  reasonCategoryId?: string | null;
  onReasonCategoryChange?: (name: string, categoryId?: string | null) => void;
  mobilePresentation?: boolean;
}): JSX.Element {
  const id = useId();
  if (subType === "defect_quarantine") return <ReasonFormFields employeeId={employeeId} category={reasonCategory} categoryId={reasonCategoryId}
    memo={notes} onCategoryChange={(name, categoryId) => onReasonCategoryChange?.(name, categoryId)} onMemoChange={onNotesChange}
    mobilePresentation={mobilePresentation} required />;
  const materialOutbound = subType === "outbound_supplier" || subType === "tube_outbound_supplier";
  const required = materialOutbound || Boolean(workType && requiresDepartmentApprovalMemo(workType, subType, bundles));
  const error = materialOutbound ? "출고 사유를 입력하세요." : MEMO_REQUIRED_MESSAGE;
  return <label className="flex shrink-0 flex-col gap-2" htmlFor={id}>
    <span className="text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
      {materialOutbound ? "출고 사유 (필수)" : required ? "메모 (필수)" : "메모 (선택)"}
    </span>
    <textarea ref={inputRef} id={id} rows={2} value={notes} onChange={(event) => onNotesChange(event.target.value)}
      placeholder={invalid ? error : materialOutbound ? "사급·샘플 등 출고 사유를 입력하세요" : required ? "결재 사유를 입력하세요" : "작업 메모"}
      required={required} aria-required={required} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined}
      className={`h-16 min-h-[64px] resize-none rounded-[16px] border px-4 py-2 text-base font-bold leading-6 outline-none focus-visible:ring-2 ${invalid
        ? "placeholder:font-bold placeholder:text-[var(--c-red)] focus-visible:ring-[var(--c-red)]"
        : "focus-visible:border-[var(--c-blue)] focus-visible:ring-[var(--c-blue)]"}`}
      style={{ background: LEGACY_COLORS.s2, borderColor: invalid ? LEGACY_COLORS.red : LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
    {invalid && <span id={`${id}-error`} className="sr-only">{error}</span>}
  </label>;
}
