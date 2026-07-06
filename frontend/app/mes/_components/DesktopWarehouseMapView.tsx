"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, MapPin, Plus, Save, Search, Trash2, X } from "lucide-react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { SlidePanel } from "./common/SlidePanel";
import { LoadingSkeleton } from "./common/LoadingSkeleton";
import {
  warehouseMapApi,
  type BoxSize,
  type WarehouseAngle,
  type WarehouseBox,
  type WarehouseBoxItem,
  type WarehouseMap,
  type WarehouseSpecialZone,
  type WarehouseSpecialZonePayload,
} from "@/lib/api/warehouse-map";
import { buildCellIndex, cellColor, cellKey, rowLabel } from "./_warehouse_map_sections/helpers";
import { FloorStage, FrontStage, RowStage } from "./_warehouse_map_sections/WarehouseStages";
import { WarehouseJariPanel } from "./_warehouse_map_sections/WarehouseJariPanel";
import { AddBoxScreen } from "./_warehouse_map_sections/AddBoxScreen";
import { queryKeys } from "@/lib/queries/keys";
import { useWarehouseMapQuery } from "@/lib/queries/useWarehouseMapQuery";
import styles from "./_warehouse_map_sections/warehouseMap.module.css";

type Stage = "floor" | "front" | "row";
type PanelCell = { angle: WarehouseAngle; row: number; layer: number };
type SearchHit = { angle_id: number; row: number; layer: number; items: WarehouseBoxItem[] };
type LocGuide = { hits: Array<{ hit: SearchHit; angle: WarehouseAngle; qty: number }> };
// 검색 후보 1건 = 한 품목 + 그 품목이 들어있는 칸들. 칸 단위가 아니라 품목 단위로 묶는다.
type ItemMatch = { item_id: string; item_name: string; mes_code: string | null; hits: SearchHit[]; totalQty: number };

