"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
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
  /** 기존 박스의 "편집"(연필) 클릭 시 호출 — 부모가 박스 내용 편집 화면으로 전환. 미전달 시 버튼 숨김. */
  onRequestEditBox?: (box: WarehouseBox) => void;
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
  onRequestEditBox,
  onDeleteBox,
}: Props) {
  const isPlainAngle = angle.angle_type === "angle";
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
      {/* 위치 헤더 */}
      <div style={{ padding: "16px 16px 14px", borderBottom: `1px solid ${LEGACY_COLORS.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: LEGACY_COLORS.text, letterSpacing: -0.5, lineHeight: 1.2 }}>
          {angle.label} · {rowLabel(row)}열 · {layer}층
        </div>
      </div>

      {/* 자리 목록 — 세로 1/N 균등 분할 */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {!editable && !anyContent ? (
          <div style={{ color: LEGACY_COLORS.muted, fontSize: 13, padding: "32px 0", textAlign: "center" }}>
            이 칸은 비어있습니다
          </div>
        ) : (
          stacks.map((boxes, ji) => {
            const remaining = isPlainAngle ? JARI_CAPACITY - stackUnits(boxes) : 999;
            return (
              <div
                key={`${row}-${layer}-${ji}`}
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                }}
              >
                {/* 자리 섹션 헤더 */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 16px 8px",
                    background: LEGACY_COLORS.s2,
                    borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 700, color: LEGACY_COLORS.text }}>
                    자리 {ji + 1}
                  </span>
                  {editable && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: remaining > 0 ? LEGACY_COLORS.muted2 : LEGACY_COLORS.muted }}>
                      {isPlainAngle ? `\uC794\uC5EC ${remaining}\uCE78` : "\uBC15\uC2A4 \uB9AC\uC2A4\uD2B8"}
                    </span>
                  )}
                </div>

                {/* 박스 목록 */}
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {boxes.length === 0 && !editable ? (
                    <div style={{ color: LEGACY_COLORS.muted, fontSize: 13, padding: "4px 4px" }}>비어있음</div>
                  ) : (
                    [...boxes].reverse().map((box) => {
                      return (
                        <div
                          key={box.box_id}
                          style={{ display: "flex", flexDirection: "column", gap: 3 }}
                        >
                          {/* 박스 타입 — 배경 없는 최소 레이블 */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: LEGACY_COLORS.muted2 }}>
                              {SIZE_LABEL[box.size]}형 박스
                            </span>
                            {editable && (onRequestEditBox || onDeleteBox) && (
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                {onRequestEditBox && (
                                  <button
                                    type="button"
                                    onClick={() => onRequestEditBox(box)}
                                    disabled={busy}
                                    aria-label="박스 편집"
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      color: LEGACY_COLORS.muted2,
                                      cursor: busy ? "not-allowed" : "pointer",
                                      opacity: busy ? 0.4 : 1,
                                    }}
                                  >
                                    <Pencil size={14} />
                                  </button>
                                )}
                                {onDeleteBox && (
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
                            )}
                          </div>

                          {/* 품목명 — 주인공 */}
                          {box.items.map((it) => {
                            const match = lq && it.item_name.toLowerCase().includes(lq);
                            return (
                              <div
                                key={it.item_id}
                                style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}
                              >
                                <span
                                  style={{
                                    fontSize: 14,
                                    fontWeight: match ? 700 : 500,
                                    color: match ? LEGACY_COLORS.blue : LEGACY_COLORS.text,
                                    flex: 1,
                                    minWidth: 0,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {it.item_name}
                                </span>
                                <span style={{ fontSize: 13, fontWeight: 700, color: match ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2, flexShrink: 0 }}>
                                  ×{it.quantity}
                                </span>
                              </div>
                            );
                          })}
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
                        padding: "7px 0",
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
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
