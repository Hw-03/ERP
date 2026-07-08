"use client";

import { useState } from "react";
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine,
  BookmarkMinus, BookmarkPlus, ChevronDown, ChevronRight, Hammer, Layers,
  Package, PackageX, Recycle, ShieldAlert, Sliders, Trash2, Undo2, Wrench,
} from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import type { HistoryPresentationTone, HistoryRowPresentation } from "./historyPresentation";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { transactionColor, transactionIconName } from "@/lib/mes-status";
import {
  describeBatchFlow,
  getHistoryActor,
  getHistoryDisplayLabel,
  getHistoryMovementSummary,
  parseTransactionNotes,
  type MovementSummary,
  type MovementTone,
} from "./historyBatchInterpreter";
import { isReworkOperation } from "./transactionTaxonomy";
import { getHistoryRowPresentation, getReferenceBatchLinePresentation, getReferenceBatchPresentation, getShippingPhaseFlowLabel } from "./historyPresentation";
import { formatHistoryDate } from "./historyFormat";

const TX_ICON = {
  ArrowDownToLine, ArrowUpFromLine, Sliders, Hammer, Recycle, Trash2,
  AlertCircle, Wrench, Undo2, BookmarkPlus, BookmarkMinus, ArrowRightLeft,
  ShieldAlert, PackageX, Activity,
} as const;

/**
 * 우측 SlidePanel(160ms width transition)에 맞춰 셀 width/padding 변경을 부드럽게.
 * 평상시 ↔ 우측 패널 열림 시 일시/구분/품목명 컬럼이 jump 없이 따라간다.
 */
export const HISTORY_CELL_TRANSITION =
  "padding 160ms cubic-bezier(0.4, 0, 0.2, 1), width 160ms cubic-bezier(0.4, 0, 0.2, 1)";

