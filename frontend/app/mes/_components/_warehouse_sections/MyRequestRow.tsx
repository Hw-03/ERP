"use client";

import { useState } from "react";
import type { StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { formatKstDateTime, formatQty } from "@/lib/mes/format";
import { REQUEST_TYPE_LABEL, formatRequestNotes } from "./ioRequestLabels";

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

/**
 * Round-13 (#13) 추출 — MyRequestsPanel 의 단일 request 행.
 */
export function MyRequestRow({
  req,
  onCancelRequest,
  onRevertToDraft,
  highlighted,
}: {
  req: StockRequest;
  onCancelRequest: () => void;
  onRevertToDraft?: () => void;
  highlighted?: boolean;
}) {
  const cancelable = req.status === "submitted" || req.status === "reserved";
  const typeLabel = REQUEST_TYPE_LABEL[req.request_type] ?? req.request_type;
  const statusColor = STATUS_COLOR[req.status] ?? LEGACY_COLORS.muted2;
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [linesExpanded, setLinesExpanded] = useState(false);
  const displayNotes = formatRequestNotes(req.notes);
  const notesLong = (displayNotes ?? "").length > 60;

  const firstLine = req.lines[0];
  const fromDept = firstLine?.from_department ? normalizeDepartment(firstLine.from_department) : null;
  const toDept = firstLine?.to_department ? normalizeDepartment(firstLine.to_department) : null;
  const flowLabel =
    fromDept && toDept ? `${fromDept} → ${toDept}` : fromDept ?? toDept ?? null;

  return (
    <div
      className="rounded-[20px] border px-5 py-4"
      data-stock-request-id={req.request_id}
      style={{ background: LEGACY_COLORS.s2, borderColor: highlighted ? LEGACY_COLORS.blue : LEGACY_COLORS.border }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div data-testid="my-request-heading" className="flex flex-wrap items-center gap-2">
            <span
              className="text-lg font-black leading-tight"
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
          </div>
          {(flowLabel || req.lines.length > 0) && (
            <div data-testid="my-request-summary" className="mt-1 flex flex-wrap items-center gap-1.5 text-sm font-medium" style={{ color: LEGACY_COLORS.muted }}>
              {flowLabel && <span>{flowLabel}</span>}
              {flowLabel && req.lines.length > 0 && <span aria-hidden="true"> · </span>}
              {req.lines.length > 0 && <span>{req.lines.length}건</span>}
            </div>
          )}
        </div>
        <span
          className="whitespace-nowrap pt-0.5 text-xs tabular-nums"
          style={{ color: LEGACY_COLORS.muted }}
        >
          {formatKstDateTime(req.submitted_at ?? req.created_at)}
        </span>
      </div>

      <div className="mt-4 flex flex-col overflow-hidden rounded-[14px] border text-sm" style={{ color: LEGACY_COLORS.text, borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}>
        {(linesExpanded ? req.lines : req.lines.slice(0, 5)).map((line, idx) => {
          const displayedCount = linesExpanded ? req.lines.length : Math.min(req.lines.length, 5);
          const isLast = idx === displayedCount - 1 && (linesExpanded || req.lines.length <= 5);
          return (
            <div
              key={line.line_id}
              className="flex flex-wrap items-center gap-2 px-3 py-2"
              style={!isLast ? { borderBottom: `1px solid ${LEGACY_COLORS.border}` } : undefined}
            >
              <span style={{ color: LEGACY_COLORS.muted2 }}>{line.mes_code_snapshot ?? "-"}</span>
              <span>{line.item_name_snapshot}</span>
              <span className="font-bold">{formatQty(line.quantity)}{" "}개</span>
            </div>
          );
        })}
        {req.lines.length > 5 && (
          <button
            type="button"
            onClick={() => setLinesExpanded((v) => !v)}
            className="no-btn-inset px-3 py-2 text-left text-xs underline-offset-2 hover:underline"
            style={{ color: LEGACY_COLORS.cyan }}
          >
            {linesExpanded ? "접기" : `외 ${req.lines.length - 5}건 더보기`}
          </button>
        )}
      </div>

      {displayNotes && (
        <div className="mt-2 text-xs" style={{ color: LEGACY_COLORS.muted }}>
          <span className="font-bold">비고:</span>{" "}
          <span
            className={!notesExpanded && notesLong ? "line-clamp-2" : undefined}
            style={{ whiteSpace: "pre-wrap" }}
          >
            {displayNotes}
          </span>
          {notesLong && (
            <button
              type="button"
              onClick={() => setNotesExpanded((v) => !v)}
              className="ml-1 font-bold underline-offset-2 hover:underline"
              style={{ color: LEGACY_COLORS.cyan }}
            >
              {notesExpanded ? "접기" : "더보기"}
            </button>
          )}
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

      <div className="mt-3 flex items-center gap-2">
        {cancelable && onRevertToDraft && (
          <button
            type="button"
            className="rounded-[10px] border px-3 py-1.5 text-xs font-bold"
            style={{
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 50%, transparent)`,
              color: LEGACY_COLORS.cyan,
              background: LEGACY_COLORS.s1,
            }}
            onClick={onRevertToDraft}
          >
            수정
          </button>
        )}
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
