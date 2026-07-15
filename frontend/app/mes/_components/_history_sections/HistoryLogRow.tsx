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
  HISTORY_MAIN_CELL_CLASS,
  HISTORY_MAIN_ROW_CLASS,
  ItemCodeCell,
  SpacerCell,
  PeopleStatusCell,
  QuantityStockCell,
  TargetSummaryBlock,
  ChevronToggleBtn,
} from "./historyTableHelpers";
import { isReworkOperation } from "./transactionTaxonomy";

type Props = {
  log: TransactionLog;
  selected: boolean;
  onSelect: (log: TransactionLog) => void;
  expanded?: boolean;
  onToggle?: () => void;
  controlsId?: string;
  separationHint?: string | null;
};

function HistoryLogRowImpl({ log, selected, onSelect, expanded, onToggle, controlsId, separationHint }: Props) {
  const [hovered, setHovered] = useState(false);
  const padX = "px-4";
  const targetPadX = "px-4";
  const flowPadX = "px-2";
  const quantityPadX = "px-4";
  const statusPadX = "px-4";
  const basePresentation = getHistoryRowPresentation(log);
  const presentation = separationHint
    ? { ...basePresentation, statusChips: [...basePresentation.statusChips, { label: separationHint, tone: "muted" as const }] }
    : basePresentation;
  const tcolor = isReworkOperation(log) ? LEGACY_COLORS.red : transactionColor(log.transaction_type);

  const rowBackground = selected
    ? tint(tcolor, hovered ? 18 : 10)
    : hovered
      ? tint(tcolor, 14)
      : undefined;

  const handleSelect = () => onSelect(log);

  return (
    <tr
      data-log-id={log.log_id}
      data-history-main-row="true"
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
      className={`${HISTORY_MAIN_ROW_CLASS} cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]${log.cancelled ? " opacity-60" : ""}`}
      style={{
        background: rowBackground,
        outline: selected ? `1.5px solid ${tcolor}` : "none",
        transition: "background-color 150ms cubic-bezier(.4,0,.2,1)",
      }}
    >
      <td
        className={`whitespace-nowrap ${HISTORY_MAIN_CELL_CLASS} ${padX} text-xs`}
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, transition: HISTORY_CELL_TRANSITION }}
      >
        <div className="flex items-center justify-center gap-1.5">
          {onToggle ? (
            <ChevronToggleBtn expanded={Boolean(expanded)} onToggle={onToggle} controlsId={controlsId} />
          ) : (
            <span aria-hidden className="inline-block h-5 w-5 shrink-0" />
          )}
          {formatHistoryDate(log.requested_at ?? log.created_at)}
        </div>
      </td>
      <td className={`whitespace-nowrap ${HISTORY_MAIN_CELL_CLASS} ${padX} text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <FlowBadge type={log.transaction_type} label={presentation.operation.label} color={tcolor} />
      </td>
      <td className={`${HISTORY_MAIN_CELL_CLASS} ${targetPadX}`} style={{ borderColor: LEGACY_COLORS.border }}>
        <TargetSummaryBlock
          presentation={presentation}
          icon={<Package className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />}
          cancelled={log.cancelled}
        />
      </td>
      <ItemCodeCell code={presentation.target.code} />
      <SpacerCell />
      <td className={`whitespace-nowrap ${HISTORY_MAIN_CELL_CLASS} ${flowPadX} text-center`} style={{ borderColor: LEGACY_COLORS.border }}>
        <FlowSummaryCell presentation={presentation} />
      </td>
      <td className={`whitespace-nowrap ${HISTORY_MAIN_CELL_CLASS} ${quantityPadX} text-center`} style={{ borderColor: LEGACY_COLORS.border }}>
        <QuantityStockCell presentation={presentation} cancelled={log.cancelled} />
      </td>
      <td className={`${HISTORY_MAIN_CELL_CLASS} ${statusPadX}`} style={{ borderColor: LEGACY_COLORS.border }}>
        <PeopleStatusCell presentation={presentation} />
      </td>
    </tr>
  );
}

export const HistoryLogRow = memo(HistoryLogRowImpl);
