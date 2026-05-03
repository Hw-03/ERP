"use client";

import type { StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { formatQty } from "@/lib/mes/format";

const STATUS_LABEL: Record<string, string> = {
  draft: "임시",
  submitted: "제출됨",
  reserved: "승인 대기",
  rejected: "반려",
  cancelled: "취소",
  completed: "완료",
  failed_approval: "승인 실패",
};

const STATUS_COLOR: Record<string, string> = {
  draft: LEGACY_COLORS.muted2,
  submitted: LEGACY_COLORS.cyan,
  reserved: LEGACY_COLORS.yellow,
  rejected: LEGACY_COLORS.red,
  cancelled: LEGACY_COLORS.muted2,
  completed: LEGACY_COLORS.green,
  failed_approval: LEGACY_COLORS.red,
};

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
 * Round-13 (#13) 추출 — MyRequestsPanel 의 단일 request 행.
 */
export function MyRequestRow({
  req,
  onCancelRequest,
}: {
  req: StockRequest;
  onCancelRequest: () => void;
}) {
  const cancelable = req.status === "submitted" || req.status === "reserved";

  return (
    <div
      className="rounded-[14px] border px-5 py-4"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: LEGACY_COLORS.text }}>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-bold"
          style={{
            background: `color-mix(in srgb, ${STATUS_COLOR[req.status]} 18%, transparent)`,
            color: STATUS_COLOR[req.status],
          }}
        >
          {STATUS_LABEL[req.status] ?? req.status}
        </span>
        <span className="font-mono text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {req.request_code ?? req.request_id.slice(0, 8)}
        </span>
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
          {REQUEST_TYPE_LABEL[req.request_type] ?? req.request_type}
        </span>
        <span className="ml-auto text-xs" style={{ color: LEGACY_COLORS.muted }}>
          {new Date(req.created_at).toLocaleString("ko-KR", { hour12: false })}
        </span>
      </div>

      <div className="mt-2 flex flex-col gap-1 text-sm" style={{ color: LEGACY_COLORS.text }}>
        {req.lines.slice(0, 5).map((line) => (
          <div key={line.line_id} className="flex flex-wrap items-center gap-2">
            <span style={{ color: LEGACY_COLORS.muted2 }}>{line.erp_code_snapshot ?? "-"}</span>
            <span>{line.item_name_snapshot}</span>
            <span className="ml-auto font-bold">{formatQty(line.quantity)}{" "}개</span>
            {line.to_department && (
              <span className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
                → {normalizeDepartment(line.to_department)}
              </span>
            )}
          </div>
        ))}
        {req.lines.length > 5 && (
          <div className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
            외 {req.lines.length - 5}건
          </div>
        )}
      </div>

      {req.notes && (
        <div className="mt-2 text-xs" style={{ color: LEGACY_COLORS.muted }}>
          비고: {req.notes}
        </div>
      )}
      {req.rejected_reason && (
        <div
          className="mt-2 rounded px-2 py-1 text-xs"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 12%, transparent)`,
            color: LEGACY_COLORS.red,
          }}
        >
          {req.status === "failed_approval" ? "승인 실패" : "반려"} 사유: {req.rejected_reason}
        </div>
      )}

      {cancelable && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="rounded-[10px] border px-3 py-1.5 text-xs"
            style={{
              borderColor: LEGACY_COLORS.borderStrong,
              color: LEGACY_COLORS.text,
              background: LEGACY_COLORS.s1,
            }}
            onClick={onCancelRequest}
          >
            취소
          </button>
        </div>
      )}
    </div>
  );
}
