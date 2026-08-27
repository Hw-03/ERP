"use client";

import type { StockRequest } from "@/lib/api";
import { PIN_LENGTH } from "@/lib/auth/constants";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { formatKstDateTime } from "@/lib/mes/format";
import {
  REQUEST_TYPE_LABEL,
  formatRequestNotes,
  getRequestStatusPresentation,
} from "./ioRequestLabels";
import { StockRequestLineTable } from "./StockRequestLineTable";

function normalizePin(value: string) {
  return value.replace(/\D/g, "").slice(0, PIN_LENGTH);
}

/**
 * Round-13 (#4) 추출 — WarehouseQueuePanel 의 단일 request 행.
 *
 * 승인/반려 inline form 표시도 본 컴포넌트에서 처리. state 와 mutator 는 부모에서 받음.
 */
export interface WarehouseQueueRowProps {
  req: StockRequest;
  busyId: string | null;
  approvePinFor: string | null;
  approvePin: string;
  approveError: string | null;
  setApprovePin: (v: string) => void;
  setApprovePinFor: (id: string | null) => void;
  showRejectFor: string | null;
  rejectReason: string;
  rejectPin: string;
  rejectError: string | null;
  setRejectReason: (v: string) => void;
  setRejectPin: (v: string) => void;
  setShowRejectFor: (id: string | null) => void;
  closeApprove: () => void;
  closeReject: () => void;
  submitApprove: (id: string) => void;
  submitReject: (id: string) => void;
  highlighted?: boolean;
}

