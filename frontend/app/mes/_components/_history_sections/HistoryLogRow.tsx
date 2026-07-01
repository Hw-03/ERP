"use client";

import { memo, useState } from "react";
import { Package } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { transactionColor } from "@/lib/mes-status";
import { formatHistoryDate } from "./historyFormat";
import { getHistoryRowPresentation } from "./historyPresentation";
import {
  FlowBadge,
  FlowSummaryCell,
  HISTORY_CELL_TRANSITION,
  PeopleStatusCell,
  QuantityStockCell,
  TargetSummaryBlock,
} from "./historyTableHelpers";
import { isReworkOperation } from "./transactionTaxonomy";

type Props = {
  log: TransactionLog;
  selected: boolean;
  onSelect: (log: TransactionLog) => void;
  /** 우측 패널 열림 — 일시/구분 셀 좌우 패딩 압축. */
  compact?: boolean;
};

function HistoryLogRowImpl({ log, selected, onSelect, compact }: Props) {
  const [hovered, setHovered] = useState(false);
  const padX = compact ? "px-2" : "px-4";
  const presentation = getHistoryRowPresentation(log);
  const tcolor = isReworkOperation(log) ? LEGACY_COLORS.red : transactionColor(log.transaction_type);

  const rowBackground = selected
    ? tint(LEGACY_COLORS.blue, hovered ? 18 : 10)
    : hovered
      ? tint(tcolor, 14)
      : undefined;

  const handleSelect = () => onSelect(log);

  return (
    <tr
      data-log-id={log.log_id}
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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
      style={{
        background: rowBackground,
        outline: selected ? `1.5px solid ${LEGACY_COLORS.blue}` : "none",
        transition: "background-color 150ms cubic-bezier(.4,0,.2,1)",
      }}
    >
      <td
        className={`whitespace-nowrap border-b ${padX} py-3 text-xs`}
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, transition: HISTORY_CELL_TRANSITION }}
      >
        <div className="flex items-center justify-center gap-1.5">
          <span aria-hidden className="inline-block h-5 w-5 shrink-0" />
          {formatHistoryDate(log.requested_at ?? log.created_at)}
        </div>
      </td>
      <td className={`whitespace-nowrap border-b ${padX} py-3 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <FlowBadge type={log.transaction_type} label={presentation.operation.label} color={tcolor} />
      </td>
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <TargetSummaryBlock
          presentation={presentation}
          icon={<Package className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />}
        />
      </td>
      <td className="whitespace-nowrap border-b px-4 py-3 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
        <FlowSummaryCell presentation={presentation} />
      </td>
      <td className="whitespace-nowrap border-b px-4 py-3 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
        <QuantityStockCell presentation={presentation} />
      </td>
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <PeopleStatusCell presentation={presentation} />
      </td>
    </tr>
  );
}

export const HistoryLogRow = memo(HistoryLogRowImpl);