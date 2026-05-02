"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type StockRequest } from "@/lib/api";
import { LEGACY_COLORS, normalizeDepartment } from "../legacyUi";
import { formatQty } from "@/lib/mes/format";
import { ConfirmModal } from "@/features/mes/shared/ConfirmModal";

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
  onContinue: (draft: StockRequest) => void;
  onChanged: () => void;
}

export function DraftCartPanel({
  employeeId,
  refreshNonce,
  onContinue,
  onChanged,
}: Props) {
  const [drafts, setDrafts] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StockRequest | null>(null);
  const [opError, setOpError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!employeeId) {
      setDrafts([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await api.listStockRequestDrafts(employeeId);
      setDrafts(rows);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "작업 중 목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void reload();
  }, [reload, refreshNonce]);

  const handleDeleteConfirm = async () => {
    if (!employeeId || !deleteTarget) return;
    try {
      setBusyId(deleteTarget.request_id);
      await api.deleteStockRequestDraft(deleteTarget.request_id, employeeId);
      setDeleteTarget(null);
      await reload();
      onChanged();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
      setDeleteTarget(null);
    } finally {
      setBusyId(null);
    }
  };

  const handleSubmit = async (draft: StockRequest) => {
    if (!employeeId) return;
    try {
      setBusyId(draft.request_id);
      await api.submitStockRequestDraft(draft.request_id, employeeId);
      await reload();
      onChanged();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "요청 제출에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  if (!employeeId) {
    return (
      <div
        className="rounded-[14px] border px-5 py-6 text-sm"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.muted,
        }}
      >
        담당자를 먼저 선택하면 내 작업중 내역이 표시됩니다.
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
      {opError && (
        <div
          className="rounded-[12px] border px-4 py-3 text-sm"
          style={{
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`,
            color: LEGACY_COLORS.red,
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, transparent)`,
          }}
        >
          {opError}
          <button
            className="ml-2 underline text-xs"
            onClick={() => setOpError(null)}
          >
            닫기
          </button>
        </div>
      )}
      {!loading && drafts.length === 0 && !loadError && (
        <div
          className="rounded-[14px] border px-5 py-6 text-sm"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.muted,
          }}
        >
          작업 중인 요청이 없습니다. 요청 작성 화면에서 입력하면 자동으로 저장됩니다.
        </div>
      )}
      {drafts.map((draft) => {
        const totalQty = draft.lines.reduce(
          (sum, l) => sum + (Number(l.quantity) || 0),
          0,
        );
        const isBusy = busyId === draft.request_id;
        const canSubmit = draft.lines.length > 0 && !isBusy;
        return (
          <div
            key={draft.request_id}
            className="rounded-[14px] border px-5 py-4"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
            }}
          >
            <div
              className="flex flex-wrap items-center gap-2 text-sm"
              style={{ color: LEGACY_COLORS.text }}
            >
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
              <div
                className="mt-2 flex flex-col gap-1 text-sm"
                style={{ color: LEGACY_COLORS.text }}
              >
                {draft.lines.slice(0, 5).map((line) => (
                  <div
                    key={line.line_id}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span style={{ color: LEGACY_COLORS.muted2 }}>
                      {line.erp_code_snapshot ?? "-"}
                    </span>
                    <span>{line.item_name_snapshot}</span>
                    <span className="ml-auto font-bold">
                      {formatQty(line.quantity)} 개
                    </span>
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
                onClick={() => onContinue(draft)}
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
                onClick={() => setDeleteTarget(draft)}
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
                onClick={() => void handleSubmit(draft)}
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
      })}

      <ConfirmModal
        open={deleteTarget !== null}
        title="작업 삭제"
        tone="danger"
        confirmLabel="삭제"
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
      >
        이 작업 항목을 삭제하시겠습니까?
      </ConfirmModal>
    </div>
  );
}
