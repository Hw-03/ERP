"use client";

import { useState } from "react";
import type { StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { formatKstDateTime } from "@/lib/mes/format";
import {
  REQUEST_TYPE_LABEL,
  formatRequestNotes,
  getRequestStatusPresentation,
} from "./ioRequestLabels";
import { StockRequestLineTable } from "./StockRequestLineTable";

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
  const status = getRequestStatusPresentation(req.status);
  const [notesExpanded, setNotesExpanded] = useState(false);
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
        <div className={req.rejected_reason ? "min-w-0 shrink-0 self-center" : "min-w-0 flex-1 self-center"}>
          <div data-testid="my-request-heading" className="flex flex-wrap items-center gap-2">
            <span
              className="text-xl font-black leading-tight"
              style={{ color: LEGACY_COLORS.text }}
            >
              {typeLabel}
            </span>
            {(flowLabel || req.lines.length > 0) && (
              <span
                data-testid="my-request-summary"
                className="inline-flex flex-wrap items-center gap-1.5 text-sm font-medium"
                style={{ color: LEGACY_COLORS.muted }}
              >
                {flowLabel && <span>{flowLabel}</span>}
                {flowLabel && req.lines.length > 0 && <span aria-hidden="true"> · </span>}
                {req.lines.length > 0 && <span>{req.lines.length}건</span>}
              </span>
            )}
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{
                background: `color-mix(in srgb, ${status.color} 18%, transparent)`,
                color: status.color,
              }}
            >
              {status.label}
            </span>
          </div>
        </div>
        {req.rejected_reason && (
          <div
            data-testid="my-request-rejection"
            className="order-last flex basis-full flex-wrap items-center gap-x-1.5 gap-y-1 rounded-[12px] border px-3 py-2 text-base leading-5 lg:order-none lg:min-w-0 lg:flex-1"
            style={{
              background: LEGACY_COLORS.errorBg,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 28%, ${LEGACY_COLORS.border})`,
              color: LEGACY_COLORS.red,
            }}
          >
            <span className="shrink-0 font-bold">
              {req.status === "failed_approval" ? "승인 실패" : "반려"} 사유:
            </span>
            <span className="min-w-0 flex-1 font-medium" style={{ color: LEGACY_COLORS.text }}>
              {req.rejected_reason}
            </span>
          </div>
        )}
        <span
          className="self-center whitespace-nowrap text-base font-bold tabular-nums"
          style={{ color: LEGACY_COLORS.muted }}
        >
          {formatKstDateTime(req.submitted_at ?? req.created_at)}
        </span>
      </div>

      <StockRequestLineTable lines={req.lines} collapseAfter={5} />

      {(displayNotes || cancelable) && (
        <div data-testid="my-request-footer" className="mt-3 flex flex-wrap items-center gap-3">
          {displayNotes && (
            <div className="min-w-0 flex-1 text-base" style={{ color: LEGACY_COLORS.muted }}>
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
          {cancelable && (
            <div data-testid="my-request-actions" className="ml-auto flex shrink-0 items-center gap-2">
              {onRevertToDraft && (
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
