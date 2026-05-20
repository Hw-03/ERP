"use client";

import { memo } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  BookmarkMinus,
  BookmarkPlus,
  Hammer,
  Package,
  PackageX,
  Recycle,
  ShieldAlert,
  Sliders,
  Trash2,
  Undo2,
  Wrench,
} from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor, transactionIconName } from "@/lib/mes-status";
import { useDeptColor } from "../DepartmentsContext";
import { formatHistoryDate } from "./historyFormat";
import { rowTint } from "./historyTheme";
import { getHistoryDisplayLabel, getSingleLogMovement } from "./historyBatchInterpreter";
import { MemoCell, MovementSummaryCell } from "./historyTableHelpers";
import { isReworkOperation } from "./transactionTaxonomy";

const TX_ICON = {
  ArrowDownToLine,
  ArrowUpFromLine,
  Sliders,
  Hammer,
  Recycle,
  Trash2,
  AlertCircle,
  Wrench,
  Undo2,
  BookmarkPlus,
  BookmarkMinus,
  ArrowRightLeft,
  ShieldAlert,
  PackageX,
  Activity,
} as const;

type Props = {
  log: TransactionLog;
  selected: boolean;
  onSelect: (log: TransactionLog) => void;
};

function HistoryLogRowImpl({ log, selected, onSelect }: Props) {
  // 재작업(DISASSEMBLE)은 빨강 강제 — transactionColor 의 muted/회색 fallback 덮어씀.
  const tcolor = isReworkOperation(log) ? LEGACY_COLORS.red : transactionColor(log.transaction_type);

  // 담당자: requester_name 우선, 없으면 produced_by 파싱
  const rawName = log.requester_name ?? log.produced_by;
  const producedDept = rawName && !log.requester_name ? rawName.match(/\(([^)]+)\)/)?.[1] ?? "" : "";
  const deptColor = useDeptColor(producedDept || undefined);
  let producer: { name: string; color: string } | null = null;
  if (rawName) {
    const name = log.requester_name ? rawName : (rawName.split("(")[0]?.trim() ?? "-");
    producer = { name, color: producedDept ? deptColor : LEGACY_COLORS.muted2 };
  }

  // 5.5-G: keyboard nav 추가
  const handleSelect = () => onSelect(log);
  const TxIcon = TX_ICON[transactionIconName(log.transaction_type)];

  return (
    <tr
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      }}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      className="cursor-pointer transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
      style={{
        background: selected ? "rgba(101,169,255,.10)" : rowTint(log.transaction_type),
        outline: selected ? `1.5px solid ${LEGACY_COLORS.blue}` : "none",
      }}
    >
      <td
        className="whitespace-nowrap border-b px-4 py-3 text-xs"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        <div className="flex items-center justify-center gap-1.5">
          {/* 묶음 행 chevron 폭과 같은 spacer — 일시 정렬 축을 맞춤. */}
          <span aria-hidden className="inline-block h-5 w-5 shrink-0" />
          {formatHistoryDate(log.created_at)}
        </div>
      </td>
      <td className="whitespace-nowrap border-b px-4 py-3 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
        <span
          className="inline-flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-bold tracking-wide"
          style={{ background: `color-mix(in srgb, ${tcolor} 14%, transparent)`, color: tcolor }}
        >
          <TxIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {getHistoryDisplayLabel(log)}
        </span>
      </td>
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
          <span className="truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
            {log.item_name}
          </span>
          {(log.edit_count ?? 0) > 0 && (
            <span
              className="inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)`,
                color: LEGACY_COLORS.yellow,
              }}
              title={`${log.edit_count}회 수정됨`}
            >
              수정됨
            </span>
          )}
        </div>
      </td>
      <td
        className="whitespace-nowrap border-b px-4 py-3 text-center"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <MovementSummaryCell summary={{ parts: [getSingleLogMovement(log)] }} />
      </td>
      <td className="hidden sm:table-cell whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        {producer ? (
          <div className="flex items-center justify-center gap-1.5">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
              style={{ background: producer.color }}
            >
              {producer.name[0] ?? "?"}
            </span>
            <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {producer.name}
            </span>
          </div>
        ) : (
          <span className="block text-center text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            -
          </span>
        )}
      </td>
      <td className="hidden sm:table-cell whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <MemoCell notes={log.notes} />
      </td>
    </tr>
  );
}

export const HistoryLogRow = memo(HistoryLogRowImpl);
