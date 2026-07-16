"use client";

import { useState } from "react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TruncatedText } from "@/lib/ui/TruncatedText";
import { ChevronToggleBtn, HISTORY_CELL_TRANSITION, HISTORY_TABLE_OPERATION_PILL_CLASS, ItemCodeCell } from "./historyTableHelpers";
import { buildReworkItemSummaries, type ReworkItemSummary, type ReworkResultTone } from "./reworkSummary";

const REWORK_RESULT_LABEL = "처리결과";
const REWORK_RESULT_TONE_COLORS: Record<ReworkResultTone, string> = {
  danger: LEGACY_COLORS.red,
  success: LEGACY_COLORS.green,
  muted: LEGACY_COLORS.muted2,
};

type Props = {
  logs: TransactionLog[];
  parentItemId: string;
  colSpan: number;
  compact?: boolean;
  controlsId?: string;
  cancelled?: boolean;
};

export function ReworkBatchDetail({ logs, colSpan, compact, controlsId, cancelled = false }: Props) {
  const summaries = buildReworkItemSummaries(logs);
  const [expanded, setExpanded] = useState(false);

  if (summaries.length === 0) {
    return (
      <tr id={controlsId}>
        <td colSpan={colSpan} className="py-3 text-center text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          처리할 세부 품목이 없습니다.
        </td>
      </tr>
    );
  }

  if (summaries.length === 1) {
    return <ReworkSummaryRow summary={summaries[0]} title={getResultTitle(summaries[0])} compact={compact} rowId={controlsId} cancelled={cancelled} />;
  }

  const [first] = summaries;
  const detailId = `${controlsId ?? "history-rework"}-items`;
  return (
    <>
      <ReworkSummaryRow summary={first} title={getResultTitle(first)} compact={compact} rowId={controlsId} cancelled={cancelled} expanded={expanded} onToggle={() => setExpanded((value) => !value)} controlsId={detailId} />
      {expanded && summaries.map((summary, index) => (
        <ReworkSummaryRow
          key={`${summary.itemId}-${summary.mesCode ?? ""}`}
          summary={summary}
          title={summary.itemName}
          compact={compact}
          rowId={index === 0 ? detailId : undefined}
          cancelled={cancelled}
        />
      ))}
    </>
  );
}

function getResultTitle(summary: ReworkItemSummary): string {
  return summary.resultParts.length === 1 && summary.resultParts[0].label.startsWith("폐기 ")
    ? "폐기 결과"
    : summary.itemName;
}

function ReworkSummaryRow({ summary, title, compact, rowId, cancelled, expanded, onToggle, controlsId }: { summary: ReworkItemSummary; title?: string; compact?: boolean; rowId?: string; cancelled: boolean; expanded?: boolean; onToggle?: () => void; controlsId?: string }) {
  const padX = compact ? "px-2" : "px-4";
  const displayTitle = title ?? summary.itemName;

  return (
    <tr id={rowId} className={cancelled ? "opacity-60" : undefined} style={{ background: "color-mix(in srgb, var(--c-blue) 2%, transparent)" }}>
      <td className={`border-b ${padX} py-2`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
      <td className={`whitespace-nowrap border-b ${padX} py-2 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <ResultBadge compact={compact} />
      </td>
      <td className="border-b px-4 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex min-w-0 items-center gap-2">
          {onToggle ? <ChevronToggleBtn label="처리결과 구성" expanded={expanded ?? false} onToggle={onToggle} controlsId={controlsId} /> : <span aria-hidden className="h-5 w-5 shrink-0" />}
          <TruncatedText
            accessibilityLabel={displayTitle}
            className={`truncate text-xs font-semibold${cancelled ? " line-through" : ""}`}
            style={{ color: LEGACY_COLORS.text }}
          >
            {displayTitle}
          </TruncatedText>
        </div>
      </td>
      <ItemCodeCell code={summary.mesCode} compact={compact} dense />
      <td className="whitespace-nowrap border-b px-4 py-2 text-center text-xs font-bold" style={{ borderColor: LEGACY_COLORS.border }}>
        {summary.resultParts.map((part, index) => (
          <span key={`${part.tone}-${part.label}`}>
            {index > 0 && (
              <span aria-hidden className={cancelled ? "line-through" : undefined} style={{ color: LEGACY_COLORS.muted2 }}>
                {" · "}
              </span>
            )}
            <span className={cancelled ? "line-through" : undefined} style={{ color: REWORK_RESULT_TONE_COLORS[part.tone] }}>
              {part.label}
            </span>
          </span>
        ))}
      </td>
      <td className="border-b px-4 py-2 text-xs" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
        -
      </td>
    </tr>
  );
}

function ResultBadge({ compact }: { compact?: boolean }) {
  return (
    <span
      aria-label={compact ? REWORK_RESULT_LABEL : undefined}
      title={compact ? REWORK_RESULT_LABEL : undefined}
      className={`inline-flex h-6 items-center justify-center rounded-full px-3 text-xs font-bold leading-none ${HISTORY_TABLE_OPERATION_PILL_CLASS}`}
      style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, transparent)`, color: LEGACY_COLORS.red }}
    >
      {compact ? <span className="min-w-0 max-w-full truncate">{REWORK_RESULT_LABEL}</span> : REWORK_RESULT_LABEL}
    </span>
  );
}