export function WarehouseQueueRow(props: WarehouseQueueRowProps) {
  const {
    req,
    busyId,
    approvePinFor, approvePin, approveError,
    setApprovePin, setApprovePinFor,
    showRejectFor, rejectReason, rejectPin, rejectError,
    setRejectReason, setRejectPin, setShowRejectFor,
    closeApprove, closeReject,
    submitApprove, submitReject,
    highlighted,
  } = props;

  const noteText = formatRequestNotes(req.notes);
  const typeLabel = REQUEST_TYPE_LABEL[req.request_type] ?? req.request_type;
  const status = getRequestStatusPresentation(req.status);
  const firstLine = req.lines[0];
  const fromDept = firstLine?.from_department ? normalizeDepartment(firstLine.from_department) : null;
  const toDept = firstLine?.to_department ? normalizeDepartment(firstLine.to_department) : null;
  const flowLabel =
    fromDept && toDept ? `${fromDept} → ${toDept}` : fromDept ?? toDept ?? null;

  return (
    <div
      key={req.request_id}
      data-stock-request-id={req.request_id}
      className={`rounded-[14px] border px-5 py-4${highlighted ? " ring-2 ring-[var(--c-blue)]" : ""}`}
      style={{ background: LEGACY_COLORS.s2, borderColor: highlighted ? LEGACY_COLORS.blue : LEGACY_COLORS.border }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-xl font-black leading-tight"
              style={{ color: LEGACY_COLORS.text }}
            >
              {typeLabel}
            </span>
            {(flowLabel || req.lines.length > 0) && (
              <span
                data-testid="warehouse-request-summary"
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
        <div
          className="flex max-w-full flex-wrap items-center justify-end gap-x-3 gap-y-1 pt-0.5 text-sm"
          style={{ color: LEGACY_COLORS.muted }}
        >
          <span className="whitespace-nowrap text-base font-bold tabular-nums">
            {formatKstDateTime(req.submitted_at ?? req.created_at)}
          </span>
          <span className="whitespace-nowrap">
            {req.requester_name} · {normalizeDepartment(req.requester_department)}
          </span>
        </div>
      </div>

      <StockRequestLineTable lines={req.lines} />

      {noteText &&
        (approvePinFor === req.request_id || showRejectFor === req.request_id) && (
        <div className="mt-3 text-base" style={{ color: LEGACY_COLORS.muted }}>
          비고: {noteText}
        </div>
      )}

      {approvePinFor === req.request_id ? (
        <div
          className="mt-3 flex flex-wrap items-center gap-2 rounded-[12px] border px-3 py-2"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          {approveError && (
            <div className="w-full text-xs" style={{ color: LEGACY_COLORS.red }}>
              {approveError}
            </div>
          )}
          <span className="text-xs" style={{ color: LEGACY_COLORS.muted }}>승인 PIN</span>
          <input
            type="password"
            inputMode="numeric"
            value={approvePin}
            onChange={(e) => setApprovePin(normalizePin(e.target.value))}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !e.nativeEvent.isComposing && approvePin.length === PIN_LENGTH) {
                e.preventDefault();
                submitApprove(req.request_id);
              }
            }}
            className="rounded border px-2 py-1 text-sm"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text, width: "8rem" }}
            placeholder="0000"
            maxLength={PIN_LENGTH}
            autoFocus
          />
          <button
            type="button"
            disabled={busyId === req.request_id}
            onClick={() => submitApprove(req.request_id)}
            className="rounded-[10px] px-3 py-1.5 text-xs font-bold"
            style={{ background: LEGACY_COLORS.greenSolid, color: "white" }}
          >
            {busyId === req.request_id ? "처리 중..." : "승인 확정"}
          </button>
          <button
            type="button"
            onClick={closeApprove}
            className="rounded-[10px] border px-3 py-1.5 text-xs"
            style={{ borderColor: LEGACY_COLORS.borderStrong, color: LEGACY_COLORS.text }}
          >
            취소
          </button>
        </div>
      ) : showRejectFor === req.request_id ? (
        <div
          className="mt-3 flex flex-col gap-2 rounded-[12px] border px-3 py-2"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          {rejectError && (
            <div className="text-xs" style={{ color: LEGACY_COLORS.red }}>
              {rejectError}
            </div>
          )}
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full rounded border px-2 py-1 text-sm"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            placeholder="반려 사유"
            rows={2}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs" style={{ color: LEGACY_COLORS.muted }}>PIN</span>
            <input
              type="password"
              inputMode="numeric"
              value={rejectPin}
              onChange={(e) => setRejectPin(normalizePin(e.target.value))}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.nativeEvent.isComposing &&
                  rejectPin.length === PIN_LENGTH &&
                  rejectReason.trim()
                ) {
                  e.preventDefault();
                  submitReject(req.request_id);
                }
              }}
              className="rounded border px-2 py-1 text-sm"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text, width: "8rem" }}
              placeholder="0000"
              maxLength={PIN_LENGTH}
            />
            <button
              type="button"
              disabled={busyId === req.request_id}
              onClick={() => submitReject(req.request_id)}
              className="rounded-[10px] px-3 py-1.5 text-xs font-bold"
              style={{ background: LEGACY_COLORS.redSolid, color: "white" }}
            >
              {busyId === req.request_id ? "처리 중..." : "반려 확정"}
            </button>
            <button
              type="button"
              onClick={closeReject}
              className="rounded-[10px] border px-3 py-1.5 text-xs"
              style={{ borderColor: LEGACY_COLORS.borderStrong, color: LEGACY_COLORS.text }}
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <div
          data-testid="warehouse-queue-footer"
          className="mt-3 flex flex-wrap items-center gap-3"
        >
          {noteText && (
            <div className="min-w-0 flex-1 text-base" style={{ color: LEGACY_COLORS.muted }}>
              비고: {noteText}
            </div>
          )}
          <div
            data-testid="warehouse-queue-actions"
            className="ml-auto flex shrink-0 items-center gap-2"
          >
            <button
              type="button"
              onClick={() => {
                closeReject();
                setApprovePinFor(req.request_id);
                setApprovePin("");
              }}
              className="rounded-[10px] px-3 py-1.5 text-xs font-bold"
              style={{ background: LEGACY_COLORS.greenSolid, color: "white" }}
            >
              승인
            </button>
            <button
              type="button"
              onClick={() => {
                closeApprove();
                setShowRejectFor(req.request_id);
                setRejectReason("");
                setRejectPin("");
              }}
              className="rounded-[10px] border px-3 py-1.5 text-xs"
              style={{
                borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 40%, transparent)`,
                color: LEGACY_COLORS.red,
              }}
            >
              반려
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
