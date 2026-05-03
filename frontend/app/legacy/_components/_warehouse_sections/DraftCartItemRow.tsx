"use client";

import type { StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { formatQty } from "@/lib/mes/format";

const REQUEST_TYPE_LABEL: Record<string, string> = {
  raw_receive: "원자재 입고",
  raw_ship: "원자재 출고",
  warehouse_to_dept: "창고 → 부서 이동",
  dept_to_warehouse: "부서 → 창고 복귀",
  dept_internal: "부서 내부 이동",
  mark_defective_wh: "창고 불량 등록",
  mark_defective_prod: "생산 불량 등록",
  supplier_return: "공급업체 반품",
  package_out: "패키지 출고",
};

/**
 * Round-13 (#7) 추출 — DraftCartPanel 의 단일 draft 카드.
 *
 * draft 메타 + lines 미리보기 (최대 5건) + 이어서/삭제/제출 버튼 3개 행.
 */
export interface DraftCartItemRowProps {
  draft: StockRequest;
  isBusy: boolean;
  onContinue: () => void;
  onRequestDelete: () => void;
  onSubmit: () => void;
}

export function DraftCartItemRow({
  draft,
  isBusy,
  onContinue,
  onRequestDelete,
  onSubmit,
}: DraftCartItemRowProps) {
  const totalQty = draft.lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  const canSubmit = draft.lines.length > 0 && !isBusy;

  return (
    <div
      className="rounded-[14px] border px-5 py-4"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: LEGACY_COLORS.text }}>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-bold"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 18%, transparent)`,
            color: LEGACY_COLORS.cyan,
          }}
        >
          작성중
        </span>
        <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>
          {REQUEST_TYPE_LABEL[draft.request_type] ?? draft.request_type}
        </span>
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
          {draft.lines.length}건 · 총 {formatQty(totalQty)}
        </span>
        <span className="ml-auto text-xs" style={{ color: LEGACY_COLORS.muted }}>
          {new Date(draft.updated_at).toLocaleString("ko-KR", { hour12: false })}
        </span>
      </div>

      {draft.lines.length > 0 && (
        <div className="mt-2 flex flex-col gap-1 text-sm" style={{ color: LEGACY_COLORS.text }}>
          {draft.lines.slice(0, 5).map((line) => (
            <div key={line.line_id} className="flex flex-wrap items-center gap-2">
              <span style={{ color: LEGACY_COLORS.muted2 }}>{line.erp_code_snapshot ?? "-"}</span>
              <span>{line.item_name_snapshot}</span>
              <span className="ml-auto font-bold">{formatQty(line.quantity)} 개</span>
              {line.to_department && (
                <span className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
                  → {normalizeDepartment(line.to_department)}
                </span>
              )}
            </div>
          ))}
          {draft.lines.length > 5 && (
            <div className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
              외 {draft.lines.length - 5}건
            </div>
          )}
        </div>
      )}

      {draft.reference_no && (
        <div className="mt-2 text-xs" style={{ color: LEGACY_COLORS.muted }}>
          참조: {draft.reference_no}
        </div>
      )}
      {draft.notes && (
        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted }}>
          비고: {draft.notes}
        </div>
      )}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onContinue}
          disabled={isBusy}
          className="rounded-[10px] border px-3 py-1.5 text-xs"
          style={{
            borderColor: LEGACY_COLORS.borderStrong,
            color: LEGACY_COLORS.text,
            background: LEGACY_COLORS.s1,
            opacity: isBusy ? 0.5 : 1,
          }}
        >
          이어서 작성
        </button>
        <button
          type="button"
          onClick={onRequestDelete}
          disabled={isBusy}
          className="rounded-[10px] border px-3 py-1.5 text-xs"
          style={{
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 40%, transparent)`,
            color: LEGACY_COLORS.red,
            background: LEGACY_COLORS.s1,
            opacity: isBusy ? 0.5 : 1,
          }}
        >
          삭제
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="rounded-[10px] px-3 py-1.5 text-xs font-bold text-white"
          style={{
            background: LEGACY_COLORS.blue,
            opacity: canSubmit ? 1 : 0.4,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {isBusy ? "처리 중..." : "요청 제출"}
        </button>
      </div>
    </div>
  );
}
