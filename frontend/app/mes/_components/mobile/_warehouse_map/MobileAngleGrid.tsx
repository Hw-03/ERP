"use client";

import { useState } from "react";
import clsx from "clsx";
import type { WarehouseAngle, WarehouseBox } from "@/lib/api/warehouse-map";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { cellColor, cellKey, rowLabel, stackUnits } from "../../_warehouse_map_sections/helpers";
import { SegmentedControl, SubScreenHeader, type SegmentedTab } from "../primitives";
import { TYPO } from "../tokens";

/**
 * 선택한 앵글의 열×층 셀. 393px 에서 전체 그리드는 셀이 너무 작아지므로
 * 열(행)을 SegmentedControl 로 고른 뒤 해당 열의 층을 세로 리스트로 표시.
 * 점유 셀은 부서색(데이터 유래) 채움, 빈 칸은 점선. 보기 전용.
 */
export function MobileAngleGrid({
  angle,
  cellIndex,
  onBack,
  onOpenCell,
}: {
  angle: WarehouseAngle;
  cellIndex: Map<string, WarehouseBox[]>;
  onBack: () => void;
  onOpenCell: (row: number, layer: number) => void;
}) {
  const rows = Array.from({ length: angle.rows }, (_, i) => i + 1);
  const layers = Array.from({ length: angle.layers }, (_, i) => i + 1);
  const [curRow, setCurRow] = useState(1);

  const rowTabs: SegmentedTab[] = rows.map((r) => ({ id: String(r), label: `${rowLabel(r)}열` }));

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ background: LEGACY_COLORS.bg }}>
      <SubScreenHeader title={angle.label} subtitle="창고 지도" onBack={onBack} />
      <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-6 pt-3">
        {rows.length > 1 && (
          <SegmentedControl
            tabs={rowTabs}
            active={String(curRow)}
            onChange={(v) => setCurRow(Number(v))}
          />
        )}
        <div className="flex flex-col gap-2">
          {layers.map((l) => {
            const boxes = cellIndex.get(cellKey(angle.id, curRow, l));
            const occupied = !!boxes?.length;
            const color = cellColor(boxes);
            const units = boxes ? stackUnits(boxes) : 0;
            const itemCount = boxes ? boxes.reduce((s, b) => s + b.items.length, 0) : 0;
            return (
              <button
                key={l}
                type="button"
                disabled={!occupied}
                onClick={() => onOpenCell(curRow, l)}
                className="flex items-center gap-3 rounded-[16px] border px-4 py-3 text-left transition-[transform] active:scale-[0.98] disabled:opacity-60"
                style={{
                  background:
                    occupied && color
                      ? `color-mix(in srgb, ${color} 12%, ${LEGACY_COLORS.s2})`
                      : LEGACY_COLORS.s2,
                  borderColor:
                    occupied && color
                      ? `color-mix(in srgb, ${color} 40%, ${LEGACY_COLORS.border})`
                      : LEGACY_COLORS.border,
                  borderStyle: occupied ? "solid" : "dashed",
                }}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
                  style={{
                    background: occupied && color ? color : LEGACY_COLORS.s3,
                    color: occupied ? LEGACY_COLORS.white : LEGACY_COLORS.muted2,
                  }}
                >
                  <span className={clsx(TYPO.title, "font-black")}>{l}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className={clsx(TYPO.body, "font-black")} style={{ color: LEGACY_COLORS.text }}>
                    {rowLabel(curRow)}열 {l}층
                  </div>
                  <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                    {occupied ? `박스 ${boxes!.length} · 품목 ${itemCount} · ${units}칸` : "빈 칸"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
