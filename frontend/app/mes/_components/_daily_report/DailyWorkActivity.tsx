"use client";

import { ChevronDown, ChevronRight, ClipboardList } from "lucide-react";
import { useState } from "react";
import type { DailyWorkActivity as DailyWorkActivityData } from "@/lib/api/types/daily-work-reports";
import { LEGACY_COLORS } from "@/lib/mes/color";

function formatQuantities(quantities: Record<string, number>): string {
  return Object.entries(quantities)
    .map(([unit, quantity]) => `${quantity.toLocaleString()} ${unit}`)
    .join(" · ");
}

function operationKeyForGroup(group: DailyWorkActivityData["details"][number]): string {
  const log = group.logs[0];
  if (!log) return "process";
  if (log.shipping_phase === "COMPONENT_CHANGE") return "item_conversion";
  if (log.shipping_phase === "PREPARE" || log.shipping_phase === "PICKUP") return "shipping";
  if (["RECEIVE", "TRANSFER_TO_PROD", "TRANSFER_TO_WH", "INTERNAL_USE"].includes(log.transaction_type)) return "warehouse";
  if (["MARK_DEFECTIVE", "UNMARK_DEFECTIVE", "DEFECT_SCRAP", "SUPPLIER_RETURN"].includes(log.transaction_type)) return "defect";
  return "process";
}

export function DailyWorkActivity({ activity }: { activity: DailyWorkActivityData }) {
  const [openOperation, setOpenOperation] = useState<string | null>(null);

  return (
    <section className="rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black">오늘의 거래 활동</h2>
          <p className="mt-1 text-sm font-medium" style={{ color: LEGACY_COLORS.muted2 }}>
            거래 기록을 작업 종류별로 요약했습니다.
          </p>
        </div>
        {activity.cancelled_count > 0 && (
          <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ color: LEGACY_COLORS.red, background: `color-mix(in srgb, ${LEGACY_COLORS.red} 12%, transparent)` }}>
            취소 {activity.cancelled_count}건
          </span>
        )}
      </div>

      {activity.summary.length === 0 ? (
        <p className="mt-4 text-sm font-medium" style={{ color: LEGACY_COLORS.muted2 }}>표시할 거래 활동이 없습니다.</p>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {activity.summary.map((summary) => (
            <button key={summary.operation_key} type="button" onClick={() => setOpenOperation((current) => current === summary.operation_key ? null : summary.operation_key)} aria-label={`${summary.operation_label} 거래 상세 ${openOperation === summary.operation_key ? "접기" : "펼치기"}`} className="rounded-[16px] border px-3 py-2.5 text-left transition active:scale-[0.98]" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-black">{summary.operation_label}</span>
                <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.blue }}>{summary.work_count}건</span>
              </div>
              <p className="mt-1 text-sm font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                {formatQuantities(summary.quantity_by_unit)}
              </p>
            </button>
          ))}
        </div>
      )}

      {openOperation && activity.details.length > 0 && (
        <div className="mt-4 border-t pt-3" style={{ borderColor: LEGACY_COLORS.border }}>
          <button
            type="button"
            onClick={() => setOpenOperation(null)}
            aria-label="거래 상세 접기"
            className="flex min-h-11 items-center gap-2 rounded-[12px] px-2 text-sm font-bold transition active:scale-[0.98]"
            style={{ color: LEGACY_COLORS.text }}
          >
            <ChevronDown className="h-4 w-4" />
            거래 상세
          </button>
          <div className="mt-2 space-y-2">
              {activity.details.filter((group) => operationKeyForGroup(group) === openOperation).map((group) => (
                <div key={group.key} className="rounded-[14px] border px-3 py-2" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <ClipboardList className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
                    {group.logs.length}건 거래
                  </div>
                  <ul className="mt-1 space-y-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                    {group.logs.map((log) => (
                      <li key={log.log_id}>{log.item_name || log.transaction_type}</li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </div>
      )}
    </section>
  );
}
