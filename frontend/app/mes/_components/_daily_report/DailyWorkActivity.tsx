"use client";

import { ArrowRight, ChevronRight, ClipboardList, Clock3, Factory, PackageCheck, RotateCcw, Truck, UserRound, Warehouse } from "lucide-react";
import { useEffect, useState } from "react";
import type { TransactionLog } from "@/lib/api";
import { productionApi } from "@/lib/api/production";
import { useDesktopTabHome } from "../DesktopTabHome";
import type { DailyWorkActivity as DailyWorkActivityData } from "@/lib/api/types/daily-work-reports";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TruncatedText } from "@/lib/ui/TruncatedText";
import { formatHistoryDateTimeLong } from "../_history_sections/historyFormat";
import { buildHistoryDetailSummary, type HistoryDetailSummaryTone } from "../_history_sections/historyDetailSummary";
import { getHistoryListOperationLabel } from "../_history_sections/historyPresentation";
import { HistoryDetailPanel } from "../_history_sections/HistoryDetailPanel";

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
  if (!log.history_batch && log.reference_no?.startsWith("defect-disassemble:")) return "defect";
  if (log.shipping_phase === "COMPONENT_CHANGE") return "item_conversion";
  if (log.shipping_phase === "PREPARE" || log.shipping_phase === "PICKUP") return "shipping";
  const subType = log.history_batch?.sub_type;
  if (["tube_receive_supplier", "tube_outbound_supplier"].includes(subType ?? "")) return "tube_material";
  if (["produce", "disassemble", "dept_transfer", "adjust_in", "adjust_out"].includes(subType ?? "")) return "process";
  if (["warehouse_adjust_in", "warehouse_adjust_out", "warehouse_to_dept", "dept_to_warehouse", "receive_supplier", "internal_use_out"].includes(subType ?? "")) return "warehouse";
  if (["supplier_return", "defect_quarantine", "defect_restore", "defect_process"].includes(subType ?? "")) return "defect";
  if (log.transaction_type === "SHIP") return "shipping";
  if (["RECEIVE", "TRANSFER_TO_PROD", "TRANSFER_TO_WH", "INTERNAL_USE", "MATERIAL_OUT"].includes(log.transaction_type)) return "warehouse";
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

/** 기존 이력 상세를 재사용하되 연결된 원행만 정확 조회하고 취소는 허용하지 않는다. */
function DailyOriginalWork({ log }: { log: TransactionLog }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<TransactionLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !log.reverses_log_id) return;
    const controller = new AbortController();
    setSelected(null); setError(null); setLoadedFor(null);
    void productionApi.getTransactions({ logId: log.reverses_log_id, includeArchived: true }, { signal: controller.signal }).then((logs) => {
      if (controller.signal.aborted) return;
      const original = logs.find((entry) => entry.log_id === log.reverses_log_id);
      setSelected(original ?? null);
      setError(original ? null : "원래 작업을 찾을 수 없습니다.");
      setLoadedFor(log.log_id);
    }).catch(() => {
      if (controller.signal.aborted) return;
      setError("원래 작업을 불러오지 못했습니다."); setLoadedFor(log.log_id);
    });
    return () => controller.abort();
  }, [open, log.log_id, log.reverses_log_id, retry]);
  if (!log.reverses_log_id) return null;
  const ready = loadedFor === log.log_id;
  return <div className="border-t px-4 py-3 lg:col-span-full" style={{ borderColor: LEGACY_COLORS.border }}>
    <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="min-h-11 rounded-[10px] border px-3 text-sm font-bold" style={{ borderColor: LEGACY_COLORS.border }}>{open ? "원래 작업 접기" : "원래 작업 보기"}</button>
    {open && <div className="mt-3" role="region" aria-label="원래 작업 상세">
      {!ready && <p role="status">원래 작업을 불러오는 중입니다.</p>}
      {ready && error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="min-h-11 px-3 text-sm font-bold">원래 작업 다시 시도</button></div>}
      {ready && selected && <HistoryDetailPanel panelOpen selected={selected} allowCancellation={false} onSelectLog={setSelected} onLogUpdated={setSelected} />}
    </div>}
  </div>;
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
  const primary = group.logs[0];
  const operationLabel = primary?.transaction_type === "ADJUST"
    ? getHistoryListOperationLabel(primary)
    : summary.operationLabel;
  const approver = group.logs.find((log) => log.approver_name?.trim()
    && log.operation_kind !== "CANCELLATION" && log.operation_effective_status !== "cancellation");
  const notes = [...new Set(group.logs.map((log) => log.notes?.trim()).filter((note) => note && note !== summary.status.reason))];

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
            <span>{operationLabel}</span>
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
        {approver && <>
          <span className="flex min-w-0 items-center gap-1.5"><UserRound className="h-3.5 w-3.5 shrink-0" />승인자 <strong style={{ color: LEGACY_COLORS.text }}>{approver.approver_name}</strong></span>
          <span className="flex min-w-0 items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 shrink-0" />{formatHistoryDateTimeLong(approver.approved_at ?? approver.created_at)}</span>
        </>}
        {(impacts.length === 0 || hasMultipleItems || group.logs.some((log) => log.operation_kind === "CANCELLATION")) && summary.flow && (
          <span data-testid="daily-work-activity-direction" aria-label={summary.flow.label} className="flex min-w-0 items-center gap-1.5 font-bold" style={{ color: LEGACY_COLORS.text }}>
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

      {notes.length > 0 && (
        <div className="border-t px-3.5 py-2 text-xs lg:col-span-full" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
          <strong>메모</strong><span className="ml-2 whitespace-pre-wrap">{notes.join(" · ")}</span>
        </div>
      )}
      {summary.status.reason && (
        <div className="border-t px-3.5 py-2 text-xs lg:col-span-full" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.red }}>
          <strong>취소 사유</strong><span className="ml-2">{summary.status.reason}</span>
        </div>
      )}
      {group.logs[0] && <DailyOriginalWork log={group.logs[0]} />}
    </article>
  );
}

