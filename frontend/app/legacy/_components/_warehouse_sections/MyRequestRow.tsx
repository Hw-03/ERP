"use client";

import type { StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { formatQty } from "@/lib/mes/format";
import { REQUEST_TYPE_LABEL } from "./ioRequestLabels";

const STATUS_LABEL: Record<string, string> = {
  draft: "임시저장",
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

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

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
  const typeLabel = REQUEST_TYPE_LABEL[req.request_type] ?? req.request_type;
  const statusColor = STATUS_COLOR[req.status] ?? LEGACY_COLORS.muted2;

  const firstLine = req.lines[0];
  const fromDept = firstLine?.from_department ? normalizeDepartment(firstLine.from_department) : null;
  const toDept = firstLine?.to_department ? normalizeDepartment(firstLine.to_department) : null;
  const flowLabel =
    fromDept && toDept ? `${fromDept} → ${toDept}` : fromDept ?? toDept ?? null;

  return (
    <div
      className="rounded-[14px] border px-5 py-4"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span
          className="text-[18px] font-bold leading-tight"
          style={{ color: LEGACY_COLORS.text }}
        >
          {typeLabel}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-bold"
          style={{
            background: `color-mix(in srgb, ${statusColor} 18%, transparent)`,
            color: statusColor,
          }}
        >
          {STATUS_LABEL[req.status] ?? req.status}
        </span>
        <span className="ml-auto text-xs" style={{ color: LEGACY_COLORS.muted }}>
          {formatRelative(req.created_at)}
        </span>
      </div>

      {(flowLabel || req.lines.length > 0) && (
        <div className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted }}>
          {flowLabel}
          {flowLabel && req.lines.length > 0 && " · "}
          {req.lines.length > 0 && `${req.lines.length}건`}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-1 text-sm" style={{ color: LEGACY_COLORS.text }}>
        {req.lines.slice(0, 5).map((line) => (
          <div key={line.line_id} className="flex flex-wrap items-center gap-2">
            <span style={{ color: LEGACY_COLORS.muted2 }}>{line.item_code_snapshot ?? "-"}</span>
            <span>{line.item_name_snapshot}</span>
            <span className="ml-auto font-bold">{formatQty(line.quantity)}{" "}개</span>
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

      <div className="mt-3 flex items-center justify-between gap-2">
        {cancelable && (
          <button
            type="button"
            className="rounded-[10px] border px-3 py-1.5 text-xs font-bold"
            style={{
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 50%, transparent)`,
              color: LEGACY_COLORS.red,
              background: LEGACY_COLORS.s1,
            }}
            onClick={onCancelRequest}
          >
            요청 취소
          </button>
        )}
      </div>
    </div>
  );
}
