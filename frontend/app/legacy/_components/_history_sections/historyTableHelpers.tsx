"use client";

import {
  Activity, AlertCircle, ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine,
  BookmarkMinus, BookmarkPlus, ChevronDown, ChevronRight, Hammer, Layers,
  PackageX, Recycle, ShieldAlert, Sliders, Trash2, Undo2, Wrench,
} from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor, transactionIconName } from "@/lib/mes-status";
import {
  describeBatchFlow,
  getHistoryActor,
  getHistoryDisplayLabel,
  getHistoryMovementSummary,
  type MovementSummary,
  type MovementTone,
} from "./historyBatchInterpreter";
import { isReworkOperation } from "./transactionTaxonomy";
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

export type LogGroup =
  | { type: "solo"; log: TransactionLog }
  | { type: "batch"; refNo: string; logs: TransactionLog[] }
  | { type: "op_batch"; batchId: string; refNo: string | null; logs: TransactionLog[] };

export function buildGroups(logs: TransactionLog[]): LogGroup[] {
  const opBatches = new Map<string, TransactionLog[]>();
  const refBatches = new Map<string, TransactionLog[]>();

  for (const log of logs) {
    if (log.operation_batch_id) {
      const g = opBatches.get(log.operation_batch_id) ?? [];
      g.push(log);
      opBatches.set(log.operation_batch_id, g);
    } else if (log.reference_no) {
      const g = refBatches.get(log.reference_no) ?? [];
      g.push(log);
      refBatches.set(log.reference_no, g);
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
      if (seenRef.has(log.reference_no)) continue;
      seenRef.add(log.reference_no);
      const refLogs = refBatches.get(log.reference_no)!;
      if (refLogs.length === 1) {
        groups.push({ type: "solo", log: refLogs[0] });
      } else {
        groups.push({ type: "batch", refNo: log.reference_no, logs: refLogs });
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

/** 목록 메모 셀 — 내용은 안 펼치고 "메모" 표시만, 호버(title)로 전문. 없으면 "-". */
export function MemoCell({ notes }: { notes?: string | null }) {
  const text = notes?.trim();
  if (!text) {
    return <span className="block text-center text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>;
  }
  return (
    <div className="flex justify-center" title={text}>
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

function ChevronToggleBtn({
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
 * 같은 item_id 묶음일 때만 합산 수량 표시. 혼합이면 "하위 N건".
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
  const homogeneous = isHomogeneousItemGroup(group.logs);
  const primaryType = (group.logs.find((l) => l.transaction_type !== "BACKFLUSH") ?? first).transaction_type;
  const actor = getHistoryActor(first);
  // 재작업(DISASSEMBLE) 묶음은 빨간색 강제. transactionColor 의 muted/회색 fallback 덮어씀.
  const flowColor = isReworkOperation(first) ? LEGACY_COLORS.red : transactionColor(primaryType);
  const summary = getHistoryMovementSummary(first, null, group.logs.length);

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
      className="cursor-pointer select-none transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
      style={{
        background: selected ? "rgba(101,169,255,.10)" : "rgba(101,169,255,.06)",
        outline: selected ? `1.5px solid ${LEGACY_COLORS.blue}` : "none",
      }}
    >
      <td className={`whitespace-nowrap border-b ${padX} py-3 text-xs`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, transition: HISTORY_CELL_TRANSITION }}>
        <div className="flex items-center justify-center gap-1.5">
          <ChevronToggleBtn expanded={expanded} onToggle={onToggle} />
          {formatHistoryDate(first.created_at)}
        </div>
      </td>
      <td className={`whitespace-nowrap border-b ${padX} py-3 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <FlowBadge type={primaryType} label={getHistoryDisplayLabel(first)} color={flowColor} />
      </td>
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
          <span className="truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
            {homogeneous ? first.item_name : `하위 ${group.logs.length}건 (혼합)`}
          </span>
        </div>
      </td>
      <td className="whitespace-nowrap border-b px-4 py-3 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
        <MovementSummaryCell summary={summary} />
      </td>
      <td className="hidden sm:table-cell whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <ActorCell name={actor} />
      </td>
      <td className="hidden sm:table-cell whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <MemoCell notes={first.notes} />
      </td>
    </tr>
  );
}

/**
 * operation_batch_id 기반 묶음 헤더.
 * batch (IoBatch) 가 cache hit 이면 정확한 from→to/title/포함·제외 라인 수 표시.
 * 없으면 TransactionLog 기반 추론으로 fallback.
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
  const actor = getHistoryActor(first);
  const flow = describeBatchFlow(first, batch);
  // 재작업(disassemble) 묶음은 빨간색 강제.
  const flowColor = isReworkOperation(first, batch) ? LEGACY_COLORS.red : transactionColor(primaryType);

  // 품목명 영역
  let titleText: string;
  if (batch && batch.bundles.length > 0) {
    const head = batch.bundles[0].title;
    titleText = batch.bundles.length > 1 ? `${head} 외 ${batch.bundles.length - 1}건` : head;
  } else {
    titleText = `${first.item_name} 외 ${group.logs.length - 1}건`;
  }

  // 변동요약 — 작업 종류별 의미 라벨. 부족 라인 있으면 빨간 경고 인라인.
  const summary = getHistoryMovementSummary(first, batch, group.logs.length);

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
      className="cursor-pointer select-none transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
      style={{
        background: selected ? "rgba(101,169,255,.14)" : "rgba(101,169,255,.08)",
        outline: selected ? `1.5px solid ${LEGACY_COLORS.blue}` : "none",
      }}
    >
      <td className={`whitespace-nowrap border-b ${padX} py-3 text-xs`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, transition: HISTORY_CELL_TRANSITION }}>
        <div className="flex items-center justify-center gap-1.5">
          <ChevronToggleBtn expanded={expanded} onToggle={onToggle} />
          {formatHistoryDate(first.created_at)}
        </div>
      </td>
      <td className={`whitespace-nowrap border-b ${padX} py-3 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <FlowBadge type={primaryType} label={flow.primary} color={flowColor} />
      </td>
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
          <span className="truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
            {titleText}
          </span>
        </div>
      </td>
      <td className="whitespace-nowrap border-b px-4 py-3 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
        <MovementSummaryCell summary={summary} />
      </td>
      <td className="hidden sm:table-cell whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <ActorCell name={actor} />
      </td>
      <td className="hidden sm:table-cell whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <MemoCell notes={first.notes} />
      </td>
    </tr>
  );
}
