"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getTransactionLabel } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";
import { formatHistoryDate } from "./historyShared";

/**
 * Round-13 (#10) 추출 — HistoryTable 의 batch 그룹 빌더 + BatchHeader sub-component.
 */

export type LogGroup =
  | { type: "solo"; log: TransactionLog }
  | { type: "batch"; refNo: string; logs: TransactionLog[] };

export function buildGroups(logs: TransactionLog[]): LogGroup[] {
  const batches = new Map<string, TransactionLog[]>();

  for (const log of logs) {
    if (log.reference_no) {
      const group = batches.get(log.reference_no);
      if (group) group.push(log);
      else batches.set(log.reference_no, [log]);
    }
  }

  const groups: LogGroup[] = [];
  const seen = new Set<string>();
  for (const log of logs) {
    if (!log.reference_no) {
      groups.push({ type: "solo", log });
    } else if (!seen.has(log.reference_no)) {
      seen.add(log.reference_no);
      groups.push({ type: "batch", refNo: log.reference_no, logs: batches.get(log.reference_no)! });
    }
  }
  return groups;
}

export function BatchHeader({
  group,
  expanded,
  onToggle,
  colSpan,
}: {
  group: Extract<LogGroup, { type: "batch" }>;
  expanded: boolean;
  onToggle: () => void;
  colSpan: number;
}) {
  const first = group.logs[0];
  const totalQty = group.logs.reduce((s, l) => s + Number(l.quantity_change), 0);
  const allSameType = group.logs.every((l) => l.transaction_type === first.transaction_type);
  const typeSummary = allSameType ? getTransactionLabel(first.transaction_type) : "혼합";

  return (
    <tr
      onClick={onToggle}
      className="cursor-pointer select-none hover:brightness-110"
      style={{ background: "rgba(101,169,255,.06)" }}
    >
      <td
        colSpan={colSpan}
        className="border-b px-4 py-2.5"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
          )}
          <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            {formatHistoryDate(first.created_at)}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-bold"
            style={{ background: "rgba(101,169,255,.16)", color: LEGACY_COLORS.blue }}
          >
            {typeSummary}
          </span>
          <span className="text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
            {first.produced_by?.split("(")[0]?.trim() ?? "-"}
          </span>
          <span
            className="rounded-full border px-2 py-0.5 text-[10px] font-bold"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          >
            #{group.refNo}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              {group.logs.length}건
            </span>
            <span
              className="text-sm font-black"
              style={{ color: totalQty >= 0 ? LEGACY_COLORS.green : LEGACY_COLORS.red }}
            >
              {totalQty >= 0 ? "+" : ""}{formatQty(totalQty)}
            </span>
          </span>
        </div>
      </td>
    </tr>
  );
}
