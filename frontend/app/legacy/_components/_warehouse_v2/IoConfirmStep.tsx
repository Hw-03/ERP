"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, Save } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import type { IoBundle, IoSubType } from "./types";
import { subTypeLabel } from "./ioWorkType";
import { formatQty } from "@/lib/mes/format";
import { SettingLabel } from "./_atoms";

interface Props {
  subType: IoSubType;
  bundles: IoBundle[];
  notes: string;
  referenceNo: string;
  hasShortage: boolean;
  hasInvalidQuantity: boolean;
  submitting: boolean;
  approval: boolean;
  onNotesChange: (value: string) => void;
  onReferenceChange: (value: string) => void;
  onSubmit: () => void;
  onSaveDraft: () => void;
  onPrev: () => void;
}

export function IoConfirmStep({
  subType,
  bundles,
  notes,
  referenceNo,
  hasShortage,
  hasInvalidQuantity,
  submitting,
  approval,
  onNotesChange,
  onReferenceChange,
  onSubmit,
  onSaveDraft,
  onPrev,
}: Props) {
  const allLines = bundles.flatMap((bundle) => bundle.lines);
  const includedLines = allLines.filter((line) => line.included);
  const totalQty = includedLines.reduce(
    (acc, line) => acc + (Number.isFinite(line.quantity) ? line.quantity : 0),
    0,
  );
  const submitDisabled =
    submitting || includedLines.length === 0 || hasShortage || hasInvalidQuantity;
  const accent = approval ? LEGACY_COLORS.yellow : LEGACY_COLORS.blue;
  const isCaution = subType === "defect_quarantine" || subType === "supplier_return";
  const blockerText = hasShortage
    ? "재고 부족 라인이 있어 제출할 수 없습니다. Step 4에서 라인을 다시 확인하세요."
    : hasInvalidQuantity
    ? "0 이하 수량 라인이 있어 제출할 수 없습니다."
    : includedLines.length === 0
    ? "체크된 라인이 없어 제출할 수 없습니다."
    : null;

  return (
    <div className="space-y-4">
      {/* 작업 요약 */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border px-4 py-3"
        style={{
          background: tint(accent, 6),
          borderColor: tint(accent, 24),
        }}
      >
        <div>
          <SettingLabel label={approval ? "승인 요청으로 저장" : "즉시 재고 반영"} />
          <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>
            {subTypeLabel(subType)} · 반영 {includedLines.length}건 · 총 {formatQty(totalQty)}
          </div>
        </div>
        {approval ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-black"
            style={{ background: tint(LEGACY_COLORS.yellow, 14), color: LEGACY_COLORS.yellow }}
          >
            <AlertTriangle className="h-4 w-4" />
            승인 필요
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-black"
            style={{ background: tint(LEGACY_COLORS.green, 14), color: LEGACY_COLORS.green }}
          >
            <CheckCircle2 className="h-4 w-4" />
            즉시 처리
          </span>
        )}
      </div>

      {/* 참조번호 / 메모 */}
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="참조번호"
          value={referenceNo}
          onChange={onReferenceChange}
          placeholder="발주/작업/출하 번호"
        />
        <Field label="메모 (선택)" value={notes} onChange={onNotesChange} placeholder="작업 메모" />
      </div>

      {/* 보조 액션 (이전 / 임시저장) */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={submitting}
          className="flex items-center gap-1.5 rounded-[12px] border px-4 py-2 text-[12px] font-bold disabled:opacity-40"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          이전 단계
        </button>
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={submitting || bundles.length === 0}
          className="flex items-center gap-1.5 rounded-[12px] border px-4 py-2 text-[12px] font-bold disabled:opacity-40"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        >
          <Save className="h-4 w-4" />
          임시저장
        </button>
      </div>

      {/* caution */}
      {isCaution && (
        <div
          className="flex items-start gap-2 rounded-[12px] border px-3 py-2 text-xs"
          style={{
            background: tint(LEGACY_COLORS.red, 8),
            borderColor: tint(LEGACY_COLORS.red, 40),
            color: LEGACY_COLORS.red,
          }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-bold">
            되돌릴 수 없습니다. 최종 확인 팝업에서 한 번 더 점검하세요.
          </span>
        </div>
      )}

      {/* blocker */}
      {blockerText && (
        <div
          className="rounded-[12px] border px-3 py-2 text-center text-xs font-bold"
          style={{
            background: tint(LEGACY_COLORS.yellow, 10),
            borderColor: tint(LEGACY_COLORS.yellow, 40),
            color: LEGACY_COLORS.yellow,
          }}
        >
          {blockerText}
        </div>
      )}

      {/* 큰 한 줄 실행 버튼 (옛 ExecuteStep 패턴) */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitDisabled}
        className="flex w-full items-center justify-center gap-2 rounded-[18px] px-6 py-5 text-lg font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
        style={{ background: accent }}
      >
        {isCaution && !submitting && <AlertTriangle className="h-5 w-5" />}
        {!isCaution && <ClipboardCheck className="h-5 w-5" />}
        {submitting
          ? "처리 중..."
          : approval
          ? `승인 요청 보내기 ${includedLines.length}건`
          : `즉시 반영하기 ${includedLines.length}건`}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <SettingLabel label={label} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-[12px] border px-3 text-sm font-bold outline-none focus:border-[var(--c-blue)]"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
      />
    </label>
  );
}
