"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { WarehouseAngle, WarehouseBox } from "@/lib/api/warehouse-map";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { JariColumn } from "./JariColumn";
import { cellColor, cellKey, cellOccupied, jariStacks, rowLabel } from "./helpers";
import styles from "./warehouseMap.module.css";

type CellIndex = Map<string, WarehouseBox[]>;

// ═══════════════════════════════════════════════════════
// Floor stage — 평면도 (앵글 9개, 880×300 좌표계, fit-to-card)
// ═══════════════════════════════════════════════════════
export function FloorStage({
  angles,
  hitAngles,
  pulseAngleId,
  onAngleClick,
}: {
  angles: WarehouseAngle[];
  hitAngles?: Map<number, number>;
  pulseAngleId?: number | null;
  onAngleClick: (a: WarehouseAngle) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const aw = el.clientWidth - 32;
      const ah = el.clientHeight - 32;
      if (aw > 0 && ah > 0) setScale(Math.min(aw / 880, ah / 300));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const gridLine = `color-mix(in srgb, ${LEGACY_COLORS.muted2} 8%, transparent)`;

  return (
    <div
      ref={stageRef}
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: LEGACY_COLORS.s2,
        overflow: "hidden",
      }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}>
        <div
          style={{
            position: "relative",
            width: 880,
            height: 300,
            background: LEGACY_COLORS.s4,
            border: `1px solid ${LEGACY_COLORS.borderStrong}`,
            borderRadius: 18,
            overflow: "hidden",
            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              backgroundImage: `linear-gradient(${gridLine} 1px, transparent 1px), linear-gradient(90deg, ${gridLine} 1px, transparent 1px)`,
              backgroundSize: "40px 40px",
            }}
          />
          {angles.map((a) => {
            const count = hitAngles?.get(a.id);
            const pulse = pulseAngleId === a.id;
            return (
              <button
                key={a.id}
                onClick={() => onAngleClick(a)}
                className={`${styles.angleBlock} ${pulse ? styles.hit : ""}`}
                style={{
                  position: "absolute",
                  left: a.pos_x,
                  top: a.pos_y,
                  width: a.width,
                  height: a.height,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  background: LEGACY_COLORS.s1,
                  border: `1px solid ${LEGACY_COLORS.border}`,
                  borderRadius: 16,
                  boxShadow: "0 1px 3px rgba(45,70,106,0.10)",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: LEGACY_COLORS.text }}>
                  {a.label}
                </span>
                <span style={{ fontSize: 9, color: LEGACY_COLORS.muted2 }}>
                  {a.rows}열·{a.layers}층
                </span>
                {count ? (
                  <span
                    style={{
                      position: "absolute",
                      top: -5,
                      right: -5,
                      minWidth: 16,
                      height: 16,
                      padding: "0 3px",
                      borderRadius: 9999,
                      background: LEGACY_COLORS.blue,
                      color: "#fff",
                      fontSize: 9,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
          <div
            style={{
              position: "absolute",
              bottom: 8,
              right: 12,
              background: LEGACY_COLORS.s1,
              color: LEGACY_COLORS.muted2,
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 9999,
              border: `1px solid ${LEGACY_COLORS.border}`,
              boxShadow: "0 1px 3px rgba(45,70,106,0.10)",
            }}
          >
            ▼ 입구
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Front stage — 정면도 (단일 그리드: 줄 헤더 + 층 라벨 + 셀)
// ═══════════════════════════════════════════════════════
export function FrontStage({
  angle,
  cellIndex,
  pulseCellKey,
  showSlotLabels,
  onCellClick,
}: {
  angle: WarehouseAngle;
  cellIndex: CellIndex;
  pulseCellKey?: string | null;
  showSlotLabels?: boolean;
  onCellClick: (row: number, layer: number) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [cellH, setCellH] = useState(64);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const fit = () => {
      // body 높이 − 제목(28) − 줄헤더(22) − 행간 gap(layers*6) − 패딩(22)
      const availH = el.clientHeight - 28 - 22 - angle.layers * 6 - 22;
      setCellH(Math.max(40, Math.floor(availH / angle.layers)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [angle.rows, angle.layers]);

  const layers = Array.from({ length: angle.layers }, (_, i) => angle.layers - i);
  const rows = Array.from({ length: angle.rows }, (_, i) => i + 1);

  return (
    <div
      ref={bodyRef}
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        padding: "12px 16px 10px",
        background: LEGACY_COLORS.s2,
        overflow: "auto",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: LEGACY_COLORS.text, marginBottom: 6 }}>
        {angle.label} 정면도
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          rowGap: 4,
          columnGap: 12,
          gridTemplateColumns: `34px repeat(${angle.rows}, minmax(72px, 1fr))`,
          gridTemplateRows: `22px repeat(${angle.layers}, ${cellH}px)`,
        }}
      >
        {/* 코너 + 줄 헤더(상단) */}
        <div />
        {rows.map((r) => (
          <div
            key={`h${r}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: LEGACY_COLORS.muted2,
              borderRadius: 6,
              background: r % 2 === 0
                ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 6%, ${LEGACY_COLORS.s2})`
                : LEGACY_COLORS.s2,
            }}
          >
            {rowLabel(r)}열
          </div>
        ))}

        {/* 본문: 각 층 → [층 라벨] + 칸들 */}
        {layers.map((l) => (
          <Fragment key={l}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: 6,
                fontSize: 11,
                fontWeight: 600,
                color: LEGACY_COLORS.muted2,
              }}
            >
              {l}층
            </div>
            {rows.map((r) => {
              const k = cellKey(angle.id, r, l);
              const stacks = jariStacks(cellIndex.get(k), angle.jaris_per_cell);
              return (
                <div
                  key={k}
                  title={`${rowLabel(r)}열 ${l}층`}
                  onClick={() => onCellClick(r, l)}
                  className={`${styles.cell} ${pulseCellKey === k ? styles.hit : ""}`}
                  style={{
                    display: "flex",
                    gap: 2,
                    padding: 2,
                    minWidth: 0,
                    background: r % 2 === 0
                      ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 5%, ${LEGACY_COLORS.s2})`
                      : LEGACY_COLORS.s2,
                    border: `1px solid ${LEGACY_COLORS.border}`,
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  {stacks.map((boxes, ji) => (
                    <div key={ji} style={{ flex: 1, minWidth: 0, position: "relative", display: "flex", alignItems: "stretch" }}>
                      <JariColumn boxes={boxes} scale="front" />
                      {showSlotLabels && boxes.length === 0 && (
                        <span
                          style={{
                            position: "absolute",
                            inset: 0,
                            pointerEvents: "none",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 700,
                            color: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 25%, transparent)`,
                          }}
                        >
                          {ji + 1}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Row stage — 줄 확대 (상단 가로 미니맵 + 층별 자리 테이블, 층 높이 가득)
// ═══════════════════════════════════════════════════════
export function RowStage({
  angle,
  curRow,
  selectedLayer,
  cellIndex,
  pulseLayer,
  matchQuery,
  editable,
  onMoveBox,
  onRowChange,
  onLayerClick,
  onRowAndLayerChange,
}: {
  angle: WarehouseAngle;
  curRow: number;
  selectedLayer: number | null;
  cellIndex: CellIndex;
  pulseLayer?: number | null;
  matchQuery?: string;
  /** 편집 모드: 박스를 다른 자리로 드래그 이동. */
  editable?: boolean;
  onMoveBox?: (boxId: string, target: { row: number; layer: number; jari: number }) => void;
  onRowChange: (row: number) => void;
  onLayerClick: (layer: number) => void;
  onRowAndLayerChange?: (row: number, layer: number) => void;
}) {
  const layers = Array.from({ length: angle.layers }, (_, i) => angle.layers - i);
  const rows = Array.from({ length: angle.rows }, (_, i) => i + 1);
  const [selJari, setSelJari] = useState<{ layer: number; ji: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ layer: number; ji: number } | null>(null);
  const draggedBoxRef = useRef<string | null>(null);
  useEffect(() => { setSelJari(null); }, [curRow]);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 16,
        background: LEGACY_COLORS.s2,
        overflow: "hidden",
      }}
    >
      {/* 상단 미니맵 — 가운데 정렬·폭 70% (줄=열, 층=행).
          앵글·줄 정보는 상단 브레드크럼에 있어 별도 캡션 생략. */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ width: "50%" }}>
        {/* 열(column) 단위 wrapper로 재구성 — 선택 열 전체에 단일 윤곽선 표시 */}
        <div
          style={{
            display: "flex",
            gap: 3,
            padding: 4,
            background: LEGACY_COLORS.s3,
            border: `1px solid ${LEGACY_COLORS.border}`,
            borderRadius: 10,
          }}
        >
          {rows.map((r) => {
            const cur = r === curRow;
            return (
              <div
                key={r}
                onClick={() => {
                  if (onRowAndLayerChange) onRowAndLayerChange(r, selectedLayer ?? 1);
                  else { onRowChange(r); onLayerClick(selectedLayer ?? 1); }
                }}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  borderRadius: 4,
                  outline: cur ? `2px solid ${LEGACY_COLORS.blue}` : undefined,
                  outlineOffset: 1,
                  cursor: "pointer",
                }}
              >
                {layers.map((l) => {
                  const boxes = cellIndex.get(cellKey(angle.id, r, l));
                  const occ = cellOccupied(boxes);
                  const col = occ ? cellColor(boxes) : null;
                  return (
                    <div
                      key={l}
                      title={`${rowLabel(r)}열 ${l}층`}
                      onClick={(e) => { e.stopPropagation(); onRowChange(r); onLayerClick(l); }}
                      className={styles.miniCell}
                      style={{
                        height: 14,
                        borderRadius: 2,
                        background: occ && col
                          ? `color-mix(in srgb, ${col} 45%, ${LEGACY_COLORS.s1})`
                          : "transparent",
                        border: occ ? undefined : `1px dashed color-mix(in srgb, ${LEGACY_COLORS.muted2} 28%, transparent)`,
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
        {/* 줄 번호 라벨 (열 아래, 그리드와 동일 정렬) */}
        <div
          style={{
            display: "grid",
            width: "100%",
            gap: 3,
            padding: "3px 4px 0",
            gridTemplateColumns: `repeat(${angle.rows}, minmax(0, 1fr))`,
          }}
        >
          {rows.map((r) => (
            <div
              key={r}
              style={{
                textAlign: "center",
                fontSize: 10,
                fontWeight: r === curRow ? 700 : 500,
                color: r === curRow ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
              }}
            >
              {rowLabel(r)}열
            </div>
          ))}
        </div>
        </div>
      </div>

      {/* 층별 자리 테이블 — 높이 가득 채움 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          background: LEGACY_COLORS.s1,
          border: `1px solid ${LEGACY_COLORS.border}`,
          borderRadius: 18,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            background: LEGACY_COLORS.s2,
            borderBottom: `1px solid ${LEGACY_COLORS.border}`,
            padding: "6px 8px",
            fontSize: 11,
            fontWeight: 700,
            color: LEGACY_COLORS.muted2,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            flexShrink: 0,
          }}
        >
          <div style={{ width: 44, flexShrink: 0 }}>층</div>
          {Array.from({ length: angle.jaris_per_cell }, (_, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              자리 {i + 1}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflowY: "auto" }}>
          {layers.map((l) => {
            const stacks = jariStacks(cellIndex.get(cellKey(angle.id, curRow, l)), angle.jaris_per_cell);
            const sel = l === selectedLayer;
            return (
              <div
                key={l}
                onClick={() => onLayerClick(l)}
                className={`${styles.layerRow} ${pulseLayer === l ? styles.hit : ""}`}
                style={{
                  flex: 1,
                  minHeight: 72,
                  display: "flex",
                  alignItems: "stretch",
                  borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                  borderLeft: sel ? `3px solid ${LEGACY_COLORS.blue}` : "3px solid transparent",
                }}
              >
                <div
                  style={{
                    width: 44,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: LEGACY_COLORS.muted2,
                    background: LEGACY_COLORS.s2,
                    borderRight: `1px solid ${LEGACY_COLORS.border}`,
                  }}
                >
                  {l}층
                </div>
                {stacks.map((boxes, ji) => {
                  const isSelJari = selJari?.layer === l && selJari?.ji === ji;
                  const isDrop = editable && dropTarget?.layer === l && dropTarget?.ji === ji;
                  return (
                    <div
                      key={ji}
                      onClick={(e) => { e.stopPropagation(); setSelJari({ layer: l, ji }); onLayerClick(l); }}
                      onDragOver={
                        editable
                          ? (e) => {
                              e.preventDefault();
                              if (!isDrop) setDropTarget({ layer: l, ji });
                            }
                          : undefined
                      }
                      onDragLeave={
                        editable
                          ? () => setDropTarget((p) => (p?.layer === l && p?.ji === ji ? null : p))
                          : undefined
                      }
                      onDrop={
                        editable
                          ? (e) => {
                              e.preventDefault();
                              const boxId = draggedBoxRef.current;
                              draggedBoxRef.current = null;
                              setDropTarget(null);
                              if (boxId) onMoveBox?.(boxId, { row: curRow, layer: l, jari: ji });
                            }
                          : undefined
                      }
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: "4px 6px",
                        borderRight: ji < angle.jaris_per_cell - 1 ? `1px solid ${LEGACY_COLORS.border}` : undefined,
                        display: "flex",
                        cursor: "pointer",
                        outline: isDrop ? `2px dashed ${LEGACY_COLORS.blue}` : undefined,
                        outlineOffset: -2,
                        background: isDrop
                          ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 16%, transparent)`
                          : isSelJari
                            ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)`
                            : undefined,
                      }}
                    >
                      <JariColumn
                        boxes={boxes}
                        scale="row"
                        matchQuery={matchQuery}
                        draggable={editable}
                        onBoxDragStart={(id) => { draggedBoxRef.current = id; }}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
