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
    <section className="rounded-[20px] border p-4 lg:p-5" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, boxShadow: "var(--c-card-shadow)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s2 }}>
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-black tracking-[0.08em]" style={{ color: LEGACY_COLORS.blue }}>MES ACTIVITY</p>
            <h2 className="mt-0.5 text-lg font-black">오늘의 거래 활동</h2>
            <p className="mt-1 text-sm font-medium" style={{ color: LEGACY_COLORS.muted2 }}>실제 처리된 MES 거래를 작업 종류별로 모았습니다.</p>
          </div>
        </div>
        {activity.cancelled_count > 0 && (
          <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-black" style={{ color: LEGACY_COLORS.red, background: LEGACY_COLORS.errorBg }}>
            취소 {activity.cancelled_count}건
          </span>
        )}
      </div>

      {activity.summary.length === 0 ? (
        <div className="mt-5 rounded-[16px] border px-4 py-6 text-center" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
          <ClipboardList className="mx-auto h-6 w-6" style={{ color: LEGACY_COLORS.muted2 }} />
          <p className="mt-2 text-sm font-bold">표시할 거래 활동이 없습니다.</p>
          <p className="mt-1 text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>완료된 입출고·생산·출하 거래가 생기면 이곳에 자동으로 나타납니다.</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {activity.summary.map((summary) => {
            const isOpen = openOperation === summary.operation_key;
            return (
              <button key={summary.operation_key} type="button" onClick={() => setOpenOperation((current) => current === summary.operation_key ? null : summary.operation_key)} aria-label={`${summary.operation_label} 거래 상세 ${isOpen ? "접기" : "펼치기"}`} className="rounded-[16px] border px-3.5 py-3 text-left transition active:scale-[0.98]" style={{ background: isOpen ? LEGACY_COLORS.s3 : LEGACY_COLORS.s2, borderColor: isOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.border }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-black">
                    <span className="flex h-7 w-7 items-center justify-center rounded-[10px]" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s1 }}><OperationIcon operationKey={summary.operation_key} /></span>
                    {summary.operation_label}
                  </span>
                  <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} style={{ color: LEGACY_COLORS.blue }} />
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <span className="text-xl font-black" style={{ color: LEGACY_COLORS.blue }}>{summary.work_count}<span className="ml-0.5 text-xs">건</span></span>
                  <span className="text-right text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{formatQuantities(summary.quantity_by_unit) || "수량 정보 없음"}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {openOperation && activity.details.length > 0 && (
        <div className="mt-5 border-t pt-3" style={{ borderColor: LEGACY_COLORS.border }}>
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
