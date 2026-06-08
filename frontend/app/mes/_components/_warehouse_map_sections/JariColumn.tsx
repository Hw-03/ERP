"use client";

import type { WarehouseBox } from "@/lib/api/warehouse-map";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Tooltip } from "@/lib/ui";
import { SIZE_UNIT, SIZE_LABEL, JARI_CAPACITY, boxColor, stackUnits } from "./helpers";
import styles from "./warehouseMap.module.css";

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
 * 품목명이 잘리면 hover 시 커스텀 Tooltip(전 품목 목록)을 즉시 노출(native title 대체).
 */
export function JariColumn({
  boxes,
  scale,
  matchQuery,
}: {
  boxes: WarehouseBox[];
  scale: "front" | "row";
  matchQuery?: string;
}) {
  const used = stackUnits(boxes);
  const empty = JARI_CAPACITY - used;
  const isFront = scale === "front";
  const lq = (matchQuery ?? "").toLowerCase().trim();

  return (
    <div
      style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 6, gap: 2 }}
    >
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
        const matched =
          lq &&
          box.items.some(
            (it) =>
              it.item_name.toLowerCase().includes(lq) ||
              (it.mes_code ?? "").toLowerCase().includes(lq),
          );
        const first = box.items[0];
        const extra = box.items.length > 1 ? ` +${box.items.length - 1}` : "";
        const tip =
          box.items.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {box.items.map((it) => (
                <div key={it.item_id}>
                  {SIZE_LABEL[box.size]} · {it.item_name} ×{it.quantity}
                </div>
              ))}
            </div>
          ) : null;

        // 정면도: 품목코드만. 박스 크기(대3·중2·소1)만큼 코드를 세로로 표기, 넘치면 마지막 줄에 …
        // 줄확대: size·이름·수량.
        const triggerCls = isFront
          ? "relative flex w-full min-w-0 flex-col justify-center gap-px"
          : "relative flex w-full min-w-0 items-center gap-1.5";
        const frontCap = SIZE_UNIT[box.size] ?? 1;
        const frontShown = box.items.slice(0, frontCap);
        const frontMore = box.items.length > frontCap;
        const inner = isFront ? (
          frontShown.length ? (
            <>
              {frontShown.map((it, idx) => (
                <span
                  key={it.item_id}
                  style={{
                    width: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: 1.25,
                    color: LEGACY_COLORS.text,
                  }}
                >
                  {it.mes_code ?? frontName(it.item_name)}
                  {frontMore && idx === frontShown.length - 1 ? " …" : ""}
                </span>
              ))}
            </>
          ) : null
        ) : (
          <>
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
            {first && (
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 12,
                  fontWeight: 600,
                  color: LEGACY_COLORS.text,
                }}
              >
                {first.item_name}
              </span>
            )}
            {first && (
              <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: LEGACY_COLORS.muted2 }}>
                ×{first.quantity}
                {extra}
              </span>
            )}
          </>
        );

        return (
          <div
            key={box.box_id}
            className={`${styles.boxHover}${matched ? ` ${styles.boxHit}` : ""}`}
            style={{
              flex: SIZE_UNIT[box.size] ?? 1,
              minHeight: 0,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              padding: isFront ? "0 5px" : "0 8px",
              borderRadius: 6,
              background: `color-mix(in srgb, ${color} 28%, ${LEGACY_COLORS.s1})`,
              boxShadow: `inset 4px 0 0 0 ${color}`,
            }}
          >
            {tip ? (
              <Tooltip content={tip} multiline triggerClassName={triggerCls}>
                {inner}
              </Tooltip>
            ) : (
              <span className={triggerCls}>{inner}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
