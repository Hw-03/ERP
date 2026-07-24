"use client";

import { useState } from "react";
import type { WarehouseBox } from "@/lib/api/warehouse-map";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Tooltip } from "@/lib/ui";
import { SIZE_UNIT, SIZE_LABEL, JARI_CAPACITY, boxColor, stackUnits } from "./helpers";
import styles from "./warehouseMap.module.css";
import { matchesSearchText, normalizeSearchText } from "@/lib/searchText";

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
  draggable,
  onBoxDragStart,
  onBoxDrop,
}: {
  boxes: WarehouseBox[];
  scale: "front" | "row";
  matchQuery?: string;
  /** 편집 모드: 박스를 드래그해 다른 자리로 이동(줄확대 화면). */
  draggable?: boolean;
  onBoxDragStart?: (boxId: string) => void;
  /** 편집 모드: 이 박스 기준 위/아래에 끌어온 박스를 끼워넣기(스택 중간 삽입). */
  onBoxDrop?: (targetBoxId: string, place: "above" | "below") => void;
}) {
  const used = stackUnits(boxes);
  const empty = JARI_CAPACITY - used;
  const isFront = scale === "front";
  const hasMatchQuery = Boolean(normalizeSearchText(matchQuery ?? ""));
  const [dropHint, setDropHint] = useState<{ boxId: string; place: "above" | "below" } | null>(null);

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
          hasMatchQuery &&
          box.items.some(
            (it) =>
              matchesSearchText(it.item_name, matchQuery ?? "") ||
              matchesSearchText(it.mes_code, matchQuery ?? ""),
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
            draggable={draggable || undefined}
            onDragStart={
              draggable
                ? (e) => {
                    e.stopPropagation();
                    onBoxDragStart?.(box.box_id);
                  }
                : undefined
            }
            onDragOver={
              onBoxDrop
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    const place = e.clientY - r.top < r.height / 2 ? "above" : "below";
                    setDropHint((p) =>
                      p?.boxId === box.box_id && p.place === place ? p : { boxId: box.box_id, place },
                    );
                  }
                : undefined
            }
            onDragLeave={
              onBoxDrop
                ? () => setDropHint((p) => (p?.boxId === box.box_id ? null : p))
                : undefined
            }
            onDrop={
              onBoxDrop
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    const place = e.clientY - r.top < r.height / 2 ? "above" : "below";
                    setDropHint(null);
                    onBoxDrop(box.box_id, place);
                  }
                : undefined
            }
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
              cursor: draggable ? "grab" : undefined,
              boxShadow:
                dropHint?.boxId === box.box_id
                  ? dropHint.place === "above"
                    ? `inset 0 3px 0 ${LEGACY_COLORS.blue}`
                    : `inset 0 -3px 0 ${LEGACY_COLORS.blue}`
                  : undefined,
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
