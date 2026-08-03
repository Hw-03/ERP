"use client";

import { ChevronDown, ChevronRight, ClipboardList, Factory, PackageCheck, RotateCcw, Truck, Warehouse } from "lucide-react";
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

function OperationIcon({ operationKey }: { operationKey: string }) {
  const className = "h-4 w-4";
  if (operationKey === "warehouse") return <Warehouse className={className} />;
  if (operationKey === "shipping") return <Truck className={className} />;
  if (operationKey === "defect") return <RotateCcw className={className} />;
  if (operationKey === "item_conversion") return <PackageCheck className={className} />;
  return <Factory className={className} />;
}

export function DailyWorkActivity({ activity }: { activity: DailyWorkActivityData }) {
  const [openOperation, setOpenOperation] = useState<string | null>(null);

  return (
    <section className="rounded-[20px] border p-4 lg:p-5" aria-labelledby="daily-work-activity-title" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s2 }}>
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <h2 id="daily-work-activity-title" className="text-lg font-black">MES 거래 요약</h2>
          </div>
        </div>
        {activity.cancelled_count > 0 && (
          <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-black" style={{ color: LEGACY_COLORS.red, background: LEGACY_COLORS.errorBg }}>
            취소 {activity.cancelled_count}건
          </span>
        )}
      </div>

      {activity.summary.length === 0 ? (
        <div className="mt-3 rounded-[14px] border px-3.5 py-3 text-sm font-medium" style={{ color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
          완료된 MES 거래가 생기면 작업 종류와 수량이 이곳에 자동으로 나타납니다.
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {activity.summary.map((summary) => {
            const isOpen = openOperation === summary.operation_key;
            return (
              <button key={summary.operation_key} type="button" onClick={() => setOpenOperation((current) => current === summary.operation_key ? null : summary.operation_key)} aria-label={`${summary.operation_label} 거래 상세 ${isOpen ? "접기" : "펼치기"}`} className="flex min-h-11 items-center gap-2 rounded-[14px] border px-3 text-left transition active:scale-[0.98]" style={{ background: isOpen ? LEGACY_COLORS.s3 : LEGACY_COLORS.s2, borderColor: isOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.border }}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px]" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s1 }}><OperationIcon operationKey={summary.operation_key} /></span>
                <span className="text-sm font-black">{summary.operation_label}</span>
                <span className="text-sm font-black" style={{ color: LEGACY_COLORS.blue }}>{summary.work_count}건</span>
                <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{formatQuantities(summary.quantity_by_unit) || "수량 정보 없음"}</span>
                <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} style={{ color: LEGACY_COLORS.blue }} />
              </button>
            );
          })}
        </div>
      )}

      {openOperation && activity.details.length > 0 && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: LEGACY_COLORS.border }}>
          <button
            type="button"
            onClick={() => setOpenOperation(null)}
            aria-label="거래 상세 접기"
            className="flex min-h-11 items-center gap-2 rounded-[12px] px-2 text-sm font-black transition active:scale-[0.98]"
            style={{ color: LEGACY_COLORS.text }}
          >
            <ChevronDown className="h-4 w-4" />
            거래 상세
          </button>
          <div className="mt-2 space-y-2">
            {activity.details.filter((group) => operationKeyForGroup(group) === openOperation).map((group) => (
              <div key={group.key} className="rounded-[14px] border px-3.5 py-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                <div className="flex items-center gap-2 text-sm font-black">
                  <span className="flex h-7 w-7 items-center justify-center rounded-[10px]" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s1 }}><ClipboardList className="h-4 w-4" /></span>
                  {group.logs.length}건 거래
                </div>
                <ul className="mt-2 space-y-1.5 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
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