export function FlowBadge({
  type,
  label,
  color,
}: {
  type: TransactionLog["transaction_type"] | null;
  label: string;
  color: string;
}) {
  const Icon = type ? TX_ICON[transactionIconName(type)] : null;
  return (
    <span
      className="inline-flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-bold tracking-wide"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

export const TONE_COLOR: Record<MovementTone, string> = {
  primary: LEGACY_COLORS.blue,
  success: LEGACY_COLORS.green,
  info: LEGACY_COLORS.cyan,
  warning: LEGACY_COLORS.yellow,
  danger: LEGACY_COLORS.red,
  muted: LEGACY_COLORS.muted2,
};

export function MovementSummaryCell({ summary }: { summary: MovementSummary }) {
  // 셀에 알약 1개(단건/묶음요약) → 큰 패딩·자간·큰 통일 폭으로 강조.
  // 알약 2개(BOM 상위/하위 짝) → 좁은 패딩·작은 통일 폭(둘이 한 셀에 들어가야 함).
  // 글자 크기는 모든 알약 동일(text-xs). 3자리 부호 포함 기준 폭, 4자리+ 자연 확장.
  const isSingle = summary.parts.length === 1 && !summary.warning;
  const pillClass = isSingle
    ? "inline-flex min-w-[10.5rem] justify-center rounded-full px-3 py-1 text-xs font-bold tracking-wide"
    : "inline-flex min-w-[5rem] justify-center rounded-full px-2 py-0.5 text-xs font-bold";
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {summary.parts.map((p, i) => {
        const color = TONE_COLOR[p.tone];
        return (
          <span
            key={i}
            className={pillClass}
            style={{
              // WCAG AA: 연한 틴트 위 brand 컬러 텍스트는 4.5:1 미달 →
              // 같은 색조를 text 색과 섞어 어둡게(색 코딩 유지 + 대비 확보).
              background: `color-mix(in srgb, ${color} 18%, transparent)`,
              color: `color-mix(in srgb, ${color} 42%, ${LEGACY_COLORS.text})`,
            }}
          >
            {p.label}
          </span>
        );
      })}
      {summary.warning && (
        <span
          className="inline-flex rounded-full px-2 py-0.5 text-xs font-bold"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 20%, transparent)`,
            color: `color-mix(in srgb, ${LEGACY_COLORS.red} 42%, ${LEGACY_COLORS.text})`,
          }}
        >
          {summary.warning}
        </span>
      )}
    </span>
  );
}

const PRESENTATION_TONE_COLOR: Record<HistoryPresentationTone, string> = {
  primary: LEGACY_COLORS.blue,
  success: LEGACY_COLORS.green,
  info: LEGACY_COLORS.cyan,
  warning: LEGACY_COLORS.yellow,
  danger: LEGACY_COLORS.red,
  muted: LEGACY_COLORS.muted2,
};

export function StatusChipStrip({ presentation }: { presentation: HistoryRowPresentation }) {
  if (presentation.statusChips.length === 0) {
    return <span className="min-h-4" aria-label="상태 없음" />;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {presentation.statusChips.map((chip) => {
        const color = PRESENTATION_TONE_COLOR[chip.tone];
        return (
          <span
            key={`${chip.label}-${chip.title ?? ""}`}
            title={chip.title}
            className="inline-flex rounded-full px-2 py-0.5 text-xs font-bold"
            style={{
              background: `color-mix(in srgb, ${color} 14%, transparent)`,
              color: `color-mix(in srgb, ${color} 48%, ${LEGACY_COLORS.text})`,
            }}
          >
            {chip.label}
          </span>
        );
      })}
    </div>
  );
}

export function TargetSummaryBlock({
  presentation,
  icon,
  titleOverride,
  metaOverride,
}: {
  presentation: HistoryRowPresentation;
  icon: React.ReactNode;
  titleOverride?: string;
  metaOverride?: string[];
}) {
  const meta = metaOverride ?? presentation.target.meta;
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        {icon}
        <span className="line-clamp-2 min-w-0 break-words text-sm font-bold leading-snug" style={{ color: LEGACY_COLORS.text }}>
          {titleOverride ?? presentation.target.title}
        </span>
      </div>
      {meta.length > 0 && (
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {meta.map((part) => (
            <span key={part} className="font-semibold">
              {part}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ItemCodeCell({
  code,
  compact,
  dense = false,
}: {
  code?: string | null;
  compact?: boolean;
  dense?: boolean;
}) {
  const padX = compact ? "px-2" : "px-3";
  const py = dense ? "py-1.5" : "py-3";
  return (
    <td
      className={`whitespace-nowrap border-b ${padX} ${py} text-center text-xs font-semibold`}
      style={{ borderColor: LEGACY_COLORS.border, color: code ? LEGACY_COLORS.muted2 : LEGACY_COLORS.muted, transition: HISTORY_CELL_TRANSITION }}
    >
      {code || "-"}
    </td>
  );
}

export function SpacerCell({ compact, dense = false }: { compact?: boolean; dense?: boolean }) {
  const py = dense ? "py-1.5" : "py-3";
  return (
    <td
      aria-hidden
      className={`${compact ? "px-1" : "px-2"} ${py} border-b`}
      style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}
    />
  );
}

export function FlowSummaryCell({ presentation }: { presentation: HistoryRowPresentation }) {
  return (
    <div className="flex flex-col items-center gap-1 text-xs leading-tight">
      <span className="rounded-full border px-2.5 py-1 font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
        {presentation.flow.label}
      </span>
      {presentation.flow.hint && (
        <span className="max-w-[8.5rem] truncate" style={{ color: LEGACY_COLORS.muted2 }}>
          {presentation.flow.hint}
        </span>
      )}
    </div>
  );
}
export function QuantityStockCell({
  presentation,
  summary,
}: {
  presentation: HistoryRowPresentation;
  summary?: MovementSummary;
}) {
  return (
    <div className="flex flex-col items-center gap-2 leading-tight">
      <MovementSummaryCell summary={summary ?? presentation.movement} />
      {presentation.stock && (
        <span className="text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
          {presentation.stock.label}
        </span>
      )}
    </div>
  );
}

export function PeopleStatusCell({ presentation }: { presentation: HistoryRowPresentation }) {
  const approver = presentation.people.approver?.trim();
  return (
    <div className="flex min-w-0 flex-col gap-2 leading-tight">
      <div className="truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
        요청 {presentation.people.requester}
      </div>
      {approver && approver !== "-" && (
        <div className="truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          승인 {approver}
        </div>
      )}
      <StatusChipStrip presentation={presentation} />
    </div>
  );
}
export type LogGroup =
  | { type: "solo"; log: TransactionLog }
  | { type: "batch"; refKey: string; refNo: string; logs: TransactionLog[] }
  | { type: "op_batch"; batchId: string; refNo: string | null; logs: TransactionLog[] };

function referenceGroupKey(log: TransactionLog): string {
  return `${log.reference_no ?? ""}::${log.shipping_phase ?? ""}`;
}

export function buildGroups(logs: TransactionLog[]): LogGroup[] {
  const opBatches = new Map<string, TransactionLog[]>();
  const refBatches = new Map<string, TransactionLog[]>();

  for (const log of logs) {
    if (log.operation_batch_id) {
      const g = opBatches.get(log.operation_batch_id) ?? [];
      g.push(log);
      opBatches.set(log.operation_batch_id, g);
    } else if (log.reference_no) {
      const key = referenceGroupKey(log);
      const g = refBatches.get(key) ?? [];
      g.push(log);
      refBatches.set(key, g);
    }
  }

  const groups: LogGroup[] = [];
  const seenOp = new Set<string>();
  const seenRef = new Set<string>();

  for (const log of logs) {
    if (log.operation_batch_id) {
      if (seenOp.has(log.operation_batch_id)) continue;
      seenOp.add(log.operation_batch_id);
      const batchLogs = opBatches.get(log.operation_batch_id)!;
      if (batchLogs.length === 1) {
        groups.push({ type: "solo", log: batchLogs[0] });
      } else {
        groups.push({
          type: "op_batch",
          batchId: log.operation_batch_id,
          refNo: log.reference_no ?? null,
          logs: batchLogs,
        });
      }
    } else if (log.reference_no) {
      const key = referenceGroupKey(log);
      if (seenRef.has(key)) continue;
      seenRef.add(key);
      const refLogs = refBatches.get(key)!;
      if (refLogs.length === 1) {
        groups.push({ type: "solo", log: refLogs[0] });
      } else {
        groups.push({ type: "batch", refKey: key, refNo: log.reference_no, logs: refLogs });
      }
    } else {
      groups.push({ type: "solo", log });
    }
  }
  return groups;
}

/** 묶음 안 모든 로그가 같은 item_id 인지. 합산 수량 표시 안전 가드. */
export function isHomogeneousItemGroup(logs: TransactionLog[]): boolean {
  if (logs.length === 0) return false;
  const first = logs[0].item_id;
  for (let i = 1; i < logs.length; i++) {
    if (logs[i].item_id !== first) return false;
  }
  return true;
}

function ActorCell({ name }: { name: string }) {
  if (!name || name === "-") {
    return <span className="block text-center text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>;
  }
  return (
    <span className="block text-center text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>{name}</span>
  );
}

/** 목록 메모 셀 — 사용자가 직접 입력한 메모만 알약으로 표시(시스템 자동 생성 노트는 제외).
 *  호버(title)로 사용자 메모 전문 노출. 사용자 메모 없으면 "-". */
export function MemoCell({ notes }: { notes?: string | null }) {
  const { userMemo } = parseTransactionNotes(notes);
  if (!userMemo) {
    return <span className="block min-h-4" aria-label="메모 없음" />;
  }
  return (
    <div className="flex justify-center" title={userMemo}>
      <span
        className="inline-flex cursor-default items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
        style={{
          background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`,
          color: LEGACY_COLORS.blue,
        }}
      >
        메모
      </span>
    </div>
  );
}

