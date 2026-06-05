"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Search, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { SlidePanel } from "./common/SlidePanel";
import { LoadingSkeleton } from "./common/LoadingSkeleton";
import { warehouseMapApi, type WarehouseAngle, type WarehouseBoxItem, type WarehouseMap } from "@/lib/api/warehouse-map";
import { buildCellIndex, cellColor, cellKey } from "./_warehouse_map_sections/helpers";
import { FloorStage, FrontStage, RowStage } from "./_warehouse_map_sections/WarehouseStages";
import { WarehouseJariPanel } from "./_warehouse_map_sections/WarehouseJariPanel";
import styles from "./_warehouse_map_sections/warehouseMap.module.css";

type Stage = "floor" | "front" | "row";
type PanelCell = { angle: WarehouseAngle; row: number; layer: number };
type SearchHit = { angle_id: number; row: number; layer: number; items: WarehouseBoxItem[] };

export function DesktopWarehouseMapView({
  onStatusChange,
}: {
  onStatusChange?: (msg: string) => void;
}) {
  const [map, setMap] = useState<WarehouseMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stage, setStage] = useState<Stage>("floor");
  const [curAngle, setCurAngle] = useState<WarehouseAngle | null>(null);
  const [curRow, setCurRow] = useState(1);
  const [panel, setPanel] = useState<PanelCell | null>(null);
  const [matchQuery, setMatchQuery] = useState("");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [hitAngles, setHitAngles] = useState<Map<number, number> | null>(null);
  const [pulse, setPulse] = useState<{ angleId?: number; cellKey?: string; layer?: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // history drill depth — 드릴다운을 browser history에 쌓아 브라우저 뒤로가기 지원 (DesktopHistoryView 선례)
  const wmDepthRef = useRef(0);

  // ── Load map ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await warehouseMapApi.getMap();
        if (!cancelled) {
          setMap(data);
          setError(null);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "창고 지도를 불러오지 못했습니다.";
        if (!cancelled) {
          setError(msg);
          onStatusChange?.(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onStatusChange]);

  const cellIndex = useMemo(() => buildCellIndex(map?.boxes ?? []), [map]);
  const angles = map?.angles ?? [];

  // ── Keyboard: "/" focus, Esc close ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape") {
        if (panel) setPanel(null);
        else if (query) clearSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, query]);

  // ── Browser back/forward ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    type WmState = { wm?: { stage: Stage; angleId: number; row?: number }; wmDepth?: number } | null;
    const onPop = (e: PopStateEvent) => {
      const s = e.state as WmState;
      wmDepthRef.current = s?.wmDepth ?? 0;
      const wm = s?.wm;
      if (!wm) {
        setStage("floor"); setCurAngle(null); setPanel(null);
      } else if (wm.stage === "front") {
        const angle = map?.angles.find((a) => a.id === wm.angleId) ?? null;
        if (angle) { setCurAngle(angle); setStage("front"); }
        else { setStage("floor"); setCurAngle(null); }
        setPanel(null);
      } else if (wm.stage === "row" && wm.row != null) {
        const angle = map?.angles.find((a) => a.id === wm.angleId) ?? null;
        if (angle) { setCurAngle(angle); setCurRow(wm.row); setStage("row"); }
        setPanel(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [map]);

  // ── Navigation ──
  function openAngle(a: WarehouseAngle) {
    setCurAngle(a);
    setStage("front");
    setPanel(null);
    wmDepthRef.current += 1;
    window.history.pushState({ wm: { stage: "front", angleId: a.id }, wmDepth: wmDepthRef.current }, "");
  }
  function openCell(row: number, layer: number) {
    if (!curAngle) return;
    setCurRow(row);
    setStage("row");
    setPanel({ angle: curAngle, row, layer });
    wmDepthRef.current += 1;
    window.history.pushState({ wm: { stage: "row", angleId: curAngle.id, row }, wmDepth: wmDepthRef.current }, "");
  }
  function openLayer(layer: number) {
    if (!curAngle) return;
    setPanel({ angle: curAngle, row: curRow, layer });
  }
  function handleRowChange(row: number) {
    setCurRow(row);
    window.history.replaceState(
      { wm: { stage: "row", angleId: curAngle?.id, row }, wmDepth: wmDepthRef.current },
      "",
    );
  }

  // ── Search ──
  function clearSearch() {
    setQuery("");
    setResults(null);
    setHitAngles(null);
    setPulse(null);
    setMatchQuery("");
  }

  function runSearch(q: string) {
    setQuery(q);
    setResults(null);
    setPulse(null);
    const lq = q.trim().toLowerCase();
    if (!lq || !map) {
      setHitAngles(null);
      return;
    }
    const grouped = new Map<string, SearchHit>();
    for (const b of map.boxes) {
      for (const it of b.items) {
        if (
          it.item_name.toLowerCase().includes(lq) ||
          (it.mes_code || "").toLowerCase().includes(lq)
        ) {
          const k = cellKey(b.angle_id, b.row_no, b.layer_no);
          const g = grouped.get(k);
          if (g) g.items.push(it);
          else grouped.set(k, { angle_id: b.angle_id, row: b.row_no, layer: b.layer_no, items: [it] });
        }
      }
    }
    const hits = Array.from(grouped.values());
    const hitA = new Map<number, number>();
    for (const h of hits) hitA.set(h.angle_id, (hitA.get(h.angle_id) ?? 0) + 1);
    setHitAngles(hitA);

    if (hits.length === 0) return;
    if (hits.length === 1) navigateToHit(hits[0], q);
    else setResults(hits);
  }

  function navigateToHit(hit: SearchHit, q: string) {
    const a = angles.find((x) => x.id === hit.angle_id);
    if (!a) return;
    setResults(null);
    setCurAngle(a);
    setCurRow(hit.row);
    setStage("row");
    setPanel({ angle: a, row: hit.row, layer: hit.layer });
    setMatchQuery(q);
    setPulse({ layer: hit.layer });
    window.setTimeout(() => setPulse(null), 1600);
    const d1 = wmDepthRef.current + 1;
    const d2 = wmDepthRef.current + 2;
    window.history.pushState({ wm: { stage: "front", angleId: a.id }, wmDepth: d1 }, "");
    window.history.pushState({ wm: { stage: "row", angleId: a.id, row: hit.row }, wmDepth: d2 }, "");
    wmDepthRef.current = d2;
  }

  // ── Breadcrumb ──
  const breadcrumb = (() => {
    const items: { label: string; onClick?: () => void; cur?: boolean }[] = [
      {
        label: "창고 지도",
        onClick: stage !== "floor" ? () => {
          if (wmDepthRef.current > 0) window.history.go(-wmDepthRef.current);
        } : undefined,
        cur: stage === "floor",
      },
    ];
    if (curAngle && stage !== "floor") {
      items.push({
        label: curAngle.label,
        onClick: stage === "row" ? () => window.history.back() : undefined,
        cur: stage === "front",
      });
    }
    if (stage === "row" && curAngle) items.push({ label: `${curRow}줄`, cur: true });
    return items;
  })();

  return (
    <div style={{ display: "flex", minHeight: 0, flex: 1, minWidth: 0 }}>
      {/* Map card */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
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
        {/* Header strip */}
        <div
          style={{
            flexShrink: 0,
            height: 52,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 16px",
            borderBottom: `1px solid ${LEGACY_COLORS.border}`,
          }}
        >
          <button
            onClick={() => window.history.back()}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 14,
              background: LEGACY_COLORS.s2,
              border: `1px solid ${LEGACY_COLORS.border}`,
              color: LEGACY_COLORS.text,
              fontSize: 13,
              display: stage === "floor" ? "none" : "flex",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
            }}
          >
            <ChevronLeft size={14} /> 뒤로
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, flex: 1, minWidth: 0, overflow: "hidden" }}>
            {breadcrumb.map((b, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <span style={{ color: LEGACY_COLORS.muted }}>›</span>}
                <span
                  onClick={b.onClick}
                  className={b.onClick ? styles.crumb : undefined}
                  style={{
                    color: b.cur ? LEGACY_COLORS.text : LEGACY_COLORS.blue,
                    fontWeight: b.cur ? 600 : 400,
                    cursor: b.onClick ? "pointer" : "default",
                    whiteSpace: "nowrap",
                  }}
                >
                  {b.label}
                </span>
              </span>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: LEGACY_COLORS.s2,
                border: `1px solid ${query ? LEGACY_COLORS.blue : LEGACY_COLORS.border}`,
                borderRadius: 8,
                padding: "5px 10px",
                width: 260,
                boxShadow: query ? `0 0 0 3px color-mix(in srgb, ${LEGACY_COLORS.blue} 22%, transparent)` : undefined,
              }}
            >
              <Search size={14} style={{ color: LEGACY_COLORS.blue, flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => runSearch(e.target.value)}
                placeholder="품목명·코드 검색  (/)"
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: 13,
                  color: LEGACY_COLORS.text,
                }}
              />
              {query && (
                <button
                  onClick={clearSearch}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9999,
                    background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 15%, transparent)`,
                    color: LEGACY_COLORS.muted2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    cursor: "pointer",
                  }}
                >
                  <X size={10} />
                </button>
              )}
            </div>

            {/* multi-result dropdown */}
            {results && results.length > 1 && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  width: 340,
                  maxHeight: 320,
                  overflowY: "auto",
                  background: "var(--c-popup-bg)",
                  border: `1px solid ${LEGACY_COLORS.border}`,
                  borderRadius: 14,
                  boxShadow: "var(--c-popup-shadow)",
                  zIndex: 50,
                }}
              >
                <div style={{ padding: "8px 12px", fontSize: 11, color: LEGACY_COLORS.muted, borderBottom: `1px solid ${LEGACY_COLORS.border}`, fontWeight: 600 }}>
                  {results.length}개 위치에서 발견
                </div>
                {results.map((res) => {
                  const a = angles.find((x) => x.id === res.angle_id);
                  const col = cellColor(cellIndex.get(cellKey(res.angle_id, res.row, res.layer))) || LEGACY_COLORS.muted2;
                  const qty = res.items.reduce((s, it) => s + it.quantity, 0);
                  return (
                    <div
                      key={`${res.angle_id}-${res.row}-${res.layer}`}
                      onClick={() => navigateToHit(res, query)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer", borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
                    >
                      <div style={{ width: 4, height: 30, borderRadius: 2, background: col, flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, color: LEGACY_COLORS.text, fontWeight: 600 }}>
                          {a?.label} · {res.row}줄 · {res.layer}층
                        </div>
                        <div style={{ fontSize: 11, color: LEGACY_COLORS.muted2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {res.items.map((it) => it.item_name).join(", ")}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: LEGACY_COLORS.text, background: LEGACY_COLORS.s2, borderRadius: 6, padding: "2px 6px", flexShrink: 0 }}>
                        ×{qty}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* 0 results */}
            {query.trim() && hitAngles && hitAngles.size === 0 && !results && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  width: 260,
                  background: LEGACY_COLORS.warningBg,
                  color: LEGACY_COLORS.yellow,
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 12,
                  zIndex: 50,
                }}
              >
                &ldquo;{query}&rdquo; 위치를 찾을 수 없습니다
              </div>
            )}
          </div>
        </div>

        {/* Stage */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0, display: "flex" }}>
          {loading ? (
            <div style={{ flex: 1, padding: 24 }}>
              <LoadingSkeleton variant="card" rows={6} />
            </div>
          ) : error ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: LEGACY_COLORS.red, fontSize: 14 }}>
              {error}
            </div>
          ) : (
            <div key={stage} className={styles.stageEnter} style={{ flex: 1, display: "flex", minHeight: 0 }}>
              {stage === "floor" && (
                <FloorStage angles={angles} hitAngles={hitAngles ?? undefined} pulseAngleId={pulse?.angleId} onAngleClick={openAngle} />
              )}
              {stage === "front" && curAngle && (
                <FrontStage angle={curAngle} cellIndex={cellIndex} pulseCellKey={pulse?.cellKey} onCellClick={openCell} />
              )}
              {stage === "row" && curAngle && (
                <RowStage
                  angle={curAngle}
                  curRow={curRow}
                  selectedLayer={panel?.layer ?? null}
                  cellIndex={cellIndex}
                  pulseLayer={pulse?.layer}
                  onRowChange={handleRowChange}
                  onLayerClick={openLayer}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail slide panel */}
      <SlidePanel open={!!panel} onClose={() => setPanel(null)}>
        {panel && (
          <WarehouseJariPanel
            angle={panel.angle}
            row={panel.row}
            layer={panel.layer}
            cellIndex={cellIndex}
            matchQuery={matchQuery}
          />
        )}
      </SlidePanel>
    </div>
  );
}