export function DesktopWarehouseMapView({
  onStatusChange,
  editable,
  items,
  onMapMutated,
  fullscreen = false,
  onFullscreenChange,
}: {
  onStatusChange?: (msg: string) => void;
  /** 편집 모드(창고 관리자): 줄확대 화면에서 박스 드래그 이동 + 칸 패널에서 박스 넣기/편집/빼기. */
  editable?: boolean;
  /** 편집 모드의 "박스 넣기" 품목 선택용 전체 품목. editable=false면 불필요. */
  items?: Item[];
  /** 박스 생성/수정/삭제 성공 시 호출 — 부모(탭)가 미배치 배너 등을 갱신. */
  onMapMutated?: () => void;
  fullscreen?: boolean;
  onFullscreenChange?: (fullscreen: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const mapQuery = useWarehouseMapQuery();
  const [map, setMap] = useState<WarehouseMap | null>(() => mapQuery.data ?? null);
  const loading = mapQuery.isLoading && !map;
  const error = mapQuery.error
    ? mapQuery.error instanceof Error
      ? mapQuery.error.message
      : "창고 지도를 불러오지 못했습니다."
    : null;

  const [stage, setStage] = useState<Stage>("floor");
  const [stageAnimationSeq, setStageAnimationSeq] = useState(0);
  const stageRef = useRef<Stage>("floor");
  const [curAngle, setCurAngle] = useState<WarehouseAngle | null>(null);
  const [curRow, setCurRow] = useState(1);
  const [panel, setPanel] = useState<PanelCell | null>(null);
  const [zonePanel, setZonePanel] = useState<WarehouseSpecialZone | null>(null);
  const [matchQuery, setMatchQuery] = useState("");
  // 편집 모드: 박스 넣기/편집 오버레이(좌측 지도 카드를 AddBoxScreen으로 덮음). null이면 지도 표시.
  const [addBox, setAddBox] = useState<{ jariIndex: number; remaining: number; editBox?: WarehouseBox } | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoneBusy, setZoneBusy] = useState(false);

  const [query, setQuery] = useState("");
  // 품목 단위 후보(드롭다운). 선택 전에는 여기에 후보들이, 선택 후에는 null.
  const [itemMatches, setItemMatches] = useState<ItemMatch[] | null>(null);
  // 현재 선택된 품목(칩 스트립 라벨·선택 상태 표시용). 선택 전 null.
  const [selectedItem, setSelectedItem] = useState<ItemMatch | null>(null);
  const [hitAngles, setHitAngles] = useState<Map<number, number> | null>(null);
  const [pulse, setPulse] = useState<{ angleId?: number; cellKey?: string; layer?: number } | null>(null);
  const [locGuide, setLocGuide] = useState<LocGuide | null>(null);
  const [activeHitKey, setActiveHitKey] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // history drill depth — 드릴다운을 browser history에 쌓아 브라우저 뒤로가기 지원 (DesktopHistoryView 선례)
  const wmDepthRef = useRef(0);

  useEffect(() => {
    if (mapQuery.data) setMap(mapQuery.data);
  }, [mapQuery.data]);

  useEffect(() => {
    if (error) onStatusChange?.(error);
  }, [error, onStatusChange]);

  const cellIndex = useMemo(() => buildCellIndex(map?.boxes ?? []), [map]);
  const angles = map?.angles ?? [];

  function setAnimatedStage(next: Stage) {
    if (stageRef.current !== next) {
      stageRef.current = next;
      setStageAnimationSeq((n) => n + 1);
    }
    setStage(next);
  }

  // 박스 생성/수정/삭제는 서버가 box_id·재배치를 돌려주므로 낙관적 대신 reload(정확성 우선).
  async function reloadMap() {
    const data = await warehouseMapApi.getMap();
    queryClient.setQueryData(queryKeys.warehouseMap.map(), data);
    setMap(data);
    return data;
  }

  // 편집 모드: 칸 패널 "박스 넣기"/"박스 편집" → AddBoxScreen 제출.
  async function handleSubmitBox(args: {
    jariIndex: number;
    size: BoxSize;
    lines: { item_id: string; quantity: number }[];
  }) {
    if (!panel) return;
    const editBox = addBox?.editBox;
    setBusy(true);
    try {
      if (editBox) {
        await warehouseMapApi.updateBox(editBox.box_id, { items: args.lines });
        onStatusChange?.("박스를 수정했습니다.");
      } else {
        await warehouseMapApi.createBox({
          angle_id: panel.angle.id,
          row_no: panel.row,
          layer_no: panel.layer,
          jari_index: args.jariIndex,
          size: args.size,
          items: args.lines,
        });
        onStatusChange?.("박스를 배치했습니다.");
      }
      await reloadMap();
      onMapMutated?.();
      setAddBox(null);
    } catch (e) {
      onStatusChange?.(e instanceof Error ? e.message : editBox ? "수정 실패" : "배치 실패");
      throw e; // AddBoxScreen이 catch 해 화면 유지
    } finally {
      setBusy(false);
    }
  }

  // 편집 모드: 칸 패널 "박스 빼기"(휴지통).
  async function handleSaveZone(zoneId: number, patch: WarehouseSpecialZonePayload) {
    setZoneBusy(true);
    try {
      const saved = await warehouseMapApi.updateZone(zoneId, patch);
      await reloadMap();
      setZonePanel(saved);
      onMapMutated?.();
      onStatusChange?.("구역 정보를 저장했습니다.");
    } catch (e) {
      onStatusChange?.(e instanceof Error ? e.message : "구역 저장 실패");
    } finally {
      setZoneBusy(false);
    }
  }

  async function handleSaveZoneItems(zoneId: number, lines: { item_id: string; quantity: number }[]) {
    setZoneBusy(true);
    try {
      const saved = await warehouseMapApi.replaceZoneItems(zoneId, lines);
      await reloadMap();
      setZonePanel(saved);
      onMapMutated?.();
      onStatusChange?.("구역 적재 품목을 저장했습니다.");
    } catch (e) {
      onStatusChange?.(e instanceof Error ? e.message : "구역 품목 저장 실패");
    } finally {
      setZoneBusy(false);
    }
  }

  async function handleDeleteZone(zoneId: number) {
    setZoneBusy(true);
    try {
      await warehouseMapApi.deleteZone(zoneId);
      setZonePanel(null);
      await reloadMap();
      onMapMutated?.();
      onStatusChange?.("구역을 삭제했습니다.");
    } catch (e) {
      onStatusChange?.(e instanceof Error ? e.message : "구역 삭제 실패");
    } finally {
      setZoneBusy(false);
    }
  }
  async function handleDeleteBox(boxId: string) {
    setBusy(true);
    try {
      await warehouseMapApi.deleteBox(boxId);
      onStatusChange?.("박스를 뺐습니다.");
      await reloadMap();
      onMapMutated?.();
    } catch (e) {
      onStatusChange?.(e instanceof Error ? e.message : "빼기 실패");
    } finally {
      setBusy(false);
    }
  }

  // 편집 모드: 박스 드래그 이동. 낙관적 업데이트(즉시 반영) → 서버 확정 → 실패 시 되돌림.
  const handleMoveBox = (
    boxId: string,
    target: { row: number; layer: number; jari: number },
  ) => {
    if (!curAngle || !map) return;
    const angleId = curAngle.id;
    const prevBoxes = map.boxes;
    const targetMax = prevBoxes
      .filter(
        (b) =>
          b.angle_id === angleId &&
          b.row_no === target.row &&
          b.layer_no === target.layer &&
          b.jari_index === target.jari,
      )
      .reduce((mx, b) => Math.max(mx, b.stack_order), 0);

    // 즉시 화면 반영 — 대상 자리 맨 위로.
    setMap((m) =>
      m
        ? {
            ...m,
            boxes: m.boxes.map((b) =>
              b.box_id === boxId
                ? {
                    ...b,
                    angle_id: angleId,
                    row_no: target.row,
                    layer_no: target.layer,
                    jari_index: target.jari,
                    stack_order: targetMax + 1,
                  }
                : b,
            ),
          }
        : m,
    );

    void warehouseMapApi
      .moveBox(boxId, {
        angle_id: angleId,
        row_no: target.row,
        layer_no: target.layer,
        jari_index: target.jari,
      })
      .catch((e) => {
        // 실패 → 원복 + 안내(예: 용량 초과).
        setMap((m) => (m ? { ...m, boxes: prevBoxes } : m));
        onStatusChange?.(e instanceof Error ? e.message : "박스 이동에 실패했습니다.");
      });
  };

  // 편집 모드: 박스 위/아래에 끼워넣기(스택 중간 삽입). 자리 전체 순서 재배치.
  const handleInsertBox = (
    boxId: string,
    target: { row: number; layer: number; jari: number; targetBoxId: string; place: "above" | "below" },
  ) => {
    if (!curAngle || !map) return;
    const angleId = curAngle.id;
    const prevBoxes = map.boxes;
    const dragged = prevBoxes.find((b) => b.box_id === boxId);
    if (!dragged) return;

    const jariBoxes = prevBoxes
      .filter(
        (b) =>
          b.box_id !== boxId &&
          b.angle_id === angleId &&
          b.row_no === target.row &&
          b.layer_no === target.layer &&
          b.jari_index === target.jari,
      )
      .sort((a, b) => a.stack_order - b.stack_order);
    const tIdx = jariBoxes.findIndex((b) => b.box_id === target.targetBoxId);
    if (tIdx < 0) return;
    const insertIdx = target.place === "above" ? tIdx + 1 : tIdx;
    const ordered = [...jariBoxes.slice(0, insertIdx), dragged, ...jariBoxes.slice(insertIdx)];
    const boxIds = ordered.map((b) => b.box_id);
    const orderMap = new Map(boxIds.map((id, i) => [id, i] as const));

    // 즉시 화면 반영 — 새 순서대로 stack_order 재배치.
    setMap((m) =>
      m
        ? {
            ...m,
            boxes: m.boxes.map((b) =>
              orderMap.has(b.box_id)
                ? {
                    ...b,
                    angle_id: angleId,
                    row_no: target.row,
                    layer_no: target.layer,
                    jari_index: target.jari,
                    stack_order: orderMap.get(b.box_id) ?? b.stack_order,
                  }
                : b,
            ),
          }
        : m,
    );

    void warehouseMapApi
      .restackJari({
        angle_id: angleId,
        row_no: target.row,
        layer_no: target.layer,
        jari_index: target.jari,
        box_ids: boxIds,
      })
      .catch((e) => {
        setMap((m) => (m ? { ...m, boxes: prevBoxes } : m));
        onStatusChange?.(e instanceof Error ? e.message : "스택 순서 변경에 실패했습니다.");
      });
  };

  // ── Keyboard: "/" focus, Esc close ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape") {
        if (addBox) setAddBox(null);
        else if (panel) setPanel(null);
        else if (query) clearSearch();
        else if (fullscreen) onFullscreenChange?.(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, query, addBox, fullscreen, onFullscreenChange]);

  // ── Browser back/forward ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    type WmState = { wm?: { stage: Stage; angleId: number; row?: number }; wmDepth?: number } | null;
    const onPop = (e: PopStateEvent) => {
      setAddBox(null); // 뒤로가기 시 박스 넣기 오버레이 닫힘
      const s = e.state as WmState;
      wmDepthRef.current = s?.wmDepth ?? 0;
      const wm = s?.wm;
      if (!wm) {
        setAnimatedStage("floor"); setCurAngle(null); setPanel(null);
      } else if (wm.stage === "front") {
        const angle = map?.angles.find((a) => a.id === wm.angleId) ?? null;
        if (angle) { setCurAngle(angle); setAnimatedStage("front"); }
        else { setAnimatedStage("floor"); setCurAngle(null); }
        setPanel(null);
      } else if (wm.stage === "row" && wm.row != null) {
        const angle = map?.angles.find((a) => a.id === wm.angleId) ?? null;
        if (angle) { setCurAngle(angle); setCurRow(wm.row); setAnimatedStage("row"); }
        setPanel(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [map]);

  // ── Navigation ──
  function openAngle(a: WarehouseAngle) {
    setZonePanel(null);
    setCurAngle(a);
    if (a.angle_type !== "angle") {
      setPanel({ angle: a, row: 1, layer: 1 });
      return;
    }
    setAnimatedStage("front");
    setPanel(null);
    wmDepthRef.current += 1;
    window.history.pushState({ wm: { stage: "front", angleId: a.id }, wmDepth: wmDepthRef.current }, "");
  }
  function openCell(row: number, layer: number) {
    setZonePanel(null);
    if (!curAngle) return;
    setCurRow(row);
    setAnimatedStage("row");
    setPanel({ angle: curAngle, row, layer });
    wmDepthRef.current += 1;
    window.history.pushState({ wm: { stage: "row", angleId: curAngle.id, row }, wmDepth: wmDepthRef.current }, "");
  }
  function openLayer(layer: number) {
    setZonePanel(null);
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
  function handleRowAndLayerChange(row: number, layer: number) {
    if (!curAngle) return;
    setCurRow(row);
    setPanel({ angle: curAngle, row, layer });
    window.history.replaceState(
      { wm: { stage: "row", angleId: curAngle.id, row }, wmDepth: wmDepthRef.current },
      "",
    );
  }

  // ── Search ──
  function clearSearch() {
    setQuery("");
    setItemMatches(null);
    setSelectedItem(null);
    setHitAngles(null);
    setPulse(null);
    setMatchQuery("");
    setLocGuide(null);
    setActiveHitKey(null);
  }

  function runSearch(q: string) {
    setQuery(q);
    setPulse(null);
    const lq = q.trim().toLowerCase();
    if (!lq || !map) {
      setItemMatches(null);
      setSelectedItem(null);
      setHitAngles(null);
      setLocGuide(null);
      setActiveHitKey(null);
      return;
    }
    // item_id 로 1차 그룹핑(품목 단위), 그 안에서 칸(cellKey)으로 2차 그룹핑.
    const byItem = new Map<string, { name: string; code: string | null; cells: Map<string, SearchHit> }>();
    for (const b of map.boxes) {
      for (const it of b.items) {
        if (
          it.item_name.toLowerCase().includes(lq) ||
          (it.mes_code || "").toLowerCase().includes(lq)
        ) {
          let g = byItem.get(it.item_id);
          if (!g) {
            g = { name: it.item_name, code: it.mes_code, cells: new Map() };
            byItem.set(it.item_id, g);
          }
          const k = cellKey(b.angle_id, b.row_no, b.layer_no);
          const cell = g.cells.get(k);
          if (cell) cell.items.push(it);
          else g.cells.set(k, { angle_id: b.angle_id, row: b.row_no, layer: b.layer_no, items: [it] });
        }
      }
    }
    const matches: ItemMatch[] = Array.from(byItem, ([item_id, g]) => {
      const hits = Array.from(g.cells.values());
      return {
        item_id,
        item_name: g.name,
        mes_code: g.code,
        hits,
        totalQty: hits.reduce((s, h) => s + h.items.reduce((t, x) => t + x.quantity, 0), 0),
      };
    }).sort((a, b) => a.item_name.localeCompare(b.item_name));

    if (matches.length === 0) {
      setItemMatches([]); // 0건 — 아래 "찾을 수 없음" 분기용
      setSelectedItem(null);
      setHitAngles(new Map());
      setLocGuide(null);
      setActiveHitKey(null);
      return;
    }
    if (matches.length === 1) {
      // 1개로 좁혀지면 자동 선택(입력창에 친 글자는 보존)
      selectItem(matches[0], { keepQuery: true });
      return;
    }
    // 여러 후보: 품목 드롭다운만. 칩 스트립·강조는 선택 전까지 비움.
    setItemMatches(matches);
    setSelectedItem(null);
    setLocGuide(null);
    setActiveHitKey(null);
    setMatchQuery("");
    const hitA = new Map<number, number>();
    for (const m of matches) for (const h of m.hits) hitA.set(h.angle_id, (hitA.get(h.angle_id) ?? 0) + 1);
    setHitAngles(hitA);
  }

  // 품목 후보 하나 선택 — 그 품목 칸만 칩 스트립에 남기고 첫 칸으로 이동.
  function selectItem(m: ItemMatch, opts?: { keepQuery?: boolean }) {
    setItemMatches(null);
    setSelectedItem(m);
    if (!opts?.keepQuery) setQuery(m.item_name);
    // 박스 강조: 고유한 mes_code 우선(비슷한 이름 0015/0016 정밀 구분), 없으면 품목명 폴백.
    const highlight = m.mes_code ?? m.item_name;
    setMatchQuery(highlight);
    setLocGuide({
      hits: m.hits
        .map((h) => ({ hit: h, angle: angles.find((a) => a.id === h.angle_id)!, qty: h.items.reduce((s, it) => s + it.quantity, 0) }))
        .filter((x) => x.angle != null),
    });
    const hitA = new Map<number, number>();
    for (const h of m.hits) hitA.set(h.angle_id, (hitA.get(h.angle_id) ?? 0) + 1);
    setHitAngles(hitA);
    if (m.hits.length > 0) navigateToHit(m.hits[0], highlight, { fromSelect: true });
  }

  function navigateToHit(hit: SearchHit, q: string, opts?: { fromSelect?: boolean }) {
    const a = angles.find((x) => x.id === hit.angle_id);
    if (!a) return;
    setActiveHitKey(`${hit.angle_id}-${hit.row}-${hit.layer}`);
    if (!opts?.fromSelect) {
      // 칩 직접 클릭 등으로 들어온 경우에만 입력/강조 동기화(선택 흐름에선 selectItem 이 소유).
      setQuery(hit.items[0]?.item_name ?? q);
      setMatchQuery(q);
    }
    setCurAngle(a);
    setCurRow(hit.row);
    setAnimatedStage("row");
    setPanel({ angle: a, row: hit.row, layer: hit.layer });
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
    if (stage === "row" && curAngle) items.push({ label: `${rowLabel(curRow)}열`, cur: true });
    return items;
  })();

  return (
    <div style={{ display: "flex", minHeight: 0, flex: 1, minWidth: 0, height: "100%" }}>
      {/* 편집 모드: 박스 넣기/편집 오버레이가 좌측 지도 카드를 대체. 아니면 지도 카드. */}
      {addBox && panel && editable ? (
        <AddBoxScreen
          angle={panel.angle}
          row={panel.row}
          layer={panel.layer}
          jariIndex={addBox.jariIndex}
          remaining={addBox.remaining}
          editBox={addBox.editBox}
          items={items ?? []}
          busy={busy}
          onSubmit={handleSubmitBox}
          onCancel={() => setAddBox(null)}
        />
      ) : (
      /* Map card */
      <div
        data-testid="warehouse-map-card"
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          borderRadius: fullscreen ? 0 : 24,
          background: fullscreen ? "transparent" : LEGACY_COLORS.s1,
          border: fullscreen ? "none" : `1px solid ${LEGACY_COLORS.border}`,
          boxShadow: fullscreen ? "none" : "var(--c-card-shadow)",
          backgroundImage: fullscreen ? "none" : "var(--c-panel-glow)",
          overflow: "hidden",
        }}
      >
        {/* Header strip */}
        {!fullscreen && (
        <div
          style={{
            flexShrink: 0,
            height: 52,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 16px",
            borderBottom: `1px solid ${LEGACY_COLORS.border}`,
            position: "relative",
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
            {/* floor에서는 상단 큰 제목과 중복이라 숨김 — 드릴다운 시에만 경로 표시 */}
            {stage !== "floor" && breadcrumb.map((b, i) => (
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


          {/* Search — 헤더 중앙에 절대 고정 (stage 전환 시 위치 불변) */}
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", flexShrink: 0, zIndex: 5 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: LEGACY_COLORS.s2,
                border: `1px solid ${query ? LEGACY_COLORS.blue : LEGACY_COLORS.border}`,
                borderRadius: 10,
                padding: "8px 14px",
                width: 440,
                boxShadow: query ? `0 0 0 3px color-mix(in srgb, ${LEGACY_COLORS.blue} 22%, transparent)` : undefined,
              }}
            >
              <Search size={18} style={{ color: LEGACY_COLORS.blue, flexShrink: 0 }} />
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
                  fontSize: 14,
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

            {/* 품목 후보 드롭다운 (품목 단위) */}
            {itemMatches && itemMatches.length > 1 && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  width: "100%",
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
                  {itemMatches.length}개 품목
                </div>
                {itemMatches.map((m) => {
                  const first = m.hits[0];
                  const col =
                    (first && cellColor(cellIndex.get(cellKey(first.angle_id, first.row, first.layer)))) ||
                    LEGACY_COLORS.muted2;
                  return (
                    <div
                      key={m.item_id}
                      onClick={() => selectItem(m)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer", borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
                    >
                      <div style={{ width: 4, height: 30, borderRadius: 2, background: col, flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, color: LEGACY_COLORS.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.item_name}
                        </div>
                        <div style={{ fontSize: 11, color: LEGACY_COLORS.muted2 }}>
                          {m.mes_code ?? "코드 없음"} · {m.hits.length}곳
                        </div>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: LEGACY_COLORS.text, background: LEGACY_COLORS.s2, borderRadius: 6, padding: "2px 6px", flexShrink: 0 }}>
                        ×{m.totalQty}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* 0 results */}
            {query.trim() && hitAngles && hitAngles.size === 0 && (!itemMatches || itemMatches.length === 0) && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  width: "100%",
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
        )}

        {/* Location guide strip */}
        {!fullscreen && locGuide && locGuide.hits.length > 0 && (
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 16px",
              height: 44,
              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, ${LEGACY_COLORS.s2})`,
              borderBottom: `1px solid color-mix(in srgb, ${LEGACY_COLORS.blue} 20%, ${LEGACY_COLORS.border})`,
              overflowX: "auto",
            }}
          >
            <MapPin size={13} style={{ color: LEGACY_COLORS.blue, flexShrink: 0 }} />
            {selectedItem && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: LEGACY_COLORS.text,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  maxWidth: 240,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {selectedItem.item_name}
                {selectedItem.mes_code ? ` · ${selectedItem.mes_code}` : ""}
              </span>
            )}
            <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1, overflowX: "auto" }}>
              {locGuide.hits.map(({ hit, angle, qty }) => {
                const k = `${hit.angle_id}-${hit.row}-${hit.layer}`;
                const isActive = activeHitKey === k;
                return (
                  <button
                    key={k}
                    onClick={() => navigateToHit(hit, matchQuery, { fromSelect: true })}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 10px",
                      borderRadius: 8,
                      border: `1px solid ${isActive ? LEGACY_COLORS.blue : `color-mix(in srgb, ${LEGACY_COLORS.blue} 30%, ${LEGACY_COLORS.border})`}`,
                      background: isActive ? LEGACY_COLORS.blue : `color-mix(in srgb, ${LEGACY_COLORS.blue} 5%, ${LEGACY_COLORS.s1})`,
                      color: isActive ? "#fff" : LEGACY_COLORS.blue,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    <span>{angle.label} · {rowLabel(hit.row)}열 · {hit.layer}층</span>
                    <span
                      style={{
                        background: isActive
                          ? "rgba(255,255,255,0.22)"
                          : `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, ${LEGACY_COLORS.s2})`,
                        borderRadius: 6,
                        padding: "1px 6px",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      ×{qty}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={clearSearch}
              style={{
                width: 22,
                height: 22,
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
              <X size={11} />
            </button>
          </div>
        )}

        {/* Stage */}
        <div style={{ flex: 1, minWidth: 0, position: "relative", overflow: "hidden", minHeight: 0, display: "flex" }}>
          {loading ? (
            <div style={{ flex: 1, padding: 24 }}>
              <LoadingSkeleton variant="card" rows={6} />
            </div>
          ) : error ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: LEGACY_COLORS.red, fontSize: 14 }}>
              {error}
            </div>
          ) : (
            <div
              key={stage}
              className={stageAnimationSeq > 0 ? styles.stageEnter : undefined}
              style={{ flex: 1, minWidth: 0, display: "flex", minHeight: 0 }}
            >
              {stage === "floor" && (
                <FloorStage
                  angles={angles}
                  hitAngles={hitAngles ?? undefined}
                  pulseAngleId={pulse?.angleId}
                  onAngleClick={openAngle}
                />
              )}
              {stage === "front" && curAngle && (
                <FrontStage angle={curAngle} cellIndex={cellIndex} pulseCellKey={pulse?.cellKey} showSlotLabels onCellClick={openCell} />
              )}
              {stage === "row" && curAngle && (
                <RowStage
                  angle={curAngle}
                  curRow={curRow}
                  selectedLayer={panel?.layer ?? null}
                  cellIndex={cellIndex}
                  pulseLayer={pulse?.layer}
                  matchQuery={matchQuery}
                  editable={editable}
                  onMoveBox={handleMoveBox}
                  onInsertBox={handleInsertBox}
                  onRowChange={handleRowChange}
                  onLayerClick={openLayer}
                  onRowAndLayerChange={handleRowAndLayerChange}
                />
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Detail slide panel */}
      <SlidePanel open={!!panel} onClose={() => setPanel(null)}>
        {panel && (
          <WarehouseJariPanel
            angle={panel.angle}
            row={panel.row}
            layer={panel.layer}
            cellIndex={cellIndex}
            matchQuery={matchQuery}
            editable={editable}
            busy={busy}
            onDeleteBox={editable ? handleDeleteBox : undefined}
            onRequestAddBox={
              editable && !addBox ? (jariIndex, remaining) => setAddBox({ jariIndex, remaining }) : undefined
            }
            onRequestEditBox={
              editable && !addBox
                ? (box) => setAddBox({ jariIndex: box.jari_index, remaining: 0, editBox: box })
                : undefined
            }
          />
        )}
      </SlidePanel>
      <SlidePanel open={!!zonePanel} onClose={() => setZonePanel(null)}>
        {zonePanel && (
          <WarehouseZonePanel
            zone={zonePanel}
            items={items ?? []}
            editable={editable}
            busy={zoneBusy}
            onSaveZone={handleSaveZone}
            onSaveItems={handleSaveZoneItems}
            onDeleteZone={handleDeleteZone}
          />
        )}
      </SlidePanel>
    </div>
  );
}

type ZoneLine = { item_id: string; quantity: number };

function WarehouseZonePanel({
  zone,
  items,
  editable = false,
  busy = false,
  onSaveZone,
  onSaveItems,
  onDeleteZone,
}: {
  zone: WarehouseSpecialZone;
  items: Item[];
  editable?: boolean;
  busy?: boolean;
  onSaveZone: (zoneId: number, patch: WarehouseSpecialZonePayload) => Promise<void>;
  onSaveItems: (zoneId: number, lines: ZoneLine[]) => Promise<void>;
  onDeleteZone: (zoneId: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    label: zone.label,
    zone_type: zone.zone_type,
    pos_x: String(zone.pos_x),
    pos_y: String(zone.pos_y),
    width: String(zone.width),
    height: String(zone.height),
  });
  const [lines, setLines] = useState<ZoneLine[]>(() =>
    zone.items.map((item) => ({ item_id: item.item_id, quantity: item.quantity })),
  );
  const [selectedItemId, setSelectedItemId] = useState("");

  useEffect(() => {
    setDraft({
      label: zone.label,
      zone_type: zone.zone_type,
      pos_x: String(zone.pos_x),
      pos_y: String(zone.pos_y),
      width: String(zone.width),
      height: String(zone.height),
    });
    setLines(zone.items.map((item) => ({ item_id: item.item_id, quantity: item.quantity })));
  }, [zone.id, zone.label, zone.zone_type, zone.pos_x, zone.pos_y, zone.width, zone.height, zone.items]);

  useEffect(() => {
    setSelectedItemId((prev) => prev || items[0]?.item_id || "");
  }, [items]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.item_id, item])), [items]);
  const zoneItemById = useMemo(() => new Map(zone.items.map((item) => [item.item_id, item])), [zone.items]);
  const totalQty = lines.reduce((sum, line) => sum + line.quantity, 0);
  const isPallet = zone.zone_type === "pallet";

  const inputStyle = {
    background: LEGACY_COLORS.s2,
    border: `1px solid ${LEGACY_COLORS.border}`,
    borderRadius: 10,
    padding: "7px 10px",
    fontSize: 13,
    color: LEGACY_COLORS.text,
    width: "100%",
  } as const;

  function updateLine(itemId: string, quantity: number) {
    setLines((prev) =>
      prev.map((line) =>
        line.item_id === itemId ? { ...line, quantity: Math.max(0, Math.floor(quantity || 0)) } : line,
      ),
    );
  }

  function removeLine(itemId: string) {
    setLines((prev) => prev.filter((line) => line.item_id !== itemId));
  }

  function addSelectedItem() {
    if (!selectedItemId) return;
    setLines((prev) => {
      const existing = prev.find((line) => line.item_id === selectedItemId);
      if (existing) {
        return prev.map((line) =>
          line.item_id === selectedItemId ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...prev, { item_id: selectedItemId, quantity: 1 }];
    });
  }

  function itemName(itemId: string) {
    return itemById.get(itemId)?.item_name ?? zoneItemById.get(itemId)?.item_name ?? itemId;
  }

  function itemCode(itemId: string) {
    return itemById.get(itemId)?.mes_code ?? zoneItemById.get(itemId)?.mes_code ?? null;
  }

  async function saveZone() {
    await onSaveZone(zone.id, {
      label: draft.label.trim() || zone.label,
      zone_type: draft.zone_type,
      pos_x: Math.max(0, Math.floor(Number(draft.pos_x) || 0)),
      pos_y: Math.max(0, Math.floor(Number(draft.pos_y) || 0)),
      width: Math.max(20, Math.floor(Number(draft.width) || zone.width)),
      height: Math.max(20, Math.floor(Number(draft.height) || zone.height)),
    });
  }

  async function saveItems() {
    await onSaveItems(
      zone.id,
      lines
        .filter((line) => line.quantity > 0)
        .map((line) => ({ item_id: line.item_id, quantity: Math.floor(line.quantity) })),
    );
  }

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: LEGACY_COLORS.text, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {zone.label}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: isPallet ? LEGACY_COLORS.green : LEGACY_COLORS.yellow }}>
              {isPallet ? "PL 적재" : "통로 적재"} · {zone.items.length}품목 · {totalQty}
            </div>
          </div>
          {editable && (
            <button
              type="button"
              onClick={() => void onDeleteZone(zone.id)}
              disabled={busy}
              aria-label="구역 삭제"
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: LEGACY_COLORS.red,
                background: LEGACY_COLORS.s2,
                border: `1px solid ${LEGACY_COLORS.border}`,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.45 : 1,
              }}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {editable && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 104px", gap: 8 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 800, color: LEGACY_COLORS.muted2 }}>
                이름
                <input style={inputStyle} value={draft.label} onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 800, color: LEGACY_COLORS.muted2 }}>
                유형
                <select
                  style={inputStyle}
                  value={draft.zone_type}
                  onChange={(e) => setDraft((prev) => ({ ...prev, zone_type: e.target.value as "aisle" | "pallet" }))}
                >
                  <option value="aisle">통로</option>
                  <option value="pallet">PL</option>
                </select>
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {[
                ["X", "pos_x"],
                ["Y", "pos_y"],
                ["W", "width"],
                ["H", "height"],
              ].map(([label, key]) => (
                <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 800, color: LEGACY_COLORS.muted2 }}>
                  {label}
                  <input
                    type="number"
                    min={key === "width" || key === "height" ? 20 : 0}
                    style={inputStyle}
                    value={draft[key as "pos_x" | "pos_y" | "width" | "height"]}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void saveZone()}
              disabled={busy}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                height: 36,
                borderRadius: 12,
                background: LEGACY_COLORS.blue,
                color: "#fff",
                fontSize: 13,
                fontWeight: 800,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.5 : 1,
              }}
            >
              <Save size={14} /> 위치 저장
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: LEGACY_COLORS.text }}>적재 품목</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: LEGACY_COLORS.muted2 }}>합계 {totalQty}</div>
          </div>

          {lines.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: LEGACY_COLORS.muted, fontSize: 13 }}>
              적재 품목이 없습니다
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {lines.map((line) => (
                <div
                  key={line.item_id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: editable ? "minmax(0, 1fr) 68px 28px" : "minmax(0, 1fr) 48px",
                    gap: 8,
                    alignItems: "center",
                    padding: "9px 10px",
                    borderRadius: 12,
                    background: LEGACY_COLORS.s2,
                    border: `1px solid ${LEGACY_COLORS.border}`,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 700, color: LEGACY_COLORS.text }}>
                      {itemName(line.item_id)}
                    </div>
                    {itemCode(line.item_id) && (
                      <div style={{ marginTop: 1, fontSize: 11, color: LEGACY_COLORS.muted2 }}>{itemCode(line.item_id)}</div>
                    )}
                  </div>
                  {editable ? (
                    <>
                      <input
                        type="number"
                        min={0}
                        value={line.quantity}
                        onChange={(e) => updateLine(line.item_id, Number(e.target.value))}
                        style={{ ...inputStyle, textAlign: "center", padding: "6px 4px" }}
                      />
                      <button
                        type="button"
                        onClick={() => removeLine(line.item_id)}
                        disabled={busy}
                        aria-label="품목 제거"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: LEGACY_COLORS.muted2,
                          cursor: busy ? "not-allowed" : "pointer",
                        }}
                      >
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <div style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: LEGACY_COLORS.muted2 }}>×{line.quantity}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {editable && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 40px", gap: 8 }}>
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                style={inputStyle}
                disabled={items.length === 0}
              >
                {items.length === 0 ? (
                  <option value="">품목 없음</option>
                ) : (
                  items.map((item) => (
                    <option key={item.item_id} value={item.item_id}>
                      {item.mes_code ? `${item.mes_code} · ` : ""}{item.item_name}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                onClick={addSelectedItem}
                disabled={busy || !selectedItemId}
                aria-label="품목 추가"
                style={{
                  height: 36,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  background: LEGACY_COLORS.blue,
                  cursor: busy || !selectedItemId ? "not-allowed" : "pointer",
                  opacity: busy || !selectedItemId ? 0.5 : 1,
                }}
              >
                <Plus size={15} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => void saveItems()}
              disabled={busy}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                height: 38,
                borderRadius: 12,
                background: LEGACY_COLORS.s2,
                border: `1px solid ${LEGACY_COLORS.border}`,
                color: LEGACY_COLORS.text,
                fontSize: 13,
                fontWeight: 800,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.5 : 1,
              }}
            >
              <Save size={14} /> 적재 품목 저장
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
