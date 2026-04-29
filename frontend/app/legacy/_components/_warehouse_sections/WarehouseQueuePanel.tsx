"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type StockRequest } from "@/lib/api";
import { LEGACY_COLORS, formatNumber, normalizeDepartment } from "../legacyUi";

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

interface Props {
  approverEmployeeId: string;
  refreshNonce: number;
  onChanged: () => void;
}

export function WarehouseQueuePanel({ approverEmployeeId, refreshNonce, onChanged }: Props) {
  const [items, setItems] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showRejectFor, setShowRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectPin, setRejectPin] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [approvePinFor, setApprovePinFor] = useState<string | null>(null);
  const [approvePin, setApprovePin] = useState("");
  const [approveError, setApproveError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listWarehouseQueue();
      setItems(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "승인함을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshNonce]);

  const closeApprove = () => {
    setApprovePinFor(null);
    setApprovePin("");
    setApproveError(null);
  };
  const closeReject = () => {
    setShowRejectFor(null);
    setRejectReason("");
    setRejectPin("");
    setRejectError(null);
  };

  const submitApprove = async (requestId: string) => {
    if (!approvePin) return;
    setBusyId(requestId);
    try {
      await api.approveStockRequest(requestId, {
        actor_employee_id: approverEmployeeId,
        pin: approvePin,
      });
      closeApprove();
      await reload();
      onChanged();
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "승인에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  const submitReject = async (requestId: string) => {
    if (!rejectPin || !rejectReason.trim()) {
      setRejectError("PIN과 반려 사유를 모두 입력해 주세요.");
      return;
    }
    setRejectError(null);
    setBusyId(requestId);
    try {
      await api.rejectStockRequest(requestId, {
        actor_employee_id: approverEmployeeId,
        pin: rejectPin,
        reason: rejectReason.trim(),
      });
      closeReject();
      await reload();
      onChanged();
    } catch (err) {
      setRejectError(err instanceof Error ? err.message : "반려에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {loading && (
        <div className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
          승인함 불러오는 중...
        </div>
      )}
      {error && (
        <div
          className="rounded-[12px] border px-4 py-3 text-sm"
          style={{
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`,
            color: LEGACY_COLORS.red,
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, transparent)`,
          }}
        >
          {error}
        </div>
      )}
      {!loading && items.length === 0 && !error && (
        <div
          className="rounded-[14px] border px-5 py-6 text-sm"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
        >
          승인 대기 중인 요청이 없습니다.
        </div>
      )}
      {items.map((req) => (
        <div
          key={req.request_id}
          className="rounded-[14px] border px-5 py-4"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: LEGACY_COLORS.text }}>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 18%, transparent)`,
                color: LEGACY_COLORS.yellow,
              }}
            >
              {req.status === "reserved" ? "승인 대기" : "제출됨"}
            </span>
            <span className="font-mono text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {req.request_code ?? req.request_id.slice(0, 8)}
            </span>
            <span className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
              {REQUEST_TYPE_LABEL[req.request_type] ?? req.request_type}
            </span>
            <span className="ml-auto text-xs" style={{ color: LEGACY_COLORS.muted }}>
              {req.requester_name} · {normalizeDepartment(req.requester_department)}
            </span>
          </div>

          <div className="mt-2 flex flex-col gap-1 text-sm" style={{ color: LEGACY_COLORS.text }}>
            {req.lines.map((line) => (
              <div key={line.line_id} className="flex flex-wrap items-center gap-2">
                <span style={{ color: LEGACY_COLORS.muted2 }}>{line.erp_code_snapshot ?? "-"}</span>
                <span>{line.item_name_snapshot}</span>
                <span className="ml-auto font-bold">{formatNumber(line.quantity)} 개</span>
                <span className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
                  {line.from_bucket === "warehouse"
                    ? "창고"
                    : line.from_department
                      ? `${normalizeDepartment(line.from_department)} ${line.from_bucket === "defective" ? "불량" : "생산"}`
                      : "외부"}
                  {" → "}
                  {line.to_bucket === "warehouse"
                    ? "창고"
                    : line.to_department
                      ? `${normalizeDepartment(line.to_department)} ${line.to_bucket === "defective" ? "불량" : "생산"}`
                      : "외부"}
                </span>
              </div>
            ))}
          </div>

          {req.notes && (
            <div className="mt-2 text-xs" style={{ color: LEGACY_COLORS.muted }}>
              비고: {req.notes}
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
                onChange={(e) => setApprovePin(e.target.value)}
                className="rounded border px-2 py-1 text-sm"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text, width: "8rem" }}
                placeholder="0000"
                autoFocus
              />
              <button
                type="button"
                disabled={busyId === req.request_id}
                onClick={() => void submitApprove(req.request_id)}
                className="rounded-[10px] px-3 py-1.5 text-xs font-bold"
                style={{ background: LEGACY_COLORS.green, color: "white" }}
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
                  onChange={(e) => setRejectPin(e.target.value)}
                  className="rounded border px-2 py-1 text-sm"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text, width: "8rem" }}
                  placeholder="0000"
                />
                <button
                  type="button"
                  disabled={busyId === req.request_id}
                  onClick={() => void submitReject(req.request_id)}
                  className="rounded-[10px] px-3 py-1.5 text-xs font-bold"
                  style={{ background: LEGACY_COLORS.red, color: "white" }}
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
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  closeReject();
                  setApprovePinFor(req.request_id);
                  setApprovePin("");
                }}
                className="rounded-[10px] px-3 py-1.5 text-xs font-bold"
                style={{ background: LEGACY_COLORS.green, color: "white" }}
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
          )}
        </div>
      ))}
    </div>
  );
}
