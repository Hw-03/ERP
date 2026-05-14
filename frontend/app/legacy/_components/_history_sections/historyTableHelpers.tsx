"use client";

import {
  Activity, AlertCircle, ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine,
  BookmarkMinus, BookmarkPlus, ChevronDown, ChevronRight, Hammer, Layers,
  PackageX, Recycle, ShieldAlert, Sliders, Trash2, Undo2, Wrench,
} from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getTransactionLabel, transactionColor, transactionIconName } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";
import { formatHistoryDate } from "./historyShared";

const TX_ICON = {
  ArrowDownToLine, ArrowUpFromLine, Sliders, Hammer, Recycle, Trash2,
  AlertCircle, Wrench, Undo2, BookmarkPlus, BookmarkMinus, ArrowRightLeft,
  ShieldAlert, PackageX, Activity,
} as const;

function TypeBadge({ type, label, color }: { type: TransactionLog["transaction_type"] | null; label: string; color: string }) {
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
  // 1순위: operation_batch_id 기준 그룹
  const opBatches = new Map<string, TransactionLog[]>();
  // 2순위: reference_no 기준 그룹 (operation_batch_id 없는 레거시)
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

function RequesterCell({ name }: { name: string | null }) {
  if (!name) return <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>;
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

export function BatchHeader({
  group,
  expanded,
  onToggle,
}: {
  group: Extract<LogGroup, { type: "batch" }>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const first = group.logs[0];
  const totalQty = group.logs.reduce((s, l) => s + Number(l.quantity_change), 0);
  const primaryType = (group.logs.find((l) => l.transaction_type !== "BACKFLUSH") ?? first).transaction_type;
  const requesterName = first.requester_name ?? first.produced_by?.split("(")[0]?.trim() ?? null;

  return (
    <tr
      onClick={onToggle}
      className="cursor-pointer select-none hover:brightness-110"
      style={{ background: "rgba(101,169,255,.06)" }}
    >
      {/* 일시 */}
      <td className="whitespace-nowrap border-b px-4 py-3 text-xs" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
        <div className="flex items-center gap-1.5">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />}
          {formatHistoryDate(first.created_at)}
        </div>
      </td>
      {/* 구분 */}
      <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <TypeBadge
          type={primaryType}
          label={getTransactionLabel(primaryType)}
          color={transactionColor(primaryType)}
        />
      </td>
      {/* 품목명 → N건 묶음 */}
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <span className="text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
          {group.logs.length}건 묶음
        </span>
      </td>
      {/* 수량변화 */}
      <td className="whitespace-nowrap border-b px-4 py-3 text-right font-bold" style={{ borderColor: LEGACY_COLORS.border, color: totalQty >= 0 ? LEGACY_COLORS.green : LEGACY_COLORS.red }}>
        {totalQty >= 0 ? "+" : ""}{formatQty(totalQty)}
      </td>
      {/* 담당자 */}
      <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <RequesterCell name={requesterName} />
      </td>
      {/* 메모 */}
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
      </td>
    </tr>
  );
}

export function OpBatchHeader({
  group,
  expanded,
  onToggle,
}: {
  group: Extract<LogGroup, { type: "op_batch" }>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const first = group.logs[0];
  const primaryType = (group.logs.find((l) => l.transaction_type !== "BACKFLUSH") ?? first).transaction_type;
  const requesterName = first.requester_name ?? first.produced_by?.split("(")[0]?.trim() ?? null;

  return (
    <tr
      onClick={onToggle}
      className="cursor-pointer select-none hover:brightness-110"
      style={{ background: "rgba(101,169,255,.08)" }}
    >
      {/* 일시 */}
      <td className="whitespace-nowrap border-b px-4 py-3 text-xs" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
        <div className="flex items-center gap-1.5">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />}
          {formatHistoryDate(first.created_at)}
        </div>
      </td>
      {/* 구분 */}
      <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <TypeBadge
          type={primaryType}
          label={getTransactionLabel(primaryType)}
          color={transactionColor(primaryType)}
        />
      </td>
      {/* 품목명 → N건 묶음 */}
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
          <span className="text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
            {group.logs.length}건 묶음
          </span>
        </div>
      </td>
      {/* 수량변화 — 여러 품목 합산은 의미 없어 생략 */}
      <td className="whitespace-nowrap border-b px-4 py-3 text-right" style={{ borderColor: LEGACY_COLORS.border }}>
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
      </td>
      {/* 담당자 */}
      <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <RequesterCell name={requesterName} />
      </td>
      {/* 메모 */}
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
      </td>
    </tr>
  );
}
