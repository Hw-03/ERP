"use client";

import { AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";
import type { IoBundle, IoLine, IoSubType } from "./types";
import { requiresApproval, subTypeLabel } from "./ioWorkType";
import { formatQty } from "@/lib/mes/format";

interface Props {
  subType: IoSubType;
  bundles: IoBundle[];
  notes: string;
  referenceNo: string;
  hasShortage: boolean;
  hasInvalidQuantity: boolean;
  submitting: boolean;
  onNotesChange: (value: string) => void;
  onReferenceChange: (value: string) => void;
  onSubmit: () => void;
  onSaveDraft: () => void;
}

function LineSummary({ line }: { line: IoLine }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <span className="block truncate text-sm font-black text-slate-800">{line.item_name}</span>
        <span className="block text-xs font-semibold text-slate-500">
          {line.erp_code || "ERP 미지정"} · {line.origin === "manual" ? "수동" : "자동/직접"}
        </span>
      </div>
      <span className="shrink-0 text-sm font-black text-slate-900">{formatQty(line.quantity)} {line.unit}</span>
    </div>
  );
}

export function IoConfirmStep({
  subType,
  bundles,
  notes,
  referenceNo,
  hasShortage,
  hasInvalidQuantity,
  submitting,
  onNotesChange,
  onReferenceChange,
  onSubmit,
  onSaveDraft,
}: Props) {
  const allLines = bundles.flatMap((bundle) => bundle.lines);
  const includedLines = allLines.filter((line) => line.included);
  const excludedLines = allLines.filter((line) => !line.included);
  const submitDisabled = submitting || includedLines.length === 0 || hasShortage || hasInvalidQuantity;
  const approval = requiresApproval(subType);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-900">제출 확인</h2>
          <p className="text-xs font-medium text-slate-500">
            {subTypeLabel(subType)} · {approval ? "승인 요청으로 저장" : "즉시 재고 반영"}
          </p>
        </div>
        {approval ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            승인 필요
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            즉시 처리
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-black text-slate-500">참조번호</span>
          <input
            value={referenceNo}
            onChange={(event) => onReferenceChange(event.target.value)}
            className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-blue-500"
            placeholder="발주/작업/출하 번호"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-black text-slate-500">비고</span>
          <input
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-blue-500"
            placeholder="작업 메모"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">재고 반영</h3>
            <span className="text-xs font-black text-blue-700">{includedLines.length}개</span>
          </div>
          <div className="max-h-52 space-y-2 overflow-y-auto">
            {includedLines.map((line) => (
              <LineSummary key={line.line_id} line={line} />
            ))}
            {includedLines.length === 0 && (
              <div className="rounded-md bg-slate-50 px-3 py-6 text-center text-sm font-bold text-slate-400">
                체크된 라인이 없습니다.
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">제외 기록</h3>
            <span className="text-xs font-black text-slate-500">{excludedLines.length}개</span>
          </div>
          <div className="max-h-52 space-y-2 overflow-y-auto">
            {excludedLines.map((line) => (
              <LineSummary key={line.line_id} line={line} />
            ))}
            {excludedLines.length === 0 && (
              <div className="rounded-md bg-slate-50 px-3 py-6 text-center text-sm font-bold text-slate-400">
                제외된 라인이 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>

      {(hasShortage || hasInvalidQuantity) && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          재고 부족 또는 0 이하 수량이 있어 제출할 수 없습니다.
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={submitting || bundles.length === 0}
          className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          임시저장
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitDisabled}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:bg-slate-300"
        >
          <ClipboardCheck className="h-4 w-4" />
          {approval ? "승인 요청" : "즉시 처리"}
        </button>
      </div>
    </section>
  );
}
