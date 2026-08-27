"use client";

import { useState } from "react";
import type { StockRequestLine } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import {
  getRequestQuantityPresentation,
  type RequestQuantityTone,
} from "./ioRequestLabels";

export interface StockRequestLineTableProps {
  lines: StockRequestLine[];
  collapseAfter?: number;
}

const QUANTITY_TONE_COLOR: Record<RequestQuantityTone, string> = {
  positive: LEGACY_COLORS.green,
  negative: LEGACY_COLORS.red,
  movement: LEGACY_COLORS.blue,
  neutral: LEGACY_COLORS.text,
};

/** 모델 길이와 관계없이 두 글자 공정 기호를 코드 열 중심축에 고정한다. */
function AlignedItemCode({ code }: { code: string }) {
  const match = code.match(/^([^-]+)-([A-Z]{2})-([^-]+)$/);
  if (!match) {
    return <span className="block min-w-0 truncate text-right">{code}</span>;
  }

  const [, model, process, serial] = match;
  return (
    <span className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
      <span className="min-w-0 truncate text-right">{model}-</span>
      <span>{process}</span>
      <span className="min-w-0 truncate text-left">-{serial}</span>
    </span>
  );
}

/** 요청 품목을 데스크톱 3열 표와 모바일 적층 행으로 일관되게 표시한다. */
export function StockRequestLineTable({ lines, collapseAfter }: StockRequestLineTableProps) {
  const [expanded, setExpanded] = useState(false);
  const canToggle = collapseAfter !== undefined && lines.length > collapseAfter;
  const visibleLines = canToggle && !expanded ? lines.slice(0, collapseAfter) : lines;

  return (
    <div
      className="mt-4 overflow-hidden rounded-[14px] border"
      style={{
        color: LEGACY_COLORS.text,
        borderColor: LEGACY_COLORS.border,
        background: LEGACY_COLORS.s1,
      }}
    >
      <div
        className="hidden grid-cols-[minmax(0,1fr)_14rem_9rem] gap-2 border-b px-3 py-2 text-xs font-bold lg:grid"
        style={{
          color: LEGACY_COLORS.muted2,
          borderColor: LEGACY_COLORS.border,
          background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 22%, ${LEGACY_COLORS.s1})`,
        }}
      >
        <span>품목명</span>
        <span className="text-center">품목 코드</span>
        <span className="text-right">요청 수량</span>
      </div>

      {visibleLines.map((line, index) => {
        const quantity = getRequestQuantityPresentation(line);
        const itemCode = line.mes_code_snapshot ?? "-";
        const isLastRow = index === visibleLines.length - 1;
        return (
          <div
            key={line.line_id}
            className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm transition-colors duration-150 hover:bg-[var(--c-s4)] lg:grid lg:grid-cols-[minmax(0,1fr)_14rem_9rem]"
            style={
              !isLastRow || canToggle
                ? { borderBottom: `1px solid ${LEGACY_COLORS.border}` }
                : undefined
            }
          >
            <span className="order-2 min-w-0 flex-1 font-medium lg:order-none lg:block">
              {line.item_name_snapshot}
            </span>
            <span
              className="order-1 shrink-0 text-xs lg:hidden"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {itemCode}
            </span>
            <span
              className="order-1 hidden min-w-0 text-sm lg:order-none lg:flex"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              <AlignedItemCode code={itemCode} />
            </span>
            <span
              className="order-3 ml-auto shrink-0 text-right font-black tabular-nums lg:order-none lg:ml-0"
              style={{ color: QUANTITY_TONE_COLOR[quantity.tone] }}
            >
              {quantity.text}
            </span>
          </div>
        );
      })}

      {canToggle && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="no-btn-inset min-h-11 w-full px-3 py-2 text-center text-sm font-bold underline-offset-2 hover:underline lg:min-h-0"
          style={{ color: LEGACY_COLORS.cyan }}
        >
          {expanded ? "접기" : `외 ${lines.length - collapseAfter}건 더보기`}
        </button>
      )}
    </div>
  );
}
