"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatHistoryDate } from "./historyFormat";
import {
  ChevronToggleBtn,
  FlowBadge,
  HISTORY_CELL_TRANSITION,
  HISTORY_MAIN_CELL_CLASS,
  HISTORY_MAIN_ROW_CLASS,
  HISTORY_STATUS_CELL_CLASS,
  ItemCodeCell,
  PeopleStatusCell,
  StockSnapshotCell,
  TargetSummaryBlock,
  getAdditionalDistinctItemCount,
  type LogGroup,
} from "./historyTableHelpers";
import { getHistoryListOperationLabel, getHistoryRowPresentation, type HistoryRowPresentation } from "./historyPresentation";

type Props = {
  group: Extract<LogGroup, { type: "batch" }>;
  expanded: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
  controlsId?: string;
};

export function ReworkBatchHeader({ group, expanded, onToggle, selected, onSelect, compact, controlsId }: Props) {
  const padX = compact ? "px-2" : "px-4";
  const targetPadX = compact ? "px-2" : "px-4";
  const statusPadX = "px-2";
  const parentLog = group.logs.find((l) => l.transaction_type === "DISASSEMBLE") ?? group.logs[0];
  const additionalItemCount = getAdditionalDistinctItemCount(group.logs, parentLog);
  const operationLabel = getHistoryListOperationLabel(parentLog);
  const cancelled = group.logs.some((log) => log.cancelled);
  const qty = Math.abs(parentLog.quantity_change);
  const unit = parentLog.item_unit?.trim();
  const basePresentation = getHistoryRowPresentation(parentLog);
  const presentation: HistoryRowPresentation = {
    ...basePresentation,
    operation: {
      ...basePresentation.operation,
      label: operationLabel,
    },
    target: {
      ...basePresentation.target,
      title: parentLog.item_name,
      code: parentLog.mes_code,
      meta: [],
    },
    movement: {
      parts: [{ label: `${operationLabel} ${qty}${unit ? ` ${unit}` : ""}`, tone: "danger" }],
    },
    flow: {
      label: operationLabel,
    },
  };
  const [hovered, setHovered] = useState(false);

  const rowBackground = selected
    ? tint(LEGACY_COLORS.red, hovered ? 18 : 12)
    : hovered
      ? tint(LEGACY_COLORS.red, 14)
      : undefined;

  return (
    <tr
      data-history-main-row="true"
      data-history-cancelled={cancelled || undefined}
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
      className={`${HISTORY_MAIN_ROW_CLASS} cursor-pointer select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]`}
      style={{
        background: rowBackground,
        outline: selected ? `1.5px solid ${LEGACY_COLORS.red}` : "none",
        transition: "background-color 150ms cubic-bezier(.4,0,.2,1)",
      }}
    >
      <td
        className={`whitespace-nowrap ${HISTORY_MAIN_CELL_CLASS} ${padX} text-xs`}
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, transition: HISTORY_CELL_TRANSITION }}
      >
        <div className="flex items-center justify-center gap-1.5">
          <ChevronToggleBtn expanded={expanded} onToggle={onToggle} controlsId={controlsId} />
          {formatHistoryDate(parentLog.created_at)}
        </div>
      </td>
      <td
        className={`whitespace-nowrap ${HISTORY_MAIN_CELL_CLASS} ${padX} text-center`}
        style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}
      >
        <FlowBadge type={parentLog.transaction_type} label={operationLabel} color={LEGACY_COLORS.red} compact={compact} />
      </td>
      <td className={`${HISTORY_MAIN_CELL_CLASS} ${targetPadX}`} style={{ borderColor: LEGACY_COLORS.border }}>
        <TargetSummaryBlock
          presentation={presentation}
          icon={<Wrench className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.red }} />}
          additionalItemCount={additionalItemCount}
        />
      </td>
      <ItemCodeCell
        code={presentation.target.code}
        compact={compact}
      />
      <StockSnapshotCell log={parentLog} />
      <td className={`${HISTORY_STATUS_CELL_CLASS} ${statusPadX}`} style={{ borderColor: LEGACY_COLORS.border }}>
        <PeopleStatusCell presentation={presentation} />
      </td>
    </tr>
  );
}