export function ChevronToggleBtn({
  expanded,
  onToggle,
}: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={expanded ? "묶음 접기" : "묶음 펼치기"}
      aria-expanded={expanded}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] hover:brightness-125"
      style={{ background: "rgba(101,169,255,.10)" }}
    >
      {expanded
        ? <ChevronDown className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.blue }} />
        : <ChevronRight className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.muted2 }} />}
    </button>
  );
}

/**
 * 레거시 reference_no 기반 묶음 헤더.
 * 같은 item_id 묶음일 때만 품목명을 대표로 쓰고, 혼합이면 묶음 단위로 표시한다.
 * row click → onSelect (상세 열기), chevron click → onToggle (펼치기/접기).
 */
export function BatchHeader({
  group,
  expanded,
  onToggle,
  selected,
  onSelect,
  compact,
}: {
  group: Extract<LogGroup, { type: "batch" }>;
  expanded: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelect: () => void;
  /** 우측 패널 열림 — 일시/구분 셀 좌우 패딩 압축. */
  compact?: boolean;
}) {
  const padX = compact ? "px-2" : "px-4";
  const first = group.logs[0];
  const referencePresentation = getReferenceBatchPresentation(group.logs);
  const primaryType = (group.logs.find((l) => l.transaction_type !== "BACKFLUSH") ?? first).transaction_type;
  const flowColor = isReworkOperation(first) ? LEGACY_COLORS.red : transactionColor(primaryType);
  const summary = referencePresentation.movement;
  const basePresentation = getHistoryRowPresentation(first);
  const presentation: HistoryRowPresentation = {
    ...basePresentation,
    operation: {
      ...basePresentation.operation,
      label: referencePresentation.operationLabel,
    },
    movement: summary,
    flow: referencePresentation.kind === "shipment" ? { label: referencePresentation.flowLabel ?? getShippingPhaseFlowLabel(referencePresentation.phase) ?? "출하" } : { ...basePresentation.flow, hint: undefined },
    stock: null,
    target: {
      ...basePresentation.target,
      title: referencePresentation.targetTitle,
      code: referencePresentation.targetCode,
      meta: referencePresentation.targetMeta,
    },
  };
  const [hovered, setHovered] = useState(false);

  const rowBackground = selected
    ? tint(LEGACY_COLORS.blue, hovered ? 18 : 10)
    : hovered
      ? tint(flowColor, 14)
      : undefined;

  return (
    <tr
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="cursor-pointer select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
      style={{
        background: rowBackground,
        outline: selected ? `1.5px solid ${LEGACY_COLORS.blue}` : "none",
        transition: "background-color 150ms cubic-bezier(.4,0,.2,1)",
      }}
    >
      <td className={`whitespace-nowrap border-b ${padX} py-3 text-xs`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, transition: HISTORY_CELL_TRANSITION }}>
        <div className="flex items-center justify-center gap-1.5">
          <ChevronToggleBtn expanded={expanded} onToggle={onToggle} />
          {formatHistoryDate(first.requested_at ?? first.created_at)}
        </div>
      </td>
      <td className={`whitespace-nowrap border-b ${padX} py-3 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <FlowBadge type={primaryType} label={presentation.operation.label} color={flowColor} />
      </td>
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <TargetSummaryBlock
          presentation={presentation}
          icon={<Layers className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />}
        />
      </td>
      <ItemCodeCell code={presentation.target.code} compact={compact} />
      <SpacerCell compact={compact} />
      <td className="whitespace-nowrap border-b px-5 py-3 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
        <FlowSummaryCell presentation={presentation} />
      </td>
      <td className="whitespace-nowrap border-b px-4 py-3 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
        <QuantityStockCell presentation={presentation} summary={summary} />
      </td>
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <PeopleStatusCell presentation={presentation} />
      </td>
    </tr>
  );
}

export function ReferenceBatchDetail({
  logs,
  compact,
  highlightLogId,
}: {
  logs: TransactionLog[];
  compact?: boolean;
  highlightLogId?: string | null;
}) {
  const presentation = getReferenceBatchPresentation(logs);

  const sortedLogs = [...logs].sort((a, b) => getReferenceBatchLineOrder(a, presentation.kind) - getReferenceBatchLineOrder(b, presentation.kind));

  return (
    <>
      {sortedLogs.map((log) => (
        <ReferenceBatchLineRow
          key={log.log_id}
          log={log}
          kind={presentation.kind}
          compact={compact}
          highlightLogId={highlightLogId}
        />
      ))}
    </>
  );
}

function ReferenceBatchLineRow({
  log,
  kind,
  compact,
  highlightLogId,
}: {
  log: TransactionLog;
  kind: ReturnType<typeof getReferenceBatchPresentation>["kind"];
  compact?: boolean;
  highlightLogId?: string | null;
}) {
  const padX = compact ? "px-2" : "px-4";
  const presentation = getHistoryRowPresentation(log);
  const linePresentation = getReferenceBatchLinePresentation(log, kind);
  const lineColor = PRESENTATION_TONE_COLOR[linePresentation.tone];
  const highlighted = highlightLogId === log.log_id;

  return (
    <tr
      data-history-focus-line={highlighted ? "true" : undefined}
      style={{
        background: highlighted
          ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
          : kind === "shipment"
            ? "color-mix(in srgb, var(--c-blue) 3%, transparent)"
            : "color-mix(in srgb, var(--c-red) 3%, transparent)",
        boxShadow: highlighted ? `inset 3px 0 0 ${LEGACY_COLORS.blue}` : undefined,
      }}
    >
      <td className={`border-b ${padX} py-2`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
      <td className={`whitespace-nowrap border-b ${padX} py-2 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <FlowBadge type={log.transaction_type} label={linePresentation.label} color={lineColor} />
      </td>
      <td className="border-b px-4 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 shrink-0 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>└</span>
          <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
              {log.item_name}
            </div>
          </div>
        </div>
      </td>
      <ItemCodeCell code={presentation.target.code} compact={compact} dense />
      <SpacerCell compact={compact} dense />
      <td className="whitespace-nowrap border-b px-5 py-2 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
        <FlowSummaryCell presentation={presentation} />
      </td>
      <td className="whitespace-nowrap border-b px-4 py-2 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
        <QuantityStockCell presentation={presentation} />
      </td>
      <td className="border-b px-4 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
        <PeopleStatusCell presentation={presentation} />
      </td>
    </tr>
  );
}
function getReferenceBatchLineOrder(
  log: TransactionLog,
  kind: ReturnType<typeof getReferenceBatchPresentation>["kind"],
): number {
  if (kind !== "shipment") return 0;
  if (log.shipping_phase === "PICKUP") return log.transaction_type === "SHIP" && !/^출하\s+동반\s+품목/.test(log.notes?.trim() ?? "") ? 0 : 1;
  if (log.shipping_phase === "PREPARE") return log.transaction_type === "PRODUCE" ? 0 : log.transaction_type === "BACKFLUSH" ? 1 : 2;
  if (log.shipping_phase === "COMPONENT_CHANGE") return getComponentChangeLineOrder(log);
  const line = getReferenceBatchLinePresentation(log, kind);
  if (line.label === "출하 대상") return 0;
  if (line.label === "동반 출하품") return 1;
  if (line.label === "출하 준비") return 2;
  return 3;
}

