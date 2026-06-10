"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { warehouseMapApi, type WarehouseAngle, type WarehouseMap } from "@/lib/api/warehouse-map";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { buildCellIndex, cellKey, rowLabel } from "../../_warehouse_map_sections/helpers";
import { AsyncState, InlineSearch } from "../primitives";
import { TYPO } from "../tokens";
import { MobileAngleList } from "../_warehouse_map/MobileAngleList";
import { MobileAngleGrid } from "../_warehouse_map/MobileAngleGrid";
import { MobileJariSheet } from "../_warehouse_map/MobileJariSheet";

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
 * 창고 지도 모바일 화면. 데스크톱 전용 뷰를 대체하는 모바일 신설(데이터·헬퍼만 재사용).
 * 드릴다운: 앵글 목록 → 앵글 열×층 그리드 → 셀 BottomSheet(자리별 박스·품목). 보기 전용.
 */
export function MobileWarehouseMapScreen({
  onStatusChange,
}: {
  onStatusChange?: (s: string) => void;
}) {
  const [map, setMap] = useState<WarehouseMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [curAngleId, setCurAngleId] = useState<number | null>(null);
  const [sheetCell, setSheetCell] = useState<{ row: number; layer: number } | null>(null);
  const [search, setSearch] = useState("");

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

  function openCell(angleId: number, row: number, layer: number) {
    setCurAngleId(angleId);
    setSheetCell({ row, layer });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ background: LEGACY_COLORS.bg }}>
      {curAngle ? (
        <MobileAngleGrid
          angle={curAngle}
          cellIndex={cellIndex}
          onBack={() => setCurAngleId(null)}
          onOpenCell={(row, layer) => setSheetCell({ row, layer })}
        />
      ) : (
        <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-6 pt-3">
          <InlineSearch
            value={search}
            onChange={setSearch}
            placeholder="품목명 또는 코드로 위치 찾기"
          />
          <AsyncState
            loading={loading && !map}
            error={error}
            onRetry={() => setReloadNonce((n) => n + 1)}
          >
            {search.trim() ? (
              <SearchResults results={searchResults} angles={angles} onOpen={openCell} />
            ) : (
              <MobileAngleList angles={angles} cellIndex={cellIndex} onSelect={(id) => setCurAngleId(id)} />
            )}
          </AsyncState>
        </div>
      )}

      {sheetCell && curAngle && (
        <MobileJariSheet
          angle={curAngle}
          row={sheetCell.row}
          layer={sheetCell.layer}
          cellBoxes={cellIndex.get(cellKey(curAngle.id, sheetCell.row, sheetCell.layer))}
          matchQuery={search.trim()}
          onClose={() => setSheetCell(null)}
        />
      )}
    </div>
  );
}
