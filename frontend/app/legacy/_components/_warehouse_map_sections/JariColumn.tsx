"use client";

import type { WarehouseBox } from "@/lib/api/warehouse-map";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { SIZE_UNIT, SIZE_LABEL, JARI_CAPACITY, boxColor, stackUnits } from "./helpers";

/** 정면도 한정: 선두 모델코드 토큰(예: "DX3000", "DX3000M")을 생략해 좁은 셀에서 핵심 품명을 노출.
 *  툴팁·상세패널·줄확대에는 풀네임 유지. 모델코드가 없으면 원본 그대로. */
function frontName(name: string): string {
  const m = name.match(/^[A-Za-z]{1,3}\d{2,5}[A-Za-z]?\s+(.+)$/);
  return m ? m[1] : name;
}

/**
 * 자리(jari) 1칸 — 박스 스택을 flex 비율 높이로 렌더.
 * scale="front": 정면도(품목명+수량, 셀이 커서 11px 판독 가능).
 * scale="row":   줄확대(size 칩 + 품목명 1줄).
 * 빈 단위는 점선 윤곽(투명)으로 "비었음"을 형태로 표현. 채운 박스는 부서색 28% 틴트 + 좌측 4px 바.
 */
export function JariColumn({
  boxes,
  scale,
}: {
  boxes: WarehouseBox[];
  scale: "front" | "row";
}) {
  const used = stackUnits(boxes);
  const empty = JARI_CAPACITY - used;
  const isFront = scale === "front";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 6, gap: 2 }}>
      {empty > 0 && (
        <div
          style={{
            flex: empty,
            borderRadius: 6,
            border: `1px dashed color-mix(in srgb, ${LEGACY_COLORS.muted2} 20%, transparent)`,
          }}
        />
      )}
      {[...boxes].reverse().map((box) => {
        const color = boxColor(box) ?? LEGACY_COLORS.muted2;
        const first = box.items[0];
        const title = box.items.map((i) => `${i.item_name} ×${i.quantity}`).join("\n");
        const extra = box.items.length > 1 ? ` +${box.items.length - 1}` : "";

        return (
          <div
            key={box.box_id}
            title={title}
            style={{
              flex: SIZE_UNIT[box.size] ?? 1,
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              gap: 6,
              overflow: "hidden",
              padding: isFront ? "0 5px" : "0 8px",
              borderRadius: 6,
              background: `color-mix(in srgb, ${color} 28%, ${LEGACY_COLORS.s1})`,
              boxShadow: `inset 4px 0 0 0 ${color}`,
            }}
          >
            {/* size badge — 줄확대에서만(정면도는 박스 높이·좌측 부서색바로 size·dept 표현) */}
            {!isFront && (
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 800,
                  color: `color-mix(in srgb, ${color} 60%, ${LEGACY_COLORS.text})`,
                  width: 14,
                  textAlign: "center",
                }}
              >
                {SIZE_LABEL[box.size]}
              </span>
            )}
            {first && (
              <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "baseline", gap: 4, overflow: "hidden" }}>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: isFront ? 11 : 12,
                    fontWeight: 600,
                    color: LEGACY_COLORS.text,
                  }}
                >
                  {isFront ? frontName(first.item_name) : first.item_name}
                </span>
                <span style={{ flexShrink: 0, fontSize: isFront ? 10 : 11, fontWeight: 700, color: LEGACY_COLORS.muted2 }}>
                  ×{first.quantity}
                  {extra}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
