"use client";

import { useState } from "react";
import { Layers, Wrench } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import { getHistoryActor } from "./historyBatchInterpreter";
import { formatHistoryDate } from "./historyFormat";
import { ChevronToggleBtn, HISTORY_CELL_TRANSITION, type LogGroup } from "./historyTableHelpers";

type Props = {
  group: Extract<LogGroup, { type: "batch" }>;
  expanded: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
};

export function ReworkBatchHeader({ group, expanded, onToggle, selected, onSelect, compact }: Props) {
  const padX = compact ? "px-2" : "px-4";
  const parentLog = group.logs.find((l) => l.transaction_type === "DISASSEMBLE") ?? group.logs[0];
  const childCount = group.logs.filter((l) => l.transaction_type !== "DISASSEMBLE").length;
  const qty = Math.abs(parentLog.quantity_change);
  const actor = getHistoryActor(parentLog);
  const [hovered, setHovered] = useState(false);

  // 평상시엔 채우기 없음. 재작업은 빨강 정체성 유지 — 호버/선택 모두 빨강 동색 강조.
  const rowBackground = selected
    ? tint(LEGACY_COLORS.red, hovered ? 18 : 12)
    : hovered
      ? tint(LEGACY_COLORS.red, 14)
      : undefined;

  return (
    <tr
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); }
      }}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="cursor-pointer select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
      style={{
        background: rowBackground,
        outline: selected ? `1.5px solid ${LEGACY_COLORS.red}` : "none",
        transition: "background-color 150ms cubic-bezier(.4,0,.2,1)",
      }}
    >
      {/* 일시 */}
      <td
        className={`whitespace-nowrap border-b ${padX} py-3 text-xs`}
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, transition: HISTORY_CELL_TRANSITION }}
      >
        <div className="flex items-center justify-center gap-1.5">
          <ChevronToggleBtn expanded={expanded} onToggle={onToggle} />
          {formatHistoryDate(parentLog.created_at)}
        </div>
      </td>
      {/* 구분 */}
      <td
        className={`whitespace-nowrap border-b ${padX} py-3 text-center`}
        style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}
      >
        <span
          className="inline-flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-bold tracking-wide"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`,
            color: LEGACY_COLORS.red,
          }}
        >
          <Wrench className="h-3.5 w-3.5" />
          재작업
        </span>
      </td>
      {/* 품목명 */}
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.red }} />
          <span className="truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
            {parentLog.item_name} 재작업 ({childCount}종 처리)
          </span>
        </div>
      </td>
      {/* 변동요약 */}
      <td className="whitespace-nowrap border-b px-4 py-3 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
        <span
          className="inline-flex min-w-[10.5rem] justify-center rounded-full px-3 py-1 text-xs font-bold tracking-wide"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 18%, transparent)`,
            color: `color-mix(in srgb, ${LEGACY_COLORS.red} 42%, ${LEGACY_COLORS.text})`,
          }}
        >
          재작업 {formatQty(qty)} {parentLog.item_unit}
        </span>
      </td>
      {/* 요청자 */}
      <td
        className="hidden sm:table-cell whitespace-nowrap border-b px-4 py-3"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        {actor !== "-" ? (
          <span className="block text-center text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>{actor}</span>
        ) : (
          <span className="block text-center text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
        )}
      </td>
      {/* 메모 */}
      <td
        className="hidden sm:table-cell whitespace-nowrap border-b px-4 py-3"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <span className="block text-center text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
      </td>
    </tr>
  );
}
