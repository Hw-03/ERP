"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WarehouseAngle, WarehouseBox } from "@/lib/api/warehouse-map";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { JariColumn } from "./JariColumn";
import { cellColor, cellKey, cellOccupied, jariStacks } from "./helpers";
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
                  {a.rows}줄·{a.layers}층
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
// Front stage — 정면도 (앵글 내 줄×층 그리드, 칸=자리3)
// ═══════════════════════════════════════════════════════
export function FrontStage({
  angle,
  cellIndex,
  pulseCellKey,
  onCellClick,
}: {
  angle: WarehouseAngle;
  cellIndex: CellIndex;
  pulseCellKey?: string | null;
  onCellClick: (row: number, layer: number) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 150, h: 64 });

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const fit = () => {
      const availH = el.clientHeight - 30 - (angle.layers - 1) * 4 - 16;
      const h = Math.max(40, Math.floor(availH / angle.layers));
      setSize({ w: 0, h });
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
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", width: "100%", flex: 1, minHeight: 0 }}>
        {/* layer labels */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 4, flexShrink: 0 }}>
          {layers.map((l) => (
            <div
              key={l}
              style={{
                height: size.h,
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
          ))}
        </div>
        {/* grid */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gap: 4,
            padding: 4,
            background: LEGACY_COLORS.s4,
            border: `1px solid ${LEGACY_COLORS.border}`,
            borderRadius: 16,
            gridTemplateColumns: `repeat(${angle.rows}, minmax(64px, 1fr))`,
            gridTemplateRows: `repeat(${angle.layers}, ${size.h}px)`,
          }}
        >
          {layers.map((l) =>
            rows.map((r) => {
              const k = cellKey(angle.id, r, l);
              const stacks = jariStacks(cellIndex.get(k), angle.jaris_per_cell);
              return (
                <div
                  key={k}
                  title={`${r}줄 ${l}층`}
                  onClick={() => onCellClick(r, l)}
                  className={`${styles.cell} ${pulseCellKey === k ? styles.hit : ""}`}
                  style={{
                    display: "flex",
                    gap: 2,
                    padding: 2,
                    background: LEGACY_COLORS.s2,
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  {stacks.map((boxes, ji) => (
                    <JariColumn key={ji} boxes={boxes} scale="front" />
                  ))}
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Row stage — 줄 확대 (미니맵 + 층별 자리 테이블)
// ═══════════════════════════════════════════════════════
export function RowStage({
  angle,
  curRow,
  selectedLayer,
  cellIndex,
  pulseLayer,
  onRowChange,
  onLayerClick,
}: {
  angle: WarehouseAngle;
  curRow: number;
  selectedLayer: number | null;
  cellIndex: CellIndex;
  pulseLayer?: number | null;
  onRowChange: (row: number) => void;
  onLayerClick: (layer: number) => void;
}) {
  const layers = Array.from({ length: angle.layers }, (_, i) => angle.layers - i);
  const rows = Array.from({ length: angle.rows }, (_, i) => i + 1);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        gap: 16,
        padding: 16,
        background: LEGACY_COLORS.s2,
        overflow: "hidden",
      }}
    >
      {/* mini overview */}
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginRight: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: LEGACY_COLORS.muted2 }}>{angle.label}</div>
        <div style={{ display: "flex", gap: 5 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {layers.map((l) => (
              <div
                key={l}
                style={{
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  fontSize: 10,
                  color: LEGACY_COLORS.muted2,
                  paddingRight: 4,
                }}
              >
                {l}층
              </div>
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gap: 3,
              padding: 3,
              background: LEGACY_COLORS.s3,
              border: `1px solid ${LEGACY_COLORS.border}`,
              borderRadius: 10,
              gridTemplateColumns: `repeat(${angle.rows}, 28px)`,
              gridTemplateRows: `repeat(${angle.layers}, 24px)`,
            }}
          >
            {layers.map((l) =>
              rows.map((r) => {
                const boxes = cellIndex.get(cellKey(angle.id, r, l));
                const occ = cellOccupied(boxes);
                const col = occ ? cellColor(boxes) : null;
                return (
                  <div
                    key={`${r}-${l}`}
                    title={`${r}줄 ${l}층`}
                    onClick={() => onRowChange(r)}
                    className={styles.miniCell}
                    style={{
                      width: 28,
                      height: 24,
                      borderRadius: 3,
                      background: occ && col
                        ? `color-mix(in srgb, ${col} 40%, ${LEGACY_COLORS.s1})`
                        : "transparent",
                      border: occ ? undefined : `1px dashed color-mix(in srgb, ${LEGACY_COLORS.muted2} 30%, transparent)`,
                      outline: r === curRow ? `2px solid ${LEGACY_COLORS.blue}` : undefined,
                      outlineOffset: r === curRow ? -1 : undefined,
                    }}
                  />
                );
              }),
            )}
          </div>
        </div>
      </div>

      {/* layer table */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
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
        <div style={{ overflowY: "auto", flex: 1 }}>
          {layers.map((l) => {
            const stacks = jariStacks(cellIndex.get(cellKey(angle.id, curRow, l)), angle.jaris_per_cell);
            const sel = l === selectedLayer;
            return (
              <div
                key={l}
                onClick={() => onLayerClick(l)}
                className={`${styles.layerRow} ${pulseLayer === l ? styles.hit : ""}`}
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                  minHeight: 72,
                  background: sel ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)` : undefined,
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
                {stacks.map((boxes, ji) => (
                  <div
                    key={ji}
                    style={{
                      flex: 1,
                      padding: "4px 6px",
                      borderRight: ji < angle.jaris_per_cell - 1 ? `1px solid ${LEGACY_COLORS.border}` : undefined,
                      display: "flex",
                    }}
                  >
                    <JariColumn boxes={boxes} scale="row" />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
