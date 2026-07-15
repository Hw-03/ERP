"use client";

import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TruncatedText } from "@/lib/ui/TruncatedText";
import { HISTORY_CELL_TRANSITION, ItemCodeCell } from "./historyTableHelpers";
import { buildReworkItemSummaries, type ReworkItemSummary } from "./reworkSummary";

const REWORK_RESULT_LABEL = "처리결과";

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

  if (summaries.length === 0) {
    return (
      <tr id={controlsId}>
        <td colSpan={colSpan} className="py-3 text-center text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          처리할 세부 품목이 없습니다.
        </td>
      </tr>
    );
  }

  return (
    <>
      {summaries.map((summary, index) => (
        <ReworkSummaryRow
          key={`${summary.itemId}-${summary.mesCode ?? ""}`}
          summary={summary}
          compact={compact}
          rowId={index === 0 ? controlsId : undefined}
          cancelled={cancelled}
        />
      ))}
    </>
  );
}

function ReworkSummaryRow({ summary, compact, rowId, cancelled }: { summary: ReworkItemSummary; compact?: boolean; rowId?: string; cancelled: boolean }) {
  const padX = compact ? "px-2" : "px-4";
  const resultTone = summary.excluded ? LEGACY_COLORS.muted2 : summary.scrapQty > 0 ? LEGACY_COLORS.red : LEGACY_COLORS.green;

  return (
    <tr id={rowId} className={cancelled ? "opacity-60" : undefined} style={{ background: "color-mix(in srgb, var(--c-blue) 2%, transparent)" }}>
      <td className={`border-b ${padX} py-2`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
      <td className={`whitespace-nowrap border-b ${padX} py-2 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <span
          aria-label={compact ? REWORK_RESULT_LABEL : undefined}
          title={compact ? REWORK_RESULT_LABEL : undefined}
          className={`inline-flex items-center justify-center rounded-full py-1 text-xs font-bold ${
            compact
              ? "w-full max-w-full min-w-0 overflow-hidden px-2"
              : "min-w-[6.5rem] px-3"
          }`}
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, transparent)`,
            color: LEGACY_COLORS.red,
          }}
        >
          {compact
            ? <span className="min-w-0 max-w-full truncate">{REWORK_RESULT_LABEL}</span>
            : REWORK_RESULT_LABEL}
        </span>
      </td>
      <td className="border-b px-4 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="min-w-0 pl-5">
          <TruncatedText
            accessibilityLabel={summary.itemName}
            className={`truncate text-xs font-semibold${cancelled ? " line-through" : ""}`}
            style={{ color: LEGACY_COLORS.text }}
          >
            {summary.itemName}
          </TruncatedText>
        </div>
      </td>
      <ItemCodeCell code={summary.mesCode} compact={compact} dense />
      <td className={`whitespace-nowrap border-b px-4 py-2 text-center text-xs font-bold${cancelled ? " line-through" : ""}`} style={{ borderColor: LEGACY_COLORS.border, color: resultTone }}>
        {summary.resultLabel}
      </td>
      <td className="border-b px-4 py-2 text-xs" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
        -
      </td>
    </tr>
  );
}
