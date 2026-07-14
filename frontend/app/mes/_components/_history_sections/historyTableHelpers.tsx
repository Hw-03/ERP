"use client";

import { Fragment, useState } from "react";
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine,
  BookmarkMinus, BookmarkPlus, ChevronDown, ChevronRight, Hammer, Layers,
  Package, PackageX, Recycle, ShieldAlert, Sliders, Trash2, Undo2, Wrench,
} from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import type { TransactionReferenceSummary } from "@/lib/api/production";
import type { IoBatch } from "@/lib/api/types/io";
import { TruncatedText } from "@/lib/ui/TruncatedText";
import type { HistoryPresentationTone, HistoryRowPresentation } from "./historyPresentation";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import { transactionColor, transactionIconName } from "@/lib/mes-status";
import {
  describeBatchFlow,
  getHistoryActor,
  getHistoryDisplayLabel,
  getHistoryDisplayTransactionType,
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
export const HISTORY_MAIN_ROW_CLASS = "h-[64px]";
export const HISTORY_MAIN_CELL_CLASS = "border-b py-2 align-middle";
export const HISTORY_CHILD_ROW_CLASS = "h-[40px]";
export const HISTORY_CHILD_CELL_CLASS = "h-[40px] overflow-hidden border-b py-0 align-middle";

export function FlowBadge({
  type,
  label,
  color,
  compact = false,
  accessibleLabel,
}: {
  type: TransactionLog["transaction_type"] | null;
  label: string;
  color: string;
  compact?: boolean;
  accessibleLabel?: string;
}) {
  const Icon = type ? TX_ICON[transactionIconName(type)] : null;
  const fullLabel = accessibleLabel ?? label;
  return (
    <span
      aria-label={accessibleLabel}
      title={fullLabel !== label ? fullLabel : undefined}
      className="inline-flex h-6 w-full max-w-full min-w-0 items-center justify-center gap-1 rounded-full px-3 text-xs font-bold leading-none"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span className="min-w-0 truncate">{label}</span>
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

/** 펼침 하위 거래 행은 역할 대신 실제 증감량만 같은 pill 형식으로 표시한다. */
export function getHistoryLogSignedQuantity(log: TransactionLog): MovementSummary {
  const delta = Number(log.quantity_change);
  const transferred = log.transfer_qty == null ? null : Math.abs(Number(log.transfer_qty));
  const quantity = Number.isFinite(transferred) ? transferred : Math.abs(delta);
  const unit = log.item_unit?.trim() ?? "";
  const suffix = unit ? ` ${unit}` : "";
  const label = delta > 0
    ? `+${formatQty(quantity)}${suffix}`
    : delta < 0
      ? `-${formatQty(quantity)}${suffix}`
      : `0${suffix}`;
  return {
    parts: [{
      label,
      tone: delta > 0 ? "primary" : delta < 0 ? "danger" : "muted",
    }],
  };
}

function getPillDisplayLabel(label: string): { label: string; title?: string } {
  const match = label.match(/([+-])(\d[\d,]*(?:\.\d+)?)\s*([A-Za-z]+)$/);
  if (!match) return { label };

  const quantity = Number(match[2].replaceAll(",", ""));
  if (!Number.isFinite(quantity) || quantity <= 999) return { label };

  const abbreviated = `${(quantity / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return {
    label: `${label.slice(0, match.index)}${match[1]}${abbreviated} ${match[3]}`,
    title: label,
  };
}

export function MovementSummaryCell({
  summary,
  compact = false,
}: {
  summary: MovementSummary;
  compact?: boolean;
}) {
  // 변화량 pill 은 단건/묶음/경고 모두 같은 높이로 고정한다.
  // 단일 pill 폭은 2개 pill(5rem + gap-1 + 5rem)과 맞춰 열의 리듬을 통일한다.
  const isSingle = summary.parts.length === 1 && !summary.warning;
  const pillClass = compact
    ? "inline-flex h-6 max-w-full min-w-0 flex-1 items-center justify-center truncate rounded-full px-2 text-xs font-bold leading-none"
    : isSingle
      ? "inline-flex h-6 min-w-[12.75rem] items-center justify-center rounded-full px-3 text-xs font-bold leading-none"
      : "inline-flex h-6 min-w-[6.25rem] items-center justify-center rounded-full px-2.5 text-xs font-bold leading-none";
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${compact ? "w-full min-w-0 max-w-full" : ""}`}>
      {summary.parts.map((p, i) => {
        const color = TONE_COLOR[p.tone];
        const display = getPillDisplayLabel(p.label);
        return (
          <span
            key={i}
            className={pillClass}
            title={display.title}
            style={{
              // WCAG AA: 연한 틴트 위 brand 컬러 텍스트는 4.5:1 미달 →
              // 같은 색조를 text 색과 섞어 어둡게(색 코딩 유지 + 대비 확보).
              background: `color-mix(in srgb, ${color} 18%, transparent)`,
              color: `color-mix(in srgb, ${color} 42%, ${LEGACY_COLORS.text})`,
            }}
          >
            {display.label}
          </span>
        );
      })}
      {summary.warning && (
        <span
          className="inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold leading-none"
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

export function StatusChipStrip({ presentation }: { presentation: HistoryRowPresentation; compact?: boolean }) {
  if (presentation.statusChips.length === 0) {
    return null;
  }
  return (
    <div className="flex max-w-full flex-nowrap justify-center gap-1 overflow-hidden">
      {presentation.statusChips.map((chip) => {
        const color = PRESENTATION_TONE_COLOR[chip.tone];
        return (
          <span
            key={`${chip.label}-${chip.title ?? ""}`}
            title={chip.title}
            className="inline-flex h-5 min-w-0 shrink-0 items-center rounded-full px-2 text-xs font-bold leading-none"
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
  const title = titleOverride ?? presentation.target.title;
  const displayTitle = presentation.target.sourceTitle
    ? `${presentation.target.sourceTitle} → ${title}`
    : title;
  return (
    <div className="max-h-12 min-w-0 overflow-hidden">
      <div className="flex min-w-0 items-center gap-1.5">
        {icon}
        <TruncatedText
          accessibilityLabel={displayTitle}
          className="min-w-0 line-clamp-2 text-sm font-bold leading-snug"
          style={{ color: LEGACY_COLORS.text }}
        >
          {displayTitle}
        </TruncatedText>
      </div>
      {meta.length > 0 && (
        <div className="mt-1 flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {meta.map((part) => (
            <span key={part} className="min-w-0 shrink truncate font-semibold">
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
  sourceCode,
  compact,
  dense = false,
}: {
  code?: string | null;
  sourceCode?: string | null;
  compact?: boolean;
  dense?: boolean;
}) {
  const padX = compact ? "px-1" : "px-3";
  return (
    <td
      className={`whitespace-nowrap ${dense ? HISTORY_CHILD_CELL_CLASS : HISTORY_MAIN_CELL_CLASS} ${padX} text-center text-xs font-semibold`}
      style={{ borderColor: LEGACY_COLORS.border, color: code ? LEGACY_COLORS.muted2 : LEGACY_COLORS.muted, transition: HISTORY_CELL_TRANSITION }}
    >
      {sourceCode ? (
        <div className="flex min-w-0 flex-col items-center leading-tight">
          <span className="max-w-full truncate">{sourceCode}</span>
          <span aria-hidden className="leading-none">↓</span>
          <span className="max-w-full truncate">{code ?? "-"}</span>
        </div>
      ) : (code || "-")}
    </td>
  );
}

export function SpacerCell({ compact, dense = false }: { compact?: boolean; dense?: boolean }) {
  return (
    <td
      aria-hidden
      className={`${compact ? "px-0" : "px-2"} ${dense ? HISTORY_CHILD_CELL_CLASS : HISTORY_MAIN_CELL_CLASS}`}
      style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}
    />
  );
}

export function FlowSummaryCell({
  presentation,
  dense = false,
}: {
  presentation: HistoryRowPresentation;
  dense?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center overflow-hidden text-xs leading-tight ${dense ? "h-10 gap-0.5" : "h-11 gap-1"}`}>
      <span className="max-w-[10.75rem] truncate rounded-full border px-2.5 py-1 font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
        {presentation.flow.label}
      </span>
      {presentation.flow.hint && (
        <span className="max-w-[10.75rem] truncate" style={{ color: LEGACY_COLORS.muted2 }}>
          {presentation.flow.hint}
        </span>
      )}
    </div>
  );
}
export function QuantityStockCell({
  presentation,
  summary,
  dense = false,
}: {
  presentation: HistoryRowPresentation;
  summary?: MovementSummary;
  dense?: boolean;
}) {
  return (
    <div className={`flex items-center justify-center overflow-hidden ${dense ? "h-10" : "h-11"}`}>
      <MovementSummaryCell summary={summary ?? presentation.movement} />
    </div>
  );
}

export function PeopleStatusCell({
  presentation,
  dense = false,
  compact = false,
}: {
  presentation: HistoryRowPresentation;
  dense?: boolean;
  compact?: boolean;
}) {
  const approver = presentation.people.approver?.trim();
  const requester = presentation.people.requester?.trim() || "-";
  const systemRequester = requester.startsWith("시스템 처리");
  const requesterLabel = systemRequester || compact ? requester : `요청 ${requester}`;
  const requesterTitle = systemRequester ? requester : `요청 ${requester}`;
  return (
    <div className={`flex min-w-0 flex-col items-center justify-center overflow-hidden text-center leading-tight ${dense ? "h-10 gap-0.5" : "h-11 gap-1"}`}>
      <div title={requesterTitle} className="truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
        {requesterLabel}
      </div>
      {approver && approver !== "-" && (
        <div className="truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          승인 {approver}
        </div>
      )}
      <StatusChipStrip presentation={presentation} compact={compact} />
    </div>
  );
}
export type LogGroup =
  | { type: "solo"; log: TransactionLog }
  | { type: "batch"; refKey: string; refNo: string; logs: TransactionLog[] }
  | { type: "op_batch"; batchId: string; refNo: string | null; logs: TransactionLog[] }
  | { type: "defect_lifecycle"; key: string; parent: TransactionLog; child: TransactionLog };

function referenceGroupKey(log: TransactionLog): string {
  return `${log.reference_no ?? ""}::${log.shipping_phase ?? ""}`;
}

export function buildGroups(logs: TransactionLog[]): LogGroup[] {
  const opBatches = new Map<string, TransactionLog[]>();
  const refBatches = new Map<string, TransactionLog[]>();
  const defectPairs = findDefectLifecyclePairs(logs);
  const defectPairByLogId = new Map<string, { pair: DefectLifecyclePair; anchorLogId: string }>();
  for (const pair of defectPairs) {
    const parentIndex = logs.findIndex((log) => log.log_id === pair.parent.log_id);
    const childIndex = logs.findIndex((log) => log.log_id === pair.child.log_id);
    const anchorLogId = (parentIndex <= childIndex ? pair.parent : pair.child).log_id;
    defectPairByLogId.set(pair.parent.log_id, { pair, anchorLogId });
    defectPairByLogId.set(pair.child.log_id, { pair, anchorLogId });
  }

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
    const defectPair = defectPairByLogId.get(log.log_id);
    if (defectPair) {
      if (defectPair.anchorLogId === log.log_id) {
        groups.push({
          type: "defect_lifecycle",
          key: `defect-lifecycle:${defectPair.pair.parent.log_id}:${defectPair.pair.child.log_id}`,
          parent: defectPair.pair.parent,
          child: defectPair.pair.child,
        });
      }
      continue;
    }
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

export function getHistorySeparationHint(
  previous: TransactionLog | null | undefined,
  current: TransactionLog,
): string | null {
  if (!previous || previous.item_id !== current.item_id) return null;
  if (current.cancelled) return "취소 이력";

  const previousReference = previous.reference_no?.trim();
  const currentReference = current.reference_no?.trim();
  if (previousReference && currentReference && previousReference !== currentReference) return "다른 요청";

  const previousActor = getHistoryActor(previous).trim();
  const currentActor = getHistoryActor(current).trim();
  if (previousActor && currentActor && previousActor !== currentActor) return "다른 요청";

  return previous.created_at !== current.created_at ? "별도 시각" : null;
}

type DefectLifecyclePair = {
  parent: TransactionLog;
  child: TransactionLog;
};

function findDefectLifecyclePairs(logs: TransactionLog[]): DefectLifecyclePair[] {
  const chronological = [...logs].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const used = new Set<string>();
  const pairs: DefectLifecyclePair[] = [];

  for (let index = 0; index < chronological.length; index += 1) {
    const parent = chronological[index];
    if (parent.transaction_type !== "MARK_DEFECTIVE" || used.has(parent.log_id)) continue;

    const child = chronological.slice(index + 1).find((candidate) =>
      !used.has(candidate.log_id) && isMatchingDefectLifecycle(parent, candidate),
    );
    if (!child) continue;

    used.add(parent.log_id);
    used.add(child.log_id);
    pairs.push({ parent, child });
  }

  return pairs;
}

function isMatchingDefectLifecycle(parent: TransactionLog, child: TransactionLog): boolean {
  if (!isDefectFollowup(child.transaction_type)) return false;
  if (parent.item_id !== child.item_id) return false;
  if (Math.abs(parent.quantity_change) !== Math.abs(child.quantity_change)) return false;
  if (!sameRequiredText(getDefectActor(parent), getDefectActor(child))) return false;
  if (!sameRequiredText(parent.department, child.department)) return false;
  if (!sameRequiredText(getDefectReasonKey(parent), getDefectReasonKey(child))) return false;

  const elapsed = Date.parse(child.created_at) - Date.parse(parent.created_at);
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 60_000;
}

function isDefectFollowup(type: TransactionLog["transaction_type"]): boolean {
  return type === "DEFECT_SCRAP" || type === "SUPPLIER_RETURN" || type === "DISASSEMBLE";
}

function getDefectActor(log: TransactionLog): string | null {
  return log.requester_name?.trim() || log.produced_by?.trim() || null;
}

function getDefectReasonKey(log: TransactionLog): string | null {
  const category = log.reason_category?.trim() ?? "";
  const memo = log.reason_memo?.trim() ?? "";
  const key = `${category}::${memo}`;
  return category || memo ? key : null;
}

function sameRequiredText(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && left === right);
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
  controlsId,
}: {
  expanded: boolean;
  onToggle: () => void;
  controlsId?: string;
}) {
  return (
    <button
      type="button"
      aria-label={expanded ? "묶음 접기" : "묶음 펼치기"}
      aria-expanded={expanded}
      aria-controls={controlsId}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onToggle();
      }}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)] hover:brightness-125"
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
  controlsId,
  separationHint,
  referenceSummary,
  referenceSummaryLoading = false,
}: {
  group: Extract<LogGroup, { type: "batch" }>;
  expanded: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelect: () => void;
  controlsId?: string;
  separationHint?: string | null;
  referenceSummary?: TransactionReferenceSummary | null;
  referenceSummaryLoading?: boolean;
}) {
  const padX = "px-4";
  const targetPadX = "px-4";
  const flowPadX = "px-2";
  const quantityPadX = "px-4";
  const statusPadX = "px-4";
  const first = group.logs[0];
  const referencePresentation = getReferenceBatchPresentation(group.logs, referenceSummary);
  const primaryType = (group.logs.find((l) => l.transaction_type !== "BACKFLUSH") ?? first).transaction_type;
  const flowColor = isReworkOperation(first) ? LEGACY_COLORS.red : transactionColor(primaryType);
  const summary = referenceSummary === null
    ? { parts: [{ label: referenceSummaryLoading ? "세부 확인 중" : "세부 —", tone: "muted" as const }] }
    : referencePresentation.movement;
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
      sourceTitle: referencePresentation.sourceTarget?.sourceTitle,
      sourceCode: referencePresentation.sourceTarget?.sourceCode,
    },
    statusChips: separationHint
      ? [...basePresentation.statusChips, { label: separationHint, tone: "muted" }]
      : basePresentation.statusChips,
  };
  const [hovered, setHovered] = useState(false);
  const cancelled = group.logs.some((log) => log.cancelled);

  const rowBackground = selected
    ? tint(flowColor, hovered ? 18 : 10)
    : hovered
      ? tint(flowColor, 14)
      : undefined;

  return (
    <tr
      data-history-main-row="true"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      aria-selected={selected}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`${HISTORY_MAIN_ROW_CLASS} cursor-pointer select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]${cancelled ? " opacity-60" : ""}`}
      style={{
        background: rowBackground,
        outline: selected ? `1.5px solid ${flowColor}` : "none",
        transition: "background-color 150ms cubic-bezier(.4,0,.2,1)",
      }}
    >
      <td className={`whitespace-nowrap ${HISTORY_MAIN_CELL_CLASS} ${padX} text-xs`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, transition: HISTORY_CELL_TRANSITION }}>
        <div className="flex items-center justify-center gap-1.5">
          <ChevronToggleBtn expanded={expanded} onToggle={onToggle} controlsId={controlsId} />
          {formatHistoryDate(first.requested_at ?? first.created_at)}
        </div>
      </td>
      <td className={`whitespace-nowrap ${HISTORY_MAIN_CELL_CLASS} ${padX} text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <FlowBadge type={primaryType} label={presentation.operation.label} color={flowColor} />
      </td>
      <td className={`${HISTORY_MAIN_CELL_CLASS} ${targetPadX}`} style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex min-w-0 items-center gap-1.5">
          <TargetSummaryBlock
            presentation={presentation}
            icon={<Layers className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />}
          />
        </div>
      </td>
      <ItemCodeCell code={presentation.target.code} sourceCode={presentation.target.sourceCode} />
      <SpacerCell />
      <td className={`whitespace-nowrap ${HISTORY_MAIN_CELL_CLASS} ${flowPadX} text-center`} style={{ borderColor: LEGACY_COLORS.border }}>
        <FlowSummaryCell presentation={presentation} />
      </td>
      <td className={`whitespace-nowrap ${HISTORY_MAIN_CELL_CLASS} ${quantityPadX} text-center`} style={{ borderColor: LEGACY_COLORS.border }}>
        <QuantityStockCell presentation={presentation} summary={summary} />
      </td>
      <td className={`${HISTORY_MAIN_CELL_CLASS} ${statusPadX}`} style={{ borderColor: LEGACY_COLORS.border }}>
        <PeopleStatusCell presentation={presentation} />
      </td>
    </tr>
  );
}

export function ReferenceBatchDetail({
  logs,
  compact,
  highlightLogId,
  onSelectLog,
  controlsId,
}: {
  logs: TransactionLog[];
  compact?: boolean;
  highlightLogId?: string | null;
  onSelectLog?: (log: TransactionLog) => void;
  controlsId?: string;
}) {
  const presentation = getReferenceBatchPresentation(logs);

  const sortedLogs = [...logs].sort((a, b) => getReferenceBatchLineOrder(a, presentation.kind) - getReferenceBatchLineOrder(b, presentation.kind));

  if (presentation.phase === "COMPONENT_CHANGE") {
    return (
      <ComponentChangeDetail
        logs={sortedLogs}
        compact={compact}
        highlightLogId={highlightLogId}
        onSelectLog={onSelectLog}
        controlsId={controlsId}
      />
    );
  }

  return (
    <>
      {sortedLogs.map((log, index) => (
        <ReferenceBatchLineRow
          key={log.log_id}
          log={log}
          kind={presentation.kind}
          compact={compact}
          highlightLogId={highlightLogId}
          onSelectLog={onSelectLog}
          rowId={index === 0 ? controlsId : undefined}
        />
      ))}
    </>
  );
}

function ComponentChangeDetail({
  logs,
  compact,
  highlightLogId,
  onSelectLog,
  controlsId,
}: {
  logs: TransactionLog[];
  compact?: boolean;
  highlightLogId?: string | null;
  onSelectLog?: (log: TransactionLog) => void;
  controlsId?: string;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ source: false, target: false });
  const sections = [
    {
      key: "source" as const,
      label: "기존품 차감",
      logs: logs.filter((log) => log.quantity_change < 0),
      tone: "warning" as const,
    },
    {
      key: "target" as const,
      label: "변경품 입고",
      logs: logs.filter((log) => log.quantity_change >= 0),
      tone: "success" as const,
    },
  ].filter((section) => section.logs.length > 0);

  return (
    <>
      {sections.map((section) => {
        const sectionId = `${controlsId ?? "history-component-change"}-${section.key}`;
        const parent = getComponentChangeSectionParent(section.key, section.logs);
        if (!parent) {
          return section.logs.map((log, index) => (
            <ReferenceBatchLineRow
              key={log.log_id}
              log={log}
              kind="shipment"
              compact={compact}
              highlightLogId={highlightLogId}
              onSelectLog={onSelectLog}
              rowId={index === 0 ? sectionId : undefined}
            />
          ));
        }
        const children = section.logs.filter((log) => log.log_id !== parent.log_id);
        if (children.length === 0) {
          return (
            <ReferenceBatchLineRow
              key={parent.log_id}
              log={parent}
              kind="shipment"
              compact={compact}
              highlightLogId={highlightLogId}
              onSelectLog={onSelectLog}
              rowId={sectionId}
            />
          );
        }
        const sectionExpanded = expanded[section.key] === true;
        return (
          <Fragment key={section.key}>
            <ReferenceBatchLineRow
              log={parent}
              kind="shipment"
              compact={compact}
              highlightLogId={highlightLogId}
              onSelectLog={onSelectLog}
              sectionLabel={section.label}
              expanded={sectionExpanded}
              onToggle={() => setExpanded((previous) => ({ ...previous, [section.key]: !previous[section.key] }))}
              controlsId={sectionId}
            />
            {sectionExpanded && children.map((log, index) => (
              <ReferenceBatchLineRow
                key={log.log_id}
                log={log}
                kind="shipment"
                compact={compact}
                highlightLogId={highlightLogId}
                onSelectLog={onSelectLog}
                rowId={index === 0 ? sectionId : undefined}
              />
            ))}
          </Fragment>
        );
      })}
    </>
  );
}

function getComponentChangeSectionParent(
  section: "source" | "target",
  logs: TransactionLog[],
): TransactionLog | null {
  const marker = section === "source" ? "품목 전환 소스" : "품목 전환 대상";
  return logs.find((log) => log.notes?.includes(marker)) ?? null;
}

function ReferenceBatchLineRow({
  log,
  kind,
  compact,
  highlightLogId,
  onSelectLog,
  rowId,
  sectionLabel,
  expanded,
  onToggle,
  controlsId,
}: {
  log: TransactionLog;
  kind: ReturnType<typeof getReferenceBatchPresentation>["kind"];
  compact?: boolean;
  highlightLogId?: string | null;
  onSelectLog?: (log: TransactionLog) => void;
  rowId?: string;
  sectionLabel?: string;
  expanded?: boolean;
  onToggle?: () => void;
  controlsId?: string;
}) {
  const padX = compact ? "px-2" : "px-4";
  const targetPadX = compact ? "px-2" : "px-4";
  const flowPadX = "px-2";
  const quantityPadX = compact ? "px-2" : "px-4";
  const statusPadX = compact ? "px-2" : "px-4";
  const presentation = getHistoryRowPresentation(log);
  const linePresentation = getReferenceBatchLinePresentation(log, kind);
  const fullLineLabel = linePresentation.label;
  const lineLabel = compact && fullLineLabel === "추가 구성품 차감" ? "추가 차감" : fullLineLabel;
  const lineColor = PRESENTATION_TONE_COLOR[linePresentation.tone];
  const highlighted = highlightLogId === log.log_id;

  return (
    <tr
      id={rowId}
      role={onSelectLog ? "button" : undefined}
      tabIndex={onSelectLog ? 0 : undefined}
      data-history-focus-line={highlighted ? "true" : undefined}
      onClick={() => onSelectLog?.(log)}
      onKeyDown={(e) => {
        if (!onSelectLog) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelectLog(log);
        }
      }}
      className={`${HISTORY_CHILD_ROW_CLASS}${onSelectLog ? " cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]" : ""}`}
      style={{
        background: highlighted
          ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
          : kind === "shipment"
            ? "color-mix(in srgb, var(--c-blue) 3%, transparent)"
            : "color-mix(in srgb, var(--c-red) 3%, transparent)",
        boxShadow: highlighted ? `inset 3px 0 0 ${LEGACY_COLORS.blue}` : undefined,
      }}
    >
      <td className={`${HISTORY_CHILD_CELL_CLASS} ${padX}`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
      <td className={`whitespace-nowrap ${HISTORY_CHILD_CELL_CLASS} ${padX} text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <FlowBadge
          type={log.transaction_type}
          label={sectionLabel ?? lineLabel}
          color={lineColor}
          compact={compact}
          accessibleLabel={sectionLabel ? undefined : fullLineLabel !== lineLabel ? fullLineLabel : undefined}
        />
      </td>
      <td className={`${HISTORY_CHILD_CELL_CLASS} ${targetPadX}`} style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex min-w-0 items-center gap-2">
          {onToggle
            ? <ChevronToggleBtn expanded={expanded ?? true} onToggle={onToggle} controlsId={controlsId} />
            : <span aria-hidden className="h-5 w-5 shrink-0" />}
          <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
          <TruncatedText
            accessibilityLabel={log.item_name}
            className="truncate text-xs font-semibold"
            style={{ color: LEGACY_COLORS.text }}
          >
            {log.item_name}
          </TruncatedText>
        </div>
      </td>
      <ItemCodeCell code={presentation.target.code} compact={compact} dense />
      <SpacerCell compact={compact} dense />
      <td className={`whitespace-nowrap ${HISTORY_CHILD_CELL_CLASS} ${flowPadX} text-center`} style={{ borderColor: LEGACY_COLORS.border }}>
        <FlowSummaryCell presentation={presentation} dense />
      </td>
      <td className={`whitespace-nowrap ${HISTORY_CHILD_CELL_CLASS} ${quantityPadX} text-center`} style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex h-10 items-center justify-center overflow-hidden">
          <MovementSummaryCell summary={getHistoryLogSignedQuantity(log)} compact={compact} />
        </div>
      </td>
      <td className={`${HISTORY_CHILD_CELL_CLASS} ${statusPadX}`} style={{ borderColor: LEGACY_COLORS.border }} />
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
  controlsId,
  separationHint,
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
  controlsId?: string;
  separationHint?: string | null;
}) {
  const padX = compact ? "px-2" : "px-4";
  const targetPadX = compact ? "px-2" : "px-4";
  const flowPadX = "px-2";
  const quantityPadX = compact ? "px-2" : "px-4";
  const statusPadX = compact ? "px-2" : "px-4";
  const first = group.logs[0];
  const rawPrimaryType = (group.logs.find((l) => l.transaction_type !== "BACKFLUSH") ?? first).transaction_type;
  const primaryType = getHistoryDisplayTransactionType({ transaction_type: rawPrimaryType }, batch);
  const basePresentation = getHistoryRowPresentation(first, batch ?? undefined);
  const flowColor = isReworkOperation(first, batch) ? LEGACY_COLORS.red : transactionColor(primaryType);
  const cancelled = group.logs.some((log) => log.cancelled);

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
    statusChips: separationHint
      ? [...basePresentation.statusChips, { label: separationHint, tone: "muted" }]
      : basePresentation.statusChips,
  };
  const [hovered, setHovered] = useState(false);

  const rowBackground = selected
    ? tint(flowColor, hovered ? 18 : 10)
    : hovered
      ? tint(flowColor, 14)
      : undefined;

  return (
    <tr
      ref={rowRef}
      data-batch-id={group.batchId}
      data-history-main-row="true"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      aria-selected={selected}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`${HISTORY_MAIN_ROW_CLASS} cursor-pointer select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]${cancelled ? " opacity-60" : ""}`}
      style={{
        background: rowBackground,
        outline: selected ? `1.5px solid ${flowColor}` : "none",
        transition: "background-color 150ms cubic-bezier(.4,0,.2,1)",
      }}
    >
      <td className={`whitespace-nowrap ${HISTORY_MAIN_CELL_CLASS} ${padX} text-xs`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, transition: HISTORY_CELL_TRANSITION }}>
        <div className="flex items-center justify-center gap-1.5">
          <ChevronToggleBtn expanded={expanded} onToggle={onToggle} controlsId={controlsId} />
          {formatHistoryDate(first.requested_at ?? first.created_at)}
        </div>
      </td>
      <td className={`whitespace-nowrap ${HISTORY_MAIN_CELL_CLASS} ${padX} text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <FlowBadge type={primaryType} label={presentation.operation.label} color={flowColor} compact={compact} />
      </td>
      <td className={`${HISTORY_MAIN_CELL_CLASS} ${targetPadX}`} style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex min-w-0 items-center gap-1.5">
          <TargetSummaryBlock
            presentation={presentation}
            icon={<Layers className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />}
          />
        </div>
      </td>
      <ItemCodeCell code={presentation.target.code} compact={compact} />
      <SpacerCell compact={compact} />
      <td className={`whitespace-nowrap ${HISTORY_MAIN_CELL_CLASS} ${flowPadX} text-center`} style={{ borderColor: LEGACY_COLORS.border }}>
        <FlowSummaryCell presentation={presentation} />
      </td>
      <td className={`whitespace-nowrap ${HISTORY_MAIN_CELL_CLASS} ${quantityPadX} text-center`} style={{ borderColor: LEGACY_COLORS.border }}>
        <QuantityStockCell presentation={presentation} summary={summary} />
      </td>
      <td className={`${HISTORY_MAIN_CELL_CLASS} ${statusPadX}`} style={{ borderColor: LEGACY_COLORS.border }}>
        <PeopleStatusCell presentation={presentation} compact={compact} />
      </td>
    </tr>
  );
}