export function DailyWorkActivity({ activity, onDetailOpenChange, loading = false, mobile = false }: { activity?: DailyWorkActivityData; onDetailOpenChange?: (isOpen: boolean) => void; loading?: boolean; mobile?: boolean }) {
  const [openOperation, setOpenOperation] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const workCount = activity?.summary.reduce((total, summary) => total + summary.work_count, 0) ?? 0;
  const cancelledCount = activity?.cancelled_count ?? 0;
  const summaries = [...(activity?.summary ?? [])];
  const labels: Record<string, string> = { warehouse: "창고", tube_material: "튜브 원자재", process: "공정", defect: "불량", shipping: "출하", item_conversion: "구성품 전환" };
  for (const group of activity?.details ?? []) {
    if (group.logs.length === 0) continue;
    const key = operationKeyForGroup(group);
    if (!summaries.some((summary) => summary.operation_key === key)) summaries.push({ operation_key: key, operation_label: labels[key], work_count: 0, quantity_by_unit: {} });
  }
  const countLabel = workCount > 0 ? `${workCount}건${cancelledCount > 0 ? ` · 취소 ${cancelledCount}건` : ""}` : `취소 ${cancelledCount}건`;
  useDesktopTabHome("daily-work-activity", {
    isHome: openOperation === null && (!mobile || !mobileExpanded),
    preservesDraft: true,
    returnHome: () => { setOpenOperation(null); setMobileExpanded(false); onDetailOpenChange?.(false); },
  });

  return (
    <section className={mobile ? "rounded-[20px] border p-3" : "rounded-[20px] border p-4 lg:shrink-0 lg:px-5 lg:py-4"} aria-labelledby="daily-work-activity-title" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <div className={mobile ? "flex min-h-11 flex-wrap items-center gap-2" : "flex min-h-11 flex-wrap items-center gap-2 sm:flex-nowrap"}>
        <span className={mobile ? "hidden" : "flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]"} style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s2 }}>
          <ClipboardList className="h-5 w-5" />
        </span>
        {mobile && !loading && (workCount > 0 || cancelledCount > 0) ? <button type="button" aria-label={`MES 작업 기록 ${countLabel} ${mobileExpanded ? "접기" : "펼치기"}`} aria-expanded={mobileExpanded} onClick={() => {
          const next = !mobileExpanded;
          setMobileExpanded(next);
          if (!next) setOpenOperation(null);
          onDetailOpenChange?.(next);
        }} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[12px] px-2 text-left transition active:scale-[0.98]" style={{ background: LEGACY_COLORS.s2 }}>
          <h2 id="daily-work-activity-title" className="text-[15px] font-semibold">MES 작업 기록</h2>
          <span className="ml-auto text-sm font-black" style={{ color: LEGACY_COLORS.blue }}>{countLabel}</span>
          <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${mobileExpanded ? "rotate-90" : ""}`} style={{ color: LEGACY_COLORS.blue }} />
        </button> : <h2 id="daily-work-activity-title" className={mobile ? "text-[15px] font-semibold" : "shrink-0 whitespace-nowrap text-lg font-black"}>MES 작업 기록</h2>}
        {loading && <span data-testid="daily-report-activity-skeleton" aria-label="MES 작업 기록 불러오는 중" role="status" className={`${mobile ? "h-8" : "h-11"} min-w-0 flex-1 motion-safe:animate-pulse rounded-[14px]`} style={{ background: LEGACY_COLORS.s2 }} />}
        {mobile && !loading && workCount === 0 && cancelledCount === 0 && <span className="ml-auto text-sm font-medium" style={{ color: LEGACY_COLORS.muted2 }}>작업 기록이 없습니다.</span>}
        {(!mobile || mobileExpanded) && summaries.map((summary) => {
          const isOpen = openOperation === summary.operation_key;
          return (
            <button
              key={summary.operation_key}
              type="button"
              onClick={() => {
                const next = isOpen ? null : summary.operation_key;
                setOpenOperation(next);
                onDetailOpenChange?.(mobile ? mobileExpanded : next !== null);
              }}
              aria-label={`${summary.operation_label} 거래 상세 ${isOpen ? "접기" : "펼치기"}`}
              className={mobile ? "flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-[12px] border px-3 py-2 text-left" : "flex min-h-11 shrink-0 items-center gap-1.5 rounded-[14px] border px-3 text-left transition active:scale-[0.98]"}
              style={{ background: isOpen ? LEGACY_COLORS.s3 : LEGACY_COLORS.s2, borderColor: isOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.border }}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px]" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s1 }}><OperationIcon operationKey={summary.operation_key} /></span>
              <span className="whitespace-nowrap text-sm font-black">{summary.operation_label}</span>
              <span className="whitespace-nowrap text-sm font-black" style={{ color: LEGACY_COLORS.blue }}>{summary.work_count}건</span>
              <span className={mobile ? "min-w-0 text-xs [overflow-wrap:anywhere]" : "whitespace-nowrap text-xs font-bold"} style={{ color: LEGACY_COLORS.muted2 }}>{formatQuantities(summary.quantity_by_unit) || (summary.work_count === 0 ? "취소 기록" : "수량 정보 없음")}</span>
              <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} style={{ color: LEGACY_COLORS.blue }} />
            </button>
          );
        })}
        {activity && activity.cancelled_count > 0 && (!mobile || mobileExpanded) && (
          <span className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black" style={{ color: LEGACY_COLORS.red, background: LEGACY_COLORS.errorBg }}>
            취소 {activity.cancelled_count}건
          </span>
        )}
      </div>

      {activity && !loading && (!mobile || mobileExpanded) && <p className="mt-2 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>수량은 취소된 작업을 제외한 완료 작업 합계입니다.</p>}
      {activity && !loading && (!mobile || mobileExpanded) && <p className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>일보 작성 여부와 관계없이 해당 직원의 MES 작업을 표시합니다.</p>}

      {!mobile && (loading || activity?.summary.length === 0) && (
        <div className={mobile && !loading ? "mt-2 text-center text-sm font-medium" : "mt-3 rounded-[14px] border px-3.5 py-3 text-sm font-medium"} style={mobile && !loading ? { color: LEGACY_COLORS.muted2 } : { color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
          {loading ? <span aria-hidden="true" className="block h-5 w-2/3 rounded motion-safe:animate-pulse" style={{ background: LEGACY_COLORS.s3 }} /> : mobile ? "작업 기록이 없습니다." : "완료된 MES 거래가 생기면 작업 종류와 수량이 이곳에 자동으로 나타납니다."}
        </div>
      )}

      {openOperation && activity && activity.details.length > 0 && (
        <div data-testid="daily-work-activity-details" className="mt-2 space-y-2">
          {activity.details.filter((group) => operationKeyForGroup(group) === openOperation).map((group) => (
            <DailyWorkActivityDetail key={group.key} group={group} />
          ))}
        </div>
      )}
    </section>
  );
}
