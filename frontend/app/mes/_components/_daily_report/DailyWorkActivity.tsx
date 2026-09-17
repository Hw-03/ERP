"use client";

import { ArrowRight, ChevronRight, ClipboardList, Clock3, Factory, PackageCheck, RotateCcw, Truck, UserRound, Warehouse } from "lucide-react";
import { useState } from "react";
import type { DailyWorkActivity as DailyWorkActivityData } from "@/lib/api/types/daily-work-reports";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TruncatedText } from "@/lib/ui/TruncatedText";
import { formatHistoryDateTimeLong } from "../_history_sections/historyFormat";
import { buildHistoryDetailSummary, type HistoryDetailSummaryTone } from "../_history_sections/historyDetailSummary";

const STATUS_COLORS: Record<HistoryDetailSummaryTone, string> = {
  success: LEGACY_COLORS.green,
  warning: LEGACY_COLORS.yellow,
  danger: LEGACY_COLORS.red,
  muted: LEGACY_COLORS.muted2,
};

function formatQuantities(quantities: Record<string, number>): string {
  return Object.entries(quantities)
    .map(([unit, quantity]) => `${quantity.toLocaleString()} ${unit}`)
    .join(" · ");
}

function StockChange({
  before,
  after,
  delta,
  unit,
}: {
  before?: number;
  after?: number;
  delta: number;
  unit: string;
}) {
  const hasSnapshot = before != null && after != null;
  const unitSuffix = unit ? ` ${unit}` : "";
  const directionLabel = delta > 0 ? "증가" : delta < 0 ? "감소" : "변동 없음";
  const changeLabel = delta === 0
    ? directionLabel
    : `${Math.abs(delta).toLocaleString()}${unitSuffix} ${directionLabel}`;
  const changeColor = delta > 0 ? LEGACY_COLORS.green : delta < 0 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2;
  const changeBackground = delta > 0 ? LEGACY_COLORS.successBg : delta < 0 ? LEGACY_COLORS.errorBg : LEGACY_COLORS.s2;
  return (
    <span className="flex shrink-0 items-center gap-2">
      {hasSnapshot && (
        <span className="whitespace-nowrap text-sm font-bold tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>
          재고 {before.toLocaleString()}{unitSuffix} → {after.toLocaleString()}{unitSuffix}
        </span>
      )}
      <strong className="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black tabular-nums" style={{ color: changeColor, background: changeBackground }}>
        {changeLabel}
      </strong>
    </span>
  );
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

function DailyWorkActivityDetail({ group }: { group: DailyWorkActivityData["details"][number] }) {
  const historySummary = buildHistoryDetailSummary(group.logs, null);
  const impacts = historySummary.impactGroups.flatMap((impactGroup) => impactGroup.effects);
  const from = impacts.find((impact) => impact.delta < 0)?.label.replace(/ 재고$/, "");
  const to = impacts.find((impact) => impact.delta > 0)?.label.replace(/ 재고$/, "");
  const summary = from && to && from !== to
    ? { ...historySummary, flow: { label: `${from} → ${to}`, from, to } }
    : historySummary;
  const impactMidpoint = Math.ceil(impacts.length / 2);
  const impactColumns = impacts.length > 1
    ? [impacts.slice(0, impactMidpoint), impacts.slice(impactMidpoint)]
    : [impacts];
  const hasMultipleItems = new Set(impacts.map((impact) => impact.itemId)).size > 1;
  const stockSectionLabel = impacts.some((impact) => impact.delta < 0)
    && impacts.some((impact) => impact.delta > 0)
    ? "재고 이동"
    : "재고 반영";
  const statusColor = STATUS_COLORS[summary.status.tone];

  return (
    <article
      data-testid="daily-work-activity-card"
      className={`grid grid-cols-1 overflow-hidden rounded-[14px] border ${impacts.length > 0 ? "lg:grid-cols-[minmax(250px,1fr)_minmax(230px,0.8fr)_minmax(360px,1.6fr)]" : "lg:grid-cols-[minmax(250px,1fr)_minmax(300px,2fr)]"}`}
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div data-testid="daily-work-activity-primary" className="flex items-center gap-3 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s1 }}>
          <ClipboardList className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <TruncatedText className="truncate text-sm font-black" accessibilityLabel={summary.target.itemName}>
            {summary.target.itemName}
          </TruncatedText>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>
            {summary.target.mesCode && <span>{summary.target.mesCode}</span>}
            {summary.target.mesCode && <span aria-hidden="true">·</span>}
            <span>{summary.operationLabel}</span>
            {group.logs.length > 1 && <><span aria-hidden="true">·</span><span>{group.logs.length}건</span></>}
          </div>
        </div>
        <span
          data-testid="daily-work-activity-status"
          className="flex h-7 w-16 shrink-0 items-center justify-center whitespace-nowrap rounded-full text-xs font-bold leading-none"
          style={{ color: statusColor, background: `color-mix(in srgb, ${statusColor} 14%, transparent)` }}
        >
          {summary.status.label}
        </span>
      </div>

      <div data-testid="daily-work-activity-meta" className="flex flex-col justify-center gap-1.5 border-t px-4 py-3 text-xs lg:border-l lg:border-t-0" style={{ color: LEGACY_COLORS.muted2, borderColor: LEGACY_COLORS.border }}>
        <span className="flex min-w-0 items-center gap-1.5"><UserRound className="h-3.5 w-3.5 shrink-0" />{summary.requester.label} <strong style={{ color: LEGACY_COLORS.text }}>{summary.requester.name}</strong></span>
        <span className="flex min-w-0 items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 shrink-0" />{formatHistoryDateTimeLong(summary.requester.at)}</span>
        {(impacts.length === 0 || hasMultipleItems) && summary.flow && (
          <span className="flex min-w-0 items-center gap-1.5 font-bold" style={{ color: LEGACY_COLORS.text }}>
            {summary.flow.from && summary.flow.to && summary.flow.from !== summary.flow.to ? (
              <>{summary.flow.from}<ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />{summary.flow.to}</>
            ) : summary.flow.label}
          </span>
        )}
        {summary.conversion && (
          <span className="flex min-w-0 items-center gap-1.5 font-bold" style={{ color: LEGACY_COLORS.text }}>
            <PackageCheck className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
            <span className="truncate">{summary.conversion.source.itemName}</span><ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} /><span className="truncate">{summary.conversion.target.itemName}</span>
          </span>
        )}
      </div>

      {impacts.length > 0 && (
        <div className="flex flex-col justify-center border-t px-4 py-3 lg:border-l lg:border-t-0" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
          <div className={`${hasMultipleItems ? "mb-2" : "mb-1.5"} flex items-center justify-between gap-3 text-xs font-bold`} style={{ color: LEGACY_COLORS.muted2 }}>
            <span>{stockSectionLabel}</span>
            {hasMultipleItems && <span>{impacts.length}개 항목</span>}
          </div>
          {hasMultipleItems ? (
            <div data-testid="daily-work-activity-impacts" className="grid grid-cols-1 gap-x-5 lg:grid-cols-2">
              {impactColumns.map((column, columnIndex) => (
                <div key={columnIndex}>
                  {column.map((impact) => {
                    return (
                      <div key={impact.key} className="flex min-h-11 items-center justify-between gap-3 border-t py-2 first:border-t-0" style={{ borderColor: LEGACY_COLORS.border }}>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {impact.role && <span className="shrink-0 text-xs font-bold" style={{ color: LEGACY_COLORS.blue }}>{impact.role}</span>}
                            <TruncatedText className="truncate text-sm font-bold" accessibilityLabel={impact.itemName}>
                              {impact.itemName}
                            </TruncatedText>
                          </div>
                          <p className="truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{impact.label.replace(/ 재고$/, "")}</p>
                        </div>
                        <StockChange
                          before={impact.quantityBefore}
                          after={impact.quantityAfter}
                          delta={impact.delta}
                          unit={impact.unit}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div data-testid="daily-work-activity-stock-flow" className="flex w-full flex-wrap items-center gap-2">
              {impacts.map((impact, index) => {
                return (
                  <div key={impact.key} className="flex min-w-[170px] flex-1 items-center gap-2">
                    {index > 0 && <ArrowRight className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />}
                    <span className="flex min-h-9 min-w-0 flex-1 items-center justify-between gap-3 rounded-[10px] border px-3 text-sm font-bold" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                      <span className="truncate">{impact.label.replace(/ 재고$/, "")}</span>
                      <StockChange
                        before={impact.quantityBefore}
                        after={impact.quantityAfter}
                        delta={impact.delta}
                        unit={impact.unit}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {summary.status.reason && (
        <div className="border-t px-3.5 py-2 text-xs lg:col-span-full" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.red }}>
          <strong>취소 사유</strong><span className="ml-2">{summary.status.reason}</span>
        </div>
      )}
    </article>
  );
}

export function DailyWorkActivity({ activity, onDetailOpenChange }: { activity: DailyWorkActivityData; onDetailOpenChange?: (isOpen: boolean) => void }) {
  const [openOperation, setOpenOperation] = useState<string | null>(null);

  return (
    <section className="rounded-[20px] border p-4 lg:shrink-0 lg:px-5 lg:py-4" aria-labelledby="daily-work-activity-title" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <div className="flex min-h-11 flex-wrap items-center gap-2 sm:flex-nowrap">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s2 }}>
          <ClipboardList className="h-5 w-5" />
        </span>
        <h2 id="daily-work-activity-title" className="shrink-0 whitespace-nowrap text-lg font-black">MES 작업 기록</h2>
        {activity.summary.map((summary) => {
          const isOpen = openOperation === summary.operation_key;
          return (
            <button
              key={summary.operation_key}
              type="button"
              onClick={() => {
                const next = isOpen ? null : summary.operation_key;
                setOpenOperation(next);
                onDetailOpenChange?.(next !== null);
              }}
              aria-label={`${summary.operation_label} 거래 상세 ${isOpen ? "접기" : "펼치기"}`}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-[14px] border px-3 text-left transition active:scale-[0.98]"
              style={{ background: isOpen ? LEGACY_COLORS.s3 : LEGACY_COLORS.s2, borderColor: isOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.border }}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px]" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s1 }}><OperationIcon operationKey={summary.operation_key} /></span>
              <span className="whitespace-nowrap text-sm font-black">{summary.operation_label}</span>
              <span className="whitespace-nowrap text-sm font-black" style={{ color: LEGACY_COLORS.blue }}>{summary.work_count}건</span>
              <span className="whitespace-nowrap text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{formatQuantities(summary.quantity_by_unit) || "수량 정보 없음"}</span>
              <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} style={{ color: LEGACY_COLORS.blue }} />
            </button>
          );
        })}
        {activity.cancelled_count > 0 && (
          <span className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black" style={{ color: LEGACY_COLORS.red, background: LEGACY_COLORS.errorBg }}>
            취소 {activity.cancelled_count}건
          </span>
        )}
      </div>

      {activity.summary.length === 0 && (
        <div className="mt-3 rounded-[14px] border px-3.5 py-3 text-sm font-medium" style={{ color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
          완료된 MES 거래가 생기면 작업 종류와 수량이 이곳에 자동으로 나타납니다.
        </div>
      )}

      {openOperation && activity.details.length > 0 && (
        <div data-testid="daily-work-activity-details" className="mt-2 space-y-2">
          {activity.details.filter((group) => operationKeyForGroup(group) === openOperation).map((group) => (
            <DailyWorkActivityDetail key={group.key} group={group} />
          ))}
        </div>
      )}
    </section>
  );
}
