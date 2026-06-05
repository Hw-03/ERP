"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Copy } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { Department } from "@/lib/api/types/shared";
import type { DefectLocation } from "@/lib/api/types/defects";
import { ReasonFormFields } from "./ReasonFormFields";

export type BatchAction = "unquarantine" | "scrap" | "return";

const META: Record<BatchAction, { title: string; submit: string }> = {
  unquarantine: { title: "선택 항목 정상 복귀", submit: "정상 복귀" },
  scrap: { title: "선택 항목 폐기", submit: "즉시 폐기" },
  return: { title: "선택 항목 반품", submit: "즉시 반품" },
};

interface ReasonRow {
  category: string;
  memo: string;
}

interface RowFailure {
  key: string;
  message: string;
}

interface Props {
  action: BatchAction;
  locations: DefectLocation[];
  currentEmployee: { employee_id: string; name: string; department: string };
  onDone: () => void;
  onCancel: () => void;
}

const keyOf = (loc: DefectLocation) => `${loc.item_id}__${loc.department}`;

/**
 * 단순 격리 항목(정상복귀/폐기/반품) 일괄 처리 확인 전폭 화면.
 * 줄마다 품목별 사유 입력("위 사유 복사" 보조) → 줄마다 단건 API 루프(Promise.allSettled).
 */
export function DefectBatchConfirm({
  action,
  locations,
  currentEmployee,
  onDone,
  onCancel,
}: Props) {
  const meta = META[action];
  const [reasons, setReasons] = useState<Record<string, ReasonRow>>(() =>
    Object.fromEntries(locations.map((l) => [keyOf(l), { category: "", memo: "" }])),
  );
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<RowFailure[]>([]);

  const allValid = useMemo(
    () => locations.length > 0 && locations.every((l) => Boolean(reasons[keyOf(l)]?.category)),
    [locations, reasons],
  );

  function setReason(key: string, patch: Partial<ReasonRow>) {
    setReasons((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function copyDown(index: number) {
    const srcKey = keyOf(locations[index]);
    const src = reasons[srcKey];
    if (!src) return;
    setReasons((prev) => {
      const next = { ...prev };
      locations.slice(index + 1).forEach((l) => {
        next[keyOf(l)] = { category: src.category, memo: src.memo };
      });
      return next;
    });
  }

  async function submitRow(loc: DefectLocation): Promise<void> {
    const r = reasons[keyOf(loc)];
    const qty = Number(loc.quantity);
    if (action === "unquarantine") {
      await defectsApi.unquarantine({
        item_id: loc.item_id,
        qty,
        dept: loc.department,
        reason_category: r.category,
        reason_memo: r.memo,
        actor_employee_id: currentEmployee.employee_id,
      });
      return;
    }
    await stockRequestsApi.createStockRequest({
      requester_employee_id: currentEmployee.employee_id,
      request_type: action === "scrap" ? "defect_scrap" : "defect_return",
      reason_category: r.category,
      reason_memo: r.memo || null,
      notes: r.memo || null,
      lines: [
        {
          item_id: loc.item_id,
          quantity: qty,
          from_bucket: "defective",
          from_department: loc.department as Department,
          to_bucket: "none",
        },
      ],
    });
  }

  async function handleSubmit() {
    if (!allValid || busy) return;
    setBusy(true);
    setFailures([]);
    const results = await Promise.allSettled(locations.map((l) => submitRow(l)));
    const nextFailures: RowFailure[] = [];
    results.forEach((res, i) => {
      if (res.status === "rejected") {
        nextFailures.push({
          key: keyOf(locations[i]),
          message: res.reason instanceof Error ? res.reason.message : "처리 실패",
        });
      }
    });
    setBusy(false);
    if (nextFailures.length === 0) {
      onDone();
      return;
    }
    setFailures(nextFailures);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-sm font-bold transition-colors hover:brightness-110 disabled:opacity-50"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2 }}
        >
          <ArrowLeft className="h-4 w-4" />
          취소
        </button>
        <div className="min-w-0">
          <h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>
            {meta.title}
          </h2>
          <p className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            {locations.length}건 일괄 처리 — 즉시 반영됩니다. 줄마다 사유를 입력하세요.
          </p>
        </div>
      </div>

      {/* 목록 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {locations.map((loc, idx) => {
          const key = keyOf(loc);
          const r = reasons[key] ?? { category: "", memo: "" };
          const fail = failures.find((f) => f.key === key);
          return (
            <div
              key={key}
              className="flex flex-col gap-2 rounded-[14px] border px-4 py-3"
              style={{
                background: LEGACY_COLORS.s1,
                borderColor: fail ? tint(LEGACY_COLORS.red, 30) : LEGACY_COLORS.border,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                    {loc.mes_code} · {loc.department}
                  </span>
                  <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                    {loc.item_name}{" "}
                    <span style={{ color: LEGACY_COLORS.muted }}>× {formatQty(loc.quantity)}개</span>
                  </div>
                </div>
                {idx < locations.length - 1 && (r.category || r.memo) && (
                  <button
                    type="button"
                    onClick={() => copyDown(idx)}
                    className="flex shrink-0 items-center gap-1 text-xs font-bold hover:underline"
                    style={{ color: LEGACY_COLORS.blue }}
                  >
                    <Copy className="h-3 w-3" />
                    위 사유 복사
                  </button>
                )}
              </div>

              <ReasonFormFields
                category={r.category}
                memo={r.memo}
                onCategoryChange={(c) => setReason(key, { category: c })}
                onMemoChange={(m) => setReason(key, { memo: m })}
                required
              />

              {fail && <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>실패: {fail.message}</div>}
            </div>
          );
        })}
      </div>

      {/* 제출 바 */}
      <div className="flex shrink-0 items-center justify-between gap-2 pt-1">
        {failures.length > 0 ? (
          <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>
            {failures.length}건 실패 — 다시 제출하세요.
          </span>
        ) : (
          <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            모든 줄에 사유 카테고리가 필요합니다.
          </span>
        )}
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!allValid || busy}
          className="rounded-[14px] px-6 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
          style={{ background: LEGACY_COLORS.red }}
        >
          {busy ? "처리 중..." : `${meta.submit} (${locations.length}건) →`}
        </button>
      </div>
    </div>
  );
}