function getComponentChangeLineOrder(log: TransactionLog): number {
  const notes = log.notes?.trim() ?? "";
  if (notes.includes("품목 전환 소스")) return 0;
  if (notes.includes("품목 전환 추가 차감")) return 1;
  if (notes.includes("품목 전환 회수 입고")) return 2;
  if (notes.includes("품목 전환 대상")) return 3;
  if (log.transaction_type === "BACKFLUSH") return 1;
  if (log.transaction_type === "RECEIVE") return 2;
  if (log.transaction_type === "PRODUCE") return 3;
  return 4;
}

/**
 * operation_batch_id 기반 묶음 헤더.
 * batch cache 가 있으면 IoBatch 기준 대상/흐름/라인 상태를 한 행에서 설명한다.
 * row click → onSelect (우측 batch 상세 열기), chevron click → onToggle (펼치기/접기).
 */
export function OpBatchHeader({
  group,
  expanded,
  onToggle,
  selected,
  onSelect,
  batch,
  rowRef,
  compact,
}: {
  group: Extract<LogGroup, { type: "op_batch" }>;
  expanded: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelect: () => void;
  batch?: IoBatch | null;
  /** visible 진입 감지용 ref. */
  rowRef?: (el: HTMLTableRowElement | null) => void;
  /** 우측 패널 열림 — 일시/구분 셀 좌우 패딩 압축. */
  compact?: boolean;
}) {
  const padX = compact ? "px-2" : "px-4";
  const first = group.logs[0];
  const primaryType = (group.logs.find((l) => l.transaction_type !== "BACKFLUSH") ?? first).transaction_type;
  const basePresentation = getHistoryRowPresentation(first, batch ?? undefined);
  const flowColor = isReworkOperation(first, batch) ? LEGACY_COLORS.red : transactionColor(primaryType);

  let titleText: string;
  if (batch && batch.bundles.length > 0) {
    const head = batch.bundles[0].title;
    titleText = batch.bundles.length > 1 ? `${head} 외 ${batch.bundles.length - 1}건` : head;
  } else {
    titleText = `${first.item_name} 외 ${group.logs.length - 1}건`;
  }

  const summary = getHistoryMovementSummary(first, batch, group.logs.length);
  const presentation: HistoryRowPresentation = {
    ...basePresentation,
    movement: summary,
    target: {
      ...basePresentation.target,
      title: titleText,
      meta: [],
    },
  };
  const [hovered, setHovered] = useState(false);

  const rowBackground = selected
    ? tint(LEGACY_COLORS.blue, hovered ? 18 : 10)
    : hovered
      ? tint(flowColor, 14)
      : undefined;

  return (
    <tr
      ref={rowRef}
      data-batch-id={group.batchId}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="cursor-pointer select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
      style={{
        background: rowBackground,
        outline: selected ? `1.5px solid ${LEGACY_COLORS.blue}` : "none",
        transition: "background-color 150ms cubic-bezier(.4,0,.2,1)",
      }}
    >
      <td className={`whitespace-nowrap border-b ${padX} py-3 text-xs`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, transition: HISTORY_CELL_TRANSITION }}>
        <div className="flex items-center justify-center gap-1.5">
          <ChevronToggleBtn expanded={expanded} onToggle={onToggle} />
          {formatHistoryDate(first.requested_at ?? first.created_at)}
        </div>
      </td>
      <td className={`whitespace-nowrap border-b ${padX} py-3 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <FlowBadge type={primaryType} label={presentation.operation.label} color={flowColor} />
      </td>
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <TargetSummaryBlock
          presentation={presentation}
          icon={<Layers className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />}
        />
      </td>
      <ItemCodeCell code={presentation.target.code} compact={compact} />
      <SpacerCell compact={compact} />
      <td className="whitespace-nowrap border-b px-5 py-3 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
        <FlowSummaryCell presentation={presentation} />
      </td>
      <td className="whitespace-nowrap border-b px-4 py-3 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
        <QuantityStockCell presentation={presentation} summary={summary} />
      </td>
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <PeopleStatusCell presentation={presentation} />
      </td>
    </tr>
  );
}
