"use client";

import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { HISTORY_CELL_TRANSITION, ItemCodeCell, SpacerCell } from "./historyTableHelpers";
import { buildReworkItemSummaries, type ReworkItemSummary } from "./reworkSummary";

type Props = {
  logs: TransactionLog[];
  parentItemId: string;
  colSpan: number;
  compact?: boolean;
};

export function ReworkBatchDetail({ logs, colSpan, compact }: Props) {
  const summaries = buildReworkItemSummaries(logs);

  if (summaries.length === 0) {
    return (
      <tr>
        <td colSpan={colSpan} className="py-3 text-center text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          처리할 세부 품목이 없습니다.
        </td>
      </tr>
    );
  }

  return (
    <>
      {summaries.map((summary) => (
        <ReworkSummaryRow key={`${summary.itemId}-${summary.mesCode ?? ""}`} summary={summary} compact={compact} />
      ))}
    </>
  );
}

function ReworkSummaryRow({ summary, compact }: { summary: ReworkItemSummary; compact?: boolean }) {
  const padX = compact ? "px-2" : "px-4";
  const resultTone = summary.excluded ? LEGACY_COLORS.muted2 : summary.scrapQty > 0 ? LEGACY_COLORS.red : LEGACY_COLORS.green;

  return (
    <tr style={{ background: "color-mix(in srgb, var(--c-blue) 2%, transparent)" }}>
      <td className={`border-b ${padX} py-2`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
      <td className={`whitespace-nowrap border-b ${padX} py-2 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <span
          className="inline-flex min-w-[6.5rem] items-center justify-center rounded-full px-3 py-1 text-xs font-bold"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, transparent)`,
            color: LEGACY_COLORS.red,
          }}
        >
          처리결과
        </span>
      </td>
      <td className="border-b px-4 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="min-w-0 pl-5">
          <div className="truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
            {summary.itemName}
          </div>
        </div>
      </td>
      <ItemCodeCell code={summary.mesCode} compact={compact} dense />
      <SpacerCell compact={compact} dense />
      <td className="whitespace-nowrap border-b px-5 py-2 text-center text-xs font-semibold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
        재작업
      </td>
      <td className="whitespace-nowrap border-b px-4 py-2 text-center text-xs font-bold" style={{ borderColor: LEGACY_COLORS.border, color: resultTone }}>
        {summary.resultLabel}
      </td>
      <td className="border-b px-4 py-2 text-xs" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
        -
      </td>
    </tr>
  );
}
