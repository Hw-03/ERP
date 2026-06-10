"use client";

import clsx from "clsx";
import { MapPinned } from "lucide-react";
import type { WarehouseAngle, WarehouseBox } from "@/lib/api/warehouse-map";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { cellKey } from "../../_warehouse_map_sections/helpers";
import { TYPO } from "../tokens";

/** 창고 지도 모바일 — 앵글(구역) 목록. 탭하면 해당 앵글의 열×층 그리드로 진입. */
export function MobileAngleList({
  angles,
  cellIndex,
  onSelect,
}: {
  angles: WarehouseAngle[];
  cellIndex: Map<string, WarehouseBox[]>;
  onSelect: (id: number) => void;
}) {
  if (angles.length === 0) {
    return (
      <div className={TYPO.body} style={{ color: LEGACY_COLORS.muted2 }}>
        등록된 앵글이 없습니다.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {angles.map((a) => {
        let occupied = 0;
        for (let r = 1; r <= a.rows; r++) {
          for (let l = 1; l <= a.layers; l++) {
            if (cellIndex.get(cellKey(a.id, r, l))?.length) occupied++;
          }
        }
        const total = a.rows * a.layers;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a.id)}
            className="flex items-center gap-3 rounded-[18px] border px-4 py-3.5 text-left transition-[transform] active:scale-[0.98]"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
              style={{ background: `${LEGACY_COLORS.blue as string}1f`, color: LEGACY_COLORS.blue }}
            >
              <MapPinned size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className={clsx(TYPO.title, "truncate")} style={{ color: LEGACY_COLORS.text }}>
                {a.label}
              </div>
              <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                {a.rows}열 × {a.layers}층 · 점유 {occupied}/{total}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
