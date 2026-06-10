"use client";

import clsx from "clsx";
import type { WarehouseAngle, WarehouseBox } from "@/lib/api/warehouse-map";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { jariStacks, rowLabel, SIZE_LABEL } from "../../_warehouse_map_sections/helpers";
import { SheetHeader } from "../primitives";
import { TYPO } from "../tokens";

/** 셀(열·층) 상세 — 자리별 박스 스택과 품목. 보기 전용(편집 없음). */
export function MobileJariSheet({
  angle,
  row,
  layer,
  cellBoxes,
  matchQuery,
  onClose,
}: {
  angle: WarehouseAngle;
  row: number;
  layer: number;
  cellBoxes: WarehouseBox[] | undefined;
  matchQuery: string;
  onClose: () => void;
}) {
  const stacks = jariStacks(cellBoxes, angle.jaris_per_cell);
  const q = matchQuery.trim().toLowerCase();
  const isMatch = (name: string, code: string | null) =>
    !!q && (name.toLowerCase().includes(q) || (code ?? "").toLowerCase().includes(q));
  const empty = stacks.every((s) => s.length === 0);

  return (
    <BottomSheet open onClose={onClose} ariaLabel="자리 상세">
      <SheetHeader
        title={`${angle.label} · ${rowLabel(row)}열 ${layer}층`}
        subtitle="자리별 박스"
        onClose={onClose}
      />
      <div className="flex flex-col gap-3 px-5 pb-4">
        {empty ? (
          <div className={TYPO.body} style={{ color: LEGACY_COLORS.muted2 }}>
            이 칸에 배치된 박스가 없습니다.
          </div>
        ) : (
          stacks.map((stack, ji) => (
            <div
              key={ji}
              className="rounded-[16px] border p-3"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div className={clsx(TYPO.overline, "mb-2")} style={{ color: LEGACY_COLORS.muted2 }}>
                자리 {ji + 1}
              </div>
              {stack.length === 0 ? (
                <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                  비어 있음
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {stack.map((box) => (
                    <div
                      key={box.box_id}
                      className="rounded-[12px] border p-2.5"
                      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                    >
                      <div className={clsx(TYPO.caption, "mb-1 font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
                        {SIZE_LABEL[box.size] ?? box.size} 박스
                      </div>
                      {box.items.length === 0 ? (
                        <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                          품목 없음
                        </div>
                      ) : (
                        box.items.map((it) => {
                          const hit = isMatch(it.item_name, it.mes_code);
                          return (
                            <div key={it.item_id} className="flex items-center justify-between gap-2 py-0.5">
                              <div className="min-w-0 flex-1">
                                <div
                                  className={clsx(TYPO.body, "truncate", hit && "font-black")}
                                  style={{ color: hit ? LEGACY_COLORS.blue : LEGACY_COLORS.text }}
                                >
                                  {it.item_name}
                                </div>
                                <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                                  {it.mes_code ?? "-"}
                                  {it.department ? ` · ${it.department}` : ""}
                                </div>
                              </div>
                              <span
                                className={clsx(TYPO.body, "shrink-0 font-black tabular-nums")}
                                style={{ color: LEGACY_COLORS.text }}
                              >
                                ×{formatQty(it.quantity)}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </BottomSheet>
  );
}
