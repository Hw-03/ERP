"use client";

import { useEffect, useState } from "react";
import { Trash2, FileEdit } from "lucide-react";
import { api, type StockRequest, type StockRequestType } from "@/lib/api";
import { ApiError } from "@/lib/api-core";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatDateTime, formatQty } from "@/lib/mes/format";
import type { ToastState } from "@/lib/ui/Toast";
import { useCurrentOperator } from "../../../login/useCurrentOperator";
import { TYPO } from "../../tokens";
import { AsyncState, EmptyState, SectionCard } from "../../primitives";

const TYPE_LABEL: Record<StockRequestType, string> = {
  raw_receive: "공급업체 입고",
  raw_ship: "공급업체 출고",
  warehouse_to_dept: "창고→부서",
  dept_to_warehouse: "부서→창고",
  dept_internal: "부서 내 조정",
  mark_defective_wh: "불량 격리(창고)",
  mark_defective_prod: "불량 격리(부서)",
  supplier_return: "공급업체 반품",
  manual_adjustment: "낱개 조정",
};

export function DraftsListPanel({
  showToast,
}: {
  showToast: (toast: ToastState) => void;
}) {
  const operator = useCurrentOperator();
  const [drafts, setDrafts] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    if (!operator) return;
    setLoading(true);
    setError(null);
    try {
      const list = await api.listStockRequestDrafts(operator.employee_id);
      setDrafts(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "장바구니를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operator?.employee_id]);

  const onDelete = async (req: StockRequest) => {
    if (!operator) return;
    if (!confirm("이 장바구니 항목을 삭제할까요?")) return;
    setDeletingId(req.request_id);
    try {
      await api.deleteStockRequestDraft(req.request_id, operator.employee_id);
      showToast({ type: "info", message: "장바구니 항목을 삭제했습니다." });
      load();
    } catch (e) {
      const msg =
        e instanceof ApiError && e.isConflict
          ? "이미 처리된 요청입니다."
          : e instanceof ApiError && e.isUnavailable
          ? "서버가 다른 작업을 처리 중입니다. 잠시 후 다시 시도하세요."
          : e instanceof Error
          ? e.message
          : "삭제에 실패했습니다.";
      showToast({ type: "error", message: msg });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <AsyncState
        loading={loading}
        error={error}
        empty={!loading && drafts.length === 0}
        emptyView={
          <EmptyState
            icon={FileEdit}
            title="이어쓸 작업이 없습니다"
            description="작성 탭에서 작업유형을 선택해 시작하세요."
          />
        }
        onRetry={load}
      >
        <div className="flex flex-col gap-2">
          {drafts.map((d) => (
            <SectionCard key={d.request_id} padding="md">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div
                    className={`${TYPO.caption} font-semibold`}
                    style={{ color: LEGACY_COLORS.muted2 }}
                  >
                    {TYPE_LABEL[d.request_type] ?? d.request_type}
                  </div>
                  <div
                    className={`${TYPO.body} truncate font-black`}
                    style={{ color: LEGACY_COLORS.text }}
                  >
                    {d.lines.length}품목 ·{" "}
                    {formatQty(
                      d.lines.reduce((s, l) => s + Number(l.quantity || 0), 0),
                    )}
                  </div>
                  <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                    {formatDateTime(d.updated_at ?? d.created_at)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(d)}
                  disabled={deletingId === d.request_id}
                  aria-label="장바구니 삭제"
                  className="shrink-0 rounded-full p-2 disabled:opacity-40"
                  style={{ color: LEGACY_COLORS.red as string }}
                >
                  <Trash2 size={18} strokeWidth={1.85} />
                </button>
              </div>
              {d.notes ? (
                <div className={`${TYPO.caption} mt-2`} style={{ color: LEGACY_COLORS.muted2 }}>
                  메모: {d.notes}
                </div>
              ) : null}
            </SectionCard>
          ))}
        </div>
      </AsyncState>
    </div>
  );
}
