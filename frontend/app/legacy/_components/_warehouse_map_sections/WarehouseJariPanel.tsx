"use client";

import type { WarehouseAngle, WarehouseBox } from "@/lib/api/warehouse-map";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { SIZE_LABEL, boxColor, cellKey, jariStacks } from "./helpers";

/** 칸(angle,row,layer) 상세 — SlidePanel 내용. 자리별 박스 스택 + 품목. */
export function WarehouseJariPanel({
  angle,
  row,
  layer,
  cellIndex,
  matchQuery,
}: {
  angle: WarehouseAngle;
  row: number;
  layer: number;
  cellIndex: Map<string, WarehouseBox[]>;
  matchQuery?: string;
}) {
  const stacks = jariStacks(cellIndex.get(cellKey(angle.id, row, layer)), angle.jaris_per_cell);
  const anyContent = stacks.some((s) => s.length > 0);
  const lq = (matchQuery || "").toLowerCase();

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        borderRadius: 24,
        background: LEGACY_COLORS.s1,
        border: `1px solid ${LEGACY_COLORS.border}`,
        boxShadow: "var(--c-card-shadow)",
        backgroundImage: "var(--c-panel-glow)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${LEGACY_COLORS.border}`, flexShrink: 0 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: LEGACY_COLORS.text }}>
          {row}줄 {layer}층
        </h3>
        <div style={{ fontSize: 12, color: LEGACY_COLORS.muted2, marginTop: 2 }}>
          {angle.label} · {row}줄 · {layer}층
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {!anyContent ? (
          <div style={{ color: LEGACY_COLORS.muted, fontSize: 13, padding: "28px 0", textAlign: "center" }}>
            이 칸은 비어있습니다
          </div>
        ) : (
          stacks.map((boxes, ji) => (
            <div key={ji} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: LEGACY_COLORS.muted2,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                자리 {ji + 1}
              </div>
              {boxes.length === 0 ? (
                <div style={{ color: LEGACY_COLORS.muted, fontSize: 13, padding: "2px 0" }}>비어있음</div>
              ) : (
                [...boxes].reverse().map((box) => {
                  const bc = boxColor(box) ?? LEGACY_COLORS.muted2;
                  return (
                  <div
                    key={box.box_id}
                    style={{
                      padding: "8px 10px",
                      background: LEGACY_COLORS.s2,
                      borderRadius: 10,
                      border: `1px solid ${LEGACY_COLORS.border}`,
                      borderLeft: `3px solid ${bc}`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        alignSelf: "flex-start",
                        fontSize: 10,
                        fontWeight: 700,
                        color: LEGACY_COLORS.muted2,
                        background: LEGACY_COLORS.s1,
                        border: `1px solid ${LEGACY_COLORS.border}`,
                        borderRadius: 6,
                        padding: "1px 7px",
                      }}
                    >
                      {SIZE_LABEL[box.size]}형 박스
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {box.items.map((it) => {
                        const match = lq && it.item_name.toLowerCase().includes(lq);
                        return (
                          <div
                            key={it.item_id}
                            style={{
                              background: LEGACY_COLORS.s1,
                              border: `1px solid ${match ? LEGACY_COLORS.blue : LEGACY_COLORS.border}`,
                              borderRadius: 8,
                              padding: "2px 8px",
                              fontSize: 12,
                              color: match ? LEGACY_COLORS.blue : LEGACY_COLORS.text,
                              fontWeight: match ? 700 : 400,
                            }}
                          >
                            {it.item_name} ×{it.quantity}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
