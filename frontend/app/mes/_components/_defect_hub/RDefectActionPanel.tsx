"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { DefectLocation } from "@/lib/api/types/defects";
import { ReasonFormFields } from "./ReasonFormFields";
import { InlineErrorNote } from "./InlineErrorNote";

type RAction = "unquarantine" | "scrap" | "return";

const ACTION_LABELS: Record<RAction, string> = {
  unquarantine: "정상 복귀",
  scrap: "폐기",
  return: "원자재 반품",
};

// 결재 흐름이 아직 미구현이라 폐기/반품도 현재는 즉시 처리된다. 허울뿐인 "결재 필요"
// 문구를 즉시 처리에 맞게 정리한다(진짜 결재는 후속 작업으로 분리).
const ACTION_DESC: Record<RAction, string> = {
  unquarantine: "잘못 격리된 경우. 즉시 정상 재고로 복귀.",
  scrap: "재고에서 제거합니다. 즉시 처리됩니다.",
  return: "공급처에 반품합니다. 즉시 처리됩니다.",
};

export interface RDefectActionPanelProps {
  location: DefectLocation;
  currentEmployee: { employee_id: string; name: string; department: string };
  onSubmitted: () => void;
  onClose: () => void;
}

/**
 * R(원자재) 격리 항목 처리 패널 — RDefectActionModal 의 마스터-디테일 패널 버전.
 * createPortal + fixed overlay 껍데기만 벗기고 폼/검증/제출 로직은 100% 동일하게 보존.
 * 정상복귀 → defectsApi.unquarantine (즉시). 폐기/반품 → stockRequestsApi.createStockRequest (즉시).
 */
export function RDefectActionPanel({
  location,
  currentEmployee,
  onSubmitted,
  onClose,
}: RDefectActionPanelProps): JSX.Element {
  const [action, setAction] = useState<RAction>("unquarantine");
  const [category, setCategory] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // location 이 바뀌면(다른 항목 선택) 폼 초기화.
  useEffect(() => {
    setAction("unquarantine");
    setCategory("");
    setMemo("");
    setError(null);
    setBusy(false);
  }, [location.item_id, location.department]);

  const canSubmit = Boolean(category) && !busy;

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    try {
      if (action === "unquarantine") {
        await defectsApi.unquarantine({
          item_id: location.item_id,
          qty: Number(location.quantity),
          dept: location.department,
          reason_category: category,
          reason_memo: memo,
          actor_employee_id: currentEmployee.employee_id,
        });
      } else {
        // 폐기 or 반품 — stock_requests (현재는 즉시 처리)
        const requestType = action === "scrap" ? "defect_scrap" : "defect_return";
        await stockRequestsApi.createStockRequest({
          requester_employee_id: currentEmployee.employee_id,
          request_type: requestType,
          reason_category: category,
          reason_memo: memo || null,
          notes: memo || null,
          lines: [
            {
              item_id: location.item_id,
              quantity: Number(location.quantity),
              from_bucket: "defective",
              from_department: location.department as Parameters<
                typeof stockRequestsApi.createStockRequest
              >[0]["lines"][0]["from_department"],
              to_bucket: "none",
            },
          ],
        });
      }

      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 헤더 */}
      <div className="mb-1 flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: LEGACY_COLORS.red }} />
        <div>
          <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>
            {location.mes_code} {location.item_name}{" "}
            <span style={{ color: LEGACY_COLORS.muted }}>× {Number(location.quantity)}개</span>
          </div>
          <div className="mt-0.5 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            {location.department} [불량] / 격리{" "}
            {location.defective_at ? new Date(location.defective_at).toLocaleDateString("ko-KR") : "기록 없음"}
          </div>
        </div>
      </div>

      <hr className="my-4" style={{ borderColor: LEGACY_COLORS.border }} />

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {/* 액션 선택 */}
        <p className="mb-3 text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
          이 격리 항목을 어떻게 할까요?
        </p>
        <div className="mb-4 flex flex-col gap-2">
          {(["unquarantine", "scrap", "return"] as RAction[]).map((act) => (
            <label
              key={act}
              className="flex cursor-pointer items-start gap-3 rounded-[12px] border px-4 py-3 transition-colors"
              style={{
                borderColor: action === act ? LEGACY_COLORS.red : LEGACY_COLORS.border,
                background:
                  action === act
                    ? `color-mix(in srgb, ${LEGACY_COLORS.red} 6%, ${LEGACY_COLORS.s2})`
                    : LEGACY_COLORS.s2,
              }}
            >
              <input
                type="radio"
                name="r-action"
                value={act}
                checked={action === act}
                onChange={() => setAction(act)}
                className="mt-0.5 accent-red-500"
              />
              <div>
                <div className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                  {ACTION_LABELS[act]}
                  {act !== "unquarantine" && (
                    <span
                      className="ml-2 rounded-full px-2 py-0.5 text-xs font-black"
                      style={{ background: LEGACY_COLORS.red, color: LEGACY_COLORS.white }}
                    >
                      즉시 처리
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs" style={{ color: LEGACY_COLORS.muted }}>
                  {ACTION_DESC[act]}
                </div>
              </div>
            </label>
          ))}
        </div>

        <hr className="mb-4" style={{ borderColor: LEGACY_COLORS.border }} />

        {/* 사유 폼 */}
        <ReasonFormFields
          category={category}
          memo={memo}
          onCategoryChange={setCategory}
          onMemoChange={setMemo}
          required
        />

        {/* 에러 */}
        {error && <InlineErrorNote className="mt-3">{error}</InlineErrorNote>}
      </div>

      {/* 버튼 */}
      <div className="mt-4 flex items-center justify-end gap-2 pt-3">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-[14px] border px-5 py-2.5 text-sm font-bold transition-colors hover:brightness-125 disabled:opacity-50"
          style={{
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.muted2,
            background: LEGACY_COLORS.s2,
          }}
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          className="rounded-[14px] px-5 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
          style={{ background: LEGACY_COLORS.red }}
        >
          {busy ? "처리 중..." : "확인 →"}
        </button>
      </div>
    </div>
  );
}
