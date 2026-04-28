"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type StockRequest } from "@/lib/api";
import { LEGACY_COLORS, formatNumber, normalizeDepartment } from "../legacyUi";

const STATUS_LABEL: Record<string, string> = {
  draft: "임시",
  submitted: "제출됨",
  reserved: "점유중",
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

interface Props {
  employeeId: string | null;
  refreshNonce: number;
  onChanged: () => void;
}

export function MyRequestsPanel({ employeeId, refreshNonce, onChanged }: Props) {
  const [items, setItems] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!employeeId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await api.listMyStockRequests(employeeId);
      setItems(rows);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "요청 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void reload();
  }, [reload, refreshNonce]);

  const handleCancel = async (request: StockRequest) => {
    const pin = window.prompt("취소를 위해 PIN을 입력하세요.", "");
    if (!pin) return;
    try {
      await api.cancelStockRequest(request.request_id, {
        actor_employee_id: request.requester_employee_id,
        pin,
      });
      await reload();
      onChanged();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "요청 취소에 실패했습니다.");
    }
  };

  if (!employeeId) {
    return (
      <div
        className="rounded-[14px] border px-5 py-6 text-sm"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
      >
        담당자를 먼저 선택하면 내 요청 현황이 표시됩니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {loading && (
        <div className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
          불러오는 중...
        </div>
      )}
      {loadError && (
        <div
          className="rounded-[12px] border px-4 py-3 text-sm"
          style={{
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`,
            color: LEGACY_COLORS.red,
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, transparent)`,
          }}
        >
          {loadError}
        </div>
      )}
      {!loading && items.length === 0 && !loadError && (
        <div
          className="rounded-[14px] border px-5 py-6 text-sm"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
        >
          아직 제출한 요청이 없습니다.
        </div>
      )}
      {items.map((req) => {
        const cancelable =
          req.status === "submitted" || req.status === "reserved";
        return (
          <div
            key={req.request_id}
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
                  <span className="ml-auto font-bold">{formatNumber(line.quantity)}{" "}개</span>
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
                  onClick={() => handleCancel(req)}
                >
                  취소
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
