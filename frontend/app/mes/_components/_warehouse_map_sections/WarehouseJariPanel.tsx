"use client";

import { Plus, Trash2 } from "lucide-react";
import type { WarehouseAngle, WarehouseBox } from "@/lib/api/warehouse-map";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { JARI_CAPACITY, SIZE_LABEL, boxColor, cellKey, jariStacks, rowLabel, stackUnits } from "./helpers";

interface Props {
  angle: WarehouseAngle;
  row: number;
  layer: number;
  cellIndex: Map<string, WarehouseBox[]>;
  matchQuery?: string;
  /** 편집 모드(관리자 위치 배정). 미전달 시 보기 전용 — 공개 창고지도와 동일 동작. */
  editable?: boolean;
  busy?: boolean;
  /** 빈 자리의 "박스 넣기" 클릭 시 호출 — 부모가 AddBox 화면으로 전환. 미전달 시 버튼 숨김. */
  onRequestAddBox?: (jariIndex: number, remaining: number) => void;
  onDeleteBox?: (boxId: string) => Promise<void>;
}

/** 칸(angle,row,layer) 상세 — SlidePanel 내용. 자리별 박스 스택 + 품목. editable 이면 박스 넣기/빼기 가능. */
export function WarehouseJariPanel({
  angle,
  row,
  layer,
  cellIndex,
  matchQuery,
  editable = false,
  busy = false,
  onRequestAddBox,
  onDeleteBox,
}: Props) {
  const stacks = jariStacks(cellIndex.get(cellKey(angle.id, row, layer)), angle.jaris_per_cell);
  const anyContent = stacks.some((s) => s.length > 0);
  const lq = (matchQuery || "").toLowerCase();

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        height: "100%",
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
      <div style={{ padding: "16px 16px 14px", borderBottom: `1px solid ${LEGACY_COLORS.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: LEGACY_COLORS.text, letterSpacing: -0.5, lineHeight: 1.2 }}>
          {angle.label} · {rowLabel(row)}열 · {layer}층
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {!editable && !anyContent ? (
          <div style={{ color: LEGACY_COLORS.muted, fontSize: 13, padding: "28px 0", textAlign: "center" }}>
            이 칸은 비어있습니다
          </div>
        ) : (
          stacks.map((boxes, ji) => {
            const remaining = JARI_CAPACITY - stackUnits(boxes);
            return (
              <div key={`${row}-${layer}-${ji}`} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
                  {editable && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: remaining > 0 ? LEGACY_COLORS.muted2 : LEGACY_COLORS.muted }}>
                      남은 {remaining}
                    </div>
                  )}
                </div>

                {boxes.length === 0 && !editable ? (
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
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                          <div
                            style={{
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
                          {editable && onDeleteBox && (
                            <button
                              type="button"
                              onClick={() => onDeleteBox(box.box_id)}
                              disabled={busy}
                              aria-label="박스 빼기"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                color: LEGACY_COLORS.muted2,
                                cursor: busy ? "not-allowed" : "pointer",
                                opacity: busy ? 0.4 : 1,
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
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

                {editable && onRequestAddBox && remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => onRequestAddBox(ji, remaining)}
                    disabled={busy}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      width: "100%",
                      padding: "6px 0",
                      fontSize: 12,
                      fontWeight: 700,
                      color: LEGACY_COLORS.blue,
                      background: "transparent",
                      border: `1px dashed color-mix(in srgb, ${LEGACY_COLORS.blue} 40%, transparent)`,
                      borderRadius: 8,
                      cursor: busy ? "not-allowed" : "pointer",
                    }}
                  >
                    <Plus size={13} /> 박스 넣기
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
