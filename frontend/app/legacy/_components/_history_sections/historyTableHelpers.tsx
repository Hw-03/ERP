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
import { formatQty } from "@/lib/mes/format";
import {
  formatHistoryDate,
  getHistoryActor,
  getHistoryFlowLabel,
} from "./historyShared";

const TX_ICON = {
  ArrowDownToLine, ArrowUpFromLine, Sliders, Hammer, Recycle, Trash2,
  AlertCircle, Wrench, Undo2, BookmarkPlus, BookmarkMinus, ArrowRightLeft,
  ShieldAlert, PackageX, Activity,
} as const;

function FlowBadge({
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
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
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
  if (!name || name === "-") return <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>;
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
        style={{ background: LEGACY_COLORS.muted2 }}
      >
        {name[0] ?? "?"}
      </span>
      <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{name}</span>
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
}: {
  group: Extract<LogGroup, { type: "batch" }>;
  expanded: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelect: () => void;
}) {
  const first = group.logs[0];
  const homogeneous = isHomogeneousItemGroup(group.logs);
  const totalQty = homogeneous
    ? group.logs.reduce((s, l) => s + Number(l.quantity_change), 0)
    : null;
  const primaryType = (group.logs.find((l) => l.transaction_type !== "BACKFLUSH") ?? first).transaction_type;
  const actor = getHistoryActor(first);
  const flowColor = transactionColor(primaryType);

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
      <td className="whitespace-nowrap border-b px-4 py-3 text-xs" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
        <div className="flex items-center gap-1.5">
          <ChevronToggleBtn expanded={expanded} onToggle={onToggle} />
          {formatHistoryDate(first.created_at)}
        </div>
      </td>
      <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <FlowBadge type={primaryType} label={getHistoryFlowLabel(first)} color={flowColor} />
      </td>
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
          <span className="truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
            {homogeneous ? first.item_name : `하위 ${group.logs.length}건 (혼합)`}
          </span>
        </div>
      </td>
      <td
        className="whitespace-nowrap border-b px-4 py-3 text-right font-bold"
        style={{
          borderColor: LEGACY_COLORS.border,
          color: totalQty == null
            ? LEGACY_COLORS.muted2
            : totalQty >= 0 ? LEGACY_COLORS.green : LEGACY_COLORS.red,
        }}
      >
        {totalQty == null
          ? <span className="text-xs">하위 {group.logs.length}건</span>
          : <>{totalQty >= 0 ? "+" : ""}{formatQty(totalQty)}</>}
      </td>
      <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <ActorCell name={actor} />
      </td>
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{first.notes ?? "-"}</span>
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
}: {
  group: Extract<LogGroup, { type: "op_batch" }>;
  expanded: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelect: () => void;
  batch?: IoBatch | null;
  /** visible 진입 감지용 ref. */
  rowRef?: (el: HTMLTableRowElement | null) => void;
}) {
  const first = group.logs[0];
  const primaryType = (group.logs.find((l) => l.transaction_type !== "BACKFLUSH") ?? first).transaction_type;
  const actor = getHistoryActor(first);
  const flowLabel = getHistoryFlowLabel(first, batch);
  const flowColor = transactionColor(primaryType);

  // 품목명 영역
  let titleText: string;
  if (batch && batch.bundles.length > 0) {
    const head = batch.bundles[0].title;
    titleText = batch.bundles.length > 1 ? `${head} 외 ${batch.bundles.length - 1}건` : head;
  } else {
    titleText = `${first.item_name} 외 ${group.logs.length - 1}건`;
  }

  // 수량 영역
  let qtyEl: React.ReactNode;
  if (batch) {
    let included = 0, excluded = 0, shortage = 0;
    for (const b of batch.bundles) {
      for (const l of b.lines) {
        if (l.included) included++; else excluded++;
        if (l.shortage > 0) shortage++;
      }
    }
    qtyEl = (
      <span className="whitespace-nowrap text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
        포함 {included} · 제외 {excluded}{shortage > 0 ? ` · 부족 ${shortage}` : ""}
      </span>
    );
  } else {
    qtyEl = <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>하위 {group.logs.length}건</span>;
  }

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
      <td className="whitespace-nowrap border-b px-4 py-3 text-xs" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
        <div className="flex items-center gap-1.5">
          <ChevronToggleBtn expanded={expanded} onToggle={onToggle} />
          {formatHistoryDate(first.created_at)}
        </div>
      </td>
      <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <FlowBadge type={primaryType} label={flowLabel} color={flowColor} />
      </td>
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
          <span className="truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
            {titleText}
          </span>
        </div>
      </td>
      <td className="whitespace-nowrap border-b px-4 py-3 text-right" style={{ borderColor: LEGACY_COLORS.border }}>
        {qtyEl}
      </td>
      <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <ActorCell name={actor} />
      </td>
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{first.notes ?? "-"}</span>
      </td>
    </tr>
  );
}
