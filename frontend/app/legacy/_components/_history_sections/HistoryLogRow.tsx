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
  PackageX,
  Recycle,
  ShieldAlert,
  Sliders,
  Trash2,
  Undo2,
  Wrench,
} from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import {
  LEGACY_COLORS,
  formatNumber,
  transactionColor,
  transactionIconName,
  transactionLabel,
} from "../legacyUi";
import { useDeptColor } from "../DepartmentsContext";
import { PROCESS_TYPE_META, formatHistoryDate, rowTint } from "./historyShared";

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
  copiedRef: string | null;
  onSelect: (log: TransactionLog) => void;
  onCopyRef: (ref: string, e: React.MouseEvent) => void;
};

function HistoryLogRowImpl({ log, selected, copiedRef, onSelect, onCopyRef }: Props) {
  const tcolor = transactionColor(log.transaction_type);
  const cat = PROCESS_TYPE_META[log.item_process_type_code ?? ""] ?? {
    label: log.item_process_type_code ?? "-",
    color: LEGACY_COLORS.muted2,
    bg: "rgba(157,173,199,.16)",
  };

  // 담당자 파싱
  const producedDept = log.produced_by ? log.produced_by.match(/\(([^)]+)\)/)?.[1] ?? "" : "";
  const deptColor = useDeptColor(producedDept || undefined);
  let producer: { name: string; color: string } | null = null;
  if (log.produced_by) {
    const name = log.produced_by.split("(")[0]?.trim() ?? "-";
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
        {formatHistoryDate(log.created_at)}
      </td>
      <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
          style={{ background: `color-mix(in srgb, ${tcolor} 14%, transparent)`, color: tcolor }}
        >
          <TxIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {transactionLabel(log.transaction_type)}
        </span>
      </td>
      <td className="max-w-[180px] border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-center gap-1.5">
          <div className="truncate font-semibold">{log.item_name}</div>
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
        className="whitespace-nowrap border-b px-4 py-3 text-xs"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        {log.erp_code ?? "-"}
      </td>
      <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <span
          className="inline-flex rounded-full px-2 py-0.5 text-xs font-bold"
          style={{ background: cat.bg, color: cat.color }}
        >
          {cat.label}
        </span>
      </td>
      <td
        className="whitespace-nowrap border-b px-4 py-3 text-right font-bold"
        style={{ borderColor: LEGACY_COLORS.border, color: tcolor }}
      >
        {Number(log.quantity_change) >= 0 ? "+" : ""}
        {formatNumber(log.quantity_change)}
      </td>
      <td
        className="whitespace-nowrap border-b px-4 py-3 text-xs"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        {log.quantity_before != null ? formatNumber(log.quantity_before) : "-"}
        <span className="mx-1">→</span>
        {log.quantity_after != null ? formatNumber(log.quantity_after) : "-"}
      </td>
      <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        {producer ? (
          <div className="flex items-center gap-1.5">
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
          <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            -
          </span>
        )}
      </td>
      <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        {log.reference_no ? (
          <button
            onClick={(e) => onCopyRef(log.reference_no!, e)}
            className="rounded border px-2 py-0.5 text-xs transition-all hover:brightness-110"
            style={{
              background: copiedRef === log.reference_no ? "rgba(67,211,157,.2)" : LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: copiedRef === log.reference_no ? LEGACY_COLORS.green : LEGACY_COLORS.muted2,
            }}
            title="클릭해서 복사"
          >
            {copiedRef === log.reference_no ? "복사됨!" : log.reference_no}
          </button>
        ) : (
          <span style={{ color: LEGACY_COLORS.muted2 }}>-</span>
        )}
      </td>
      <td
        className="max-w-[160px] border-b px-4 py-3"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        <div className="truncate text-xs">{log.notes || "-"}</div>
      </td>
    </tr>
  );
}

export const HistoryLogRow = memo(HistoryLogRowImpl);
