"use client";

import { useState } from "react";
import type { StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatKstDateTime } from "@/lib/mes/format";
import {
  REQUEST_TYPE_LABEL,
  formatRequestNotes,
  getRequestFlowLabel,
  getRequestStatusPresentation,
} from "./ioRequestLabels";
import { StockRequestLineTable } from "./StockRequestLineTable";

/**
 * Round-13 (#13) 추출 — MyRequestsPanel 의 단일 request 행.
 */
export function MyRequestRow({
  req,
  linkedRequests = [],
  isGroupedInternalUseBatch = false,
  onCancelRequest,
  onRevertToDraft,
  highlighted,
}: {
  req: StockRequest;
  /** 같은 작업 묶음에서 서버가 반환한 다른 승인 요청. */
  linkedRequests?: StockRequest[];
  /** AS·연구 사용출고의 승인 요청 묶음 여부. */
  isGroupedInternalUseBatch?: boolean;
  onCancelRequest: () => void;
  onRevertToDraft?: () => void;
  highlighted?: boolean;
}) {
  const approvalRequests = [req, ...linkedRequests];
  const allLines = approvalRequests.flatMap((entry) => entry.lines);
  const hasOpenRequest = approvalRequests.some((entry) => entry.status === "submitted" || entry.status === "reserved");
  const canRevert = !isGroupedInternalUseBatch && Boolean(onRevertToDraft && req.operation_batch_id);
  const aggregateStatus = (() => {
    if (hasOpenRequest) return "submitted";
    const hasCompletedRequest = approvalRequests.some((entry) => entry.status === "completed");
    const hasNonCompletedTerminalRequest = approvalRequests.some((entry) =>
      entry.status === "cancelled" || entry.status === "rejected" || entry.status === "failed_approval",
    );
    if (hasCompletedRequest && hasNonCompletedTerminalRequest) return "partially_completed";
    if (approvalRequests.every((entry) => entry.status === "completed")) return "completed";
    if (approvalRequests.every((entry) => entry.status === "cancelled")) return "cancelled";
    if (approvalRequests.every((entry) => entry.status === "rejected")) return "rejected";
    if (approvalRequests.every((entry) => entry.status === "failed_approval")) return "failed_approval";
    if (approvalRequests.some((entry) => entry.status === "failed_approval")) return "failed_approval";
    if (approvalRequests.some((entry) => entry.status === "rejected")) return "rejected";
    if (approvalRequests.some((entry) => entry.status === "cancelled")) return "cancelled";
    return req.status;
  })();
  const typeLabel = REQUEST_TYPE_LABEL[req.request_type] ?? req.request_type;
  const status = getRequestStatusPresentation(aggregateStatus);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const displayNotes = formatRequestNotes(req.notes);
  const notesLong = (displayNotes ?? "").length > 60;

  const flowLabel = getRequestFlowLabel(req.request_type, allLines);
  const approvalLines = [
    { label: "창고 승인", request: approvalRequests.find((entry) => entry.requires_warehouse_approval), approver: "approved_by_name" as const },
    { label: "AS·연구 승인", request: approvalRequests.find((entry) => entry.requires_as_research_approval), approver: "as_research_approved_by_name" as const },
    { label: "부서 승인", request: approvalRequests.find((entry) => entry.requires_department_approval), approver: "department_approved_by_name" as const },
  ].filter((entry) => entry.request);

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
            {(flowLabel || allLines.length > 0) && (
              <span
                data-testid="my-request-summary"
                className="inline-flex flex-wrap items-center gap-1.5 text-sm font-medium"
                style={{ color: LEGACY_COLORS.muted }}
              >
                {flowLabel && <span>{flowLabel}</span>}
                {flowLabel && allLines.length > 0 && <span aria-hidden="true"> · </span>}
                {allLines.length > 0 && <span>{allLines.length}건</span>}
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
            {req.request_type === "defect_return" && req.supplier_name_snapshot && (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: LEGACY_COLORS.s1, color: LEGACY_COLORS.blue }}>
                공급업체 · {req.supplier_name_snapshot}
              </span>
            )}
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

      <StockRequestLineTable lines={allLines} requestType={req.request_type} collapseAfter={5} />

      {approvalLines.length > 0 && (
        <div data-testid="my-request-approvals" className="mt-3 space-y-1 rounded-[12px] border px-3 py-2 text-xs" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
          {approvalLines.map(({ label, request, approver }) => {
            const approvedBy = request![approver];
            const rejected = request!.status === "rejected" || request!.status === "failed_approval";
            const handler = rejected ? request!.rejected_by_name : approvedBy;
            const state = request!.status === "cancelled" ? "취소" : request!.status === "failed_approval" ? "승인 실패" : rejected ? "반려" : approvedBy ? "승인" : "대기";
            return (
              <div key={label} className="flex flex-wrap gap-x-1" style={{ color: rejected ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}>
                <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>{label}</span>
                <span aria-hidden>·</span>
                <span>{state}</span>
                {handler && <><span aria-hidden>·</span><span>{handler}</span></>}
                {rejected && request!.rejected_reason && <><span aria-hidden>·</span><span>{request!.rejected_reason}</span></>}
              </div>
            );
          })}
        </div>
      )}

      {(displayNotes || hasOpenRequest) && (
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
          {hasOpenRequest && (
            <div data-testid="my-request-actions" className="ml-auto flex shrink-0 items-center gap-2">
              {onRevertToDraft && canRevert && (
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
