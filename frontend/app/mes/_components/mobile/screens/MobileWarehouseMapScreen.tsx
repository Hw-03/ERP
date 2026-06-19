"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, X } from "lucide-react";
import { warehouseMapApi, type WarehouseAngle, type WarehouseMap } from "@/lib/api/warehouse-map";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { buildCellIndex, cellKey, rowLabel } from "../../_warehouse_map_sections/helpers";
import { FloorStage, FrontStage } from "../../_warehouse_map_sections/WarehouseStages";
import { WarehouseJariPanel } from "../../_warehouse_map_sections/WarehouseJariPanel";
import { InlineSearch } from "../primitives";
import { TYPO } from "../tokens";

interface CellHit {
  angleId: number;
  row: number;
  layer: number;
  names: string[];
}

function SearchResults({
  results,
  angles,
  onOpen,
}: {
  results: CellHit[];
  angles: WarehouseAngle[];
  onOpen: (angleId: number, row: number, layer: number) => void;
}) {
  if (results.length === 0) {
    return (
      <div className={TYPO.body} style={{ color: LEGACY_COLORS.muted2 }}>
        일치하는 품목이 없습니다.
      </div>
    );
  }
  const angleLabel = (id: number) => angles.find((a) => a.id === id)?.label ?? `앵글 ${id}`;
  return (
    <div className="flex flex-col gap-2">
      {results.map((r) => (
        <button
          key={`${r.angleId}-${r.row}-${r.layer}`}
          type="button"
          onClick={() => onOpen(r.angleId, r.row, r.layer)}
          className="flex items-center gap-3 rounded-[16px] border px-4 py-3 text-left transition-[transform] active:scale-[0.98]"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="min-w-0 flex-1">
            <div className={clsx(TYPO.body, "font-black")} style={{ color: LEGACY_COLORS.text }}>
              {angleLabel(r.angleId)} · {rowLabel(r.row)}열 {r.layer}층
            </div>
            <div className={clsx(TYPO.caption, "truncate")} style={{ color: LEGACY_COLORS.muted2 }}>
              {r.names.join(", ")}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/**
 * 창고 지도 모바일 화면 — 항목 2-10: 가로 전용 전면 재설계.
 *
 * 폰을 세로로 들어도 CSS `rotate(90deg)` 로 강제 가로 전체 오버레이를 띄운다(사용자 결정: "무조건 가로").
 * PC 평면도/정면도 컴포넌트(FloorStage/FrontStage)와 읽기전용 상세 패널(WarehouseJariPanel)을 그대로
 * 재사용해 "처음 앵글 배치를 PC처럼" 보여준다. 드릴다운: 평면도 → 정면도 → (칸 탭) 우측 상세 패널.
 * 데스크톱 전용 뷰(DesktopWarehouseMapView)·스테이지·헬퍼는 무변경(데이터/컴포넌트만 재사용).
 */
export function MobileWarehouseMapScreen({
  onStatusChange,
  onExit,
}: {
  onStatusChange?: (s: string) => void;
  /** 평면도에서 뒤로/닫기 시 지도 탭에서 나간다(더보기로 복귀). */
  onExit: () => void;
}) {
  const [map, setMap] = useState<WarehouseMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // 자체 상태머신(데스크톱 history 없이) — stage(floor|front) + 선택 앵글 + 상세 칸 + 검색.
  const [stage, setStage] = useState<"floor" | "front">("floor");
  const [curAngleId, setCurAngleId] = useState<number | null>(null);
  const [detailCell, setDetailCell] = useState<{ row: number; layer: number } | null>(null);
  const [search, setSearch] = useState("");
  const [matchQuery, setMatchQuery] = useState(""); // 상세 패널 하이라이트(검색 진입 시에만)

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    warehouseMapApi
      .getMap()
      .then((res) => {
        if (!cancelled) setMap(res);
      })
      .catch(() => {
        if (!cancelled) {
          setError("창고 지도를 불러오지 못했습니다.");
          onStatusChange?.("창고 지도 로드 실패");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadNonce, onStatusChange]);

  const cellIndex = useMemo(() => buildCellIndex(map?.boxes ?? []), [map]);
  const angles = useMemo(
    () =>
      (map?.angles ?? [])
        .filter((a) => a.is_active)
        .sort((a, b) => a.display_order - b.display_order),
    [map],
  );
  const curAngle = angles.find((a) => a.id === curAngleId) ?? null;

  const searchResults = useMemo<CellHit[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q || !map) return [];
    const byCell = new Map<
      string,
      { angleId: number; row: number; layer: number; names: Set<string> }
    >();
    for (const b of map.boxes) {
      for (const it of b.items) {
        if (it.item_name.toLowerCase().includes(q) || (it.mes_code ?? "").toLowerCase().includes(q)) {
          const k = cellKey(b.angle_id, b.row_no, b.layer_no);
          let e = byCell.get(k);
          if (!e) {
            e = { angleId: b.angle_id, row: b.row_no, layer: b.layer_no, names: new Set() };
            byCell.set(k, e);
          }
          e.names.add(it.item_name);
        }
      }
    }
    return Array.from(byCell.values(), (e) => ({
      angleId: e.angleId,
      row: e.row,
      layer: e.layer,
      names: Array.from(e.names),
    }));
  }, [search, map]);

  function openAngle(a: WarehouseAngle) {
    setCurAngleId(a.id);
    setStage("front");
    setDetailCell(null);
    setMatchQuery("");
    setSearch("");
  }
  function openCell(row: number, layer: number) {
    setDetailCell({ row, layer });
    setMatchQuery("");
  }
  function closeDetail() {
    setDetailCell(null);
    setMatchQuery("");
  }
  // 검색 결과 탭 → 해당 앵글 정면도 + 그 칸 상세 패널(검색어 하이라이트).
  function openHit(angleId: number, row: number, layer: number) {
    setCurAngleId(angleId);
    setStage("front");
    setDetailCell({ row, layer });
    setMatchQuery(search.trim());
    setSearch("");
  }
  function back() {
    if (detailCell) {
      closeDetail();
    } else if (stage === "front") {
      setStage("floor");
      setCurAngleId(null);
    } else {
      onExit();
    }
  }

  const searching = search.trim().length > 0;

  return (
    // 강제 가로 전체 오버레이. top:0/left:0 + transform-origin top-left + rotate(90deg) translateY(-100%)
    // 로 (100vh×100vw) 박스를 뷰포트에 꽉 채운다. position:fixed 라 MobileShell 의 overflow-hidden·헤더·
    // 네비를 덮는다. z-index 250 = 토스트(300) 아래 · 네비 위.
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vh",
        height: "100vw",
        transformOrigin: "top left",
        transform: "rotate(90deg) translateY(-100%)",
        zIndex: 250,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: LEGACY_COLORS.bg,
        color: LEGACY_COLORS.text,
      }}
      data-testid="warehouse-map-landscape"
    >
      {/* 상단 바 — 뒤로 + 브레드크럼 + 검색 */}
      <div
        className="flex shrink-0 items-center gap-3 border-b px-4 py-2"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <button
          type="button"
          onClick={back}
          aria-label="뒤로"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-opacity active:opacity-60"
          style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className={clsx(TYPO.body, "min-w-0 flex-1 truncate font-black")} style={{ color: LEGACY_COLORS.text }}>
          창고 지도
          {curAngle && stage === "front" && (
            <span style={{ color: LEGACY_COLORS.muted2 }}> › {curAngle.label}</span>
          )}
        </div>
        <div className="w-[280px] shrink-0">
          <InlineSearch value={search} onChange={setSearch} placeholder="품목명·코드로 위치 찾기" />
        </div>
      </div>

      {/* 본문 */}
      {loading && !map ? (
        <CenterNote>창고 지도를 불러오는 중…</CenterNote>
      ) : error ? (
        <CenterNote>
          {error}
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            className="mt-3 rounded-[12px] border px-4 py-2 text-sm font-bold"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text, background: LEGACY_COLORS.s2 }}
          >
            다시 시도
          </button>
        </CenterNote>
      ) : searching ? (
        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <SearchResults results={searchResults} angles={angles} onOpen={openHit} />
        </div>
      ) : stage === "front" && curAngle ? (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1" style={{ minHeight: 0 }}>
            <FrontStage
              angle={curAngle}
              cellIndex={cellIndex}
              showSlotLabels
              pulseCellKey={detailCell ? cellKey(curAngle.id, detailCell.row, detailCell.layer) : null}
              onCellClick={openCell}
            />
          </div>
          {detailCell && (
            <div
              className="relative shrink-0 border-l"
              style={{ width: 340, borderColor: LEGACY_COLORS.border, display: "flex", padding: 10 }}
            >
              <WarehouseJariPanel
                angle={curAngle}
                row={detailCell.row}
                layer={detailCell.layer}
                cellIndex={cellIndex}
                matchQuery={matchQuery}
              />
              <button
                type="button"
                onClick={closeDetail}
                aria-label="상세 닫기"
                className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-opacity active:opacity-60"
                style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <FloorStage angles={angles} onAngleClick={openAngle} />
        </div>
      )}
    </div>
  );
}

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center text-sm font-bold"
      style={{ color: LEGACY_COLORS.muted2 }}
    >
      {children}
    </div>
  );
}
