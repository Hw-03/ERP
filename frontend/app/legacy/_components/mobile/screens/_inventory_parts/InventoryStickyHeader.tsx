"use client";

import { Filter, History } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../../tokens";
import {
  IconButton,
  InlineSearch,
  KpiCard,
  SummaryChipBar,
  type SummaryChip,
} from "../../primitives";
import {
  DEFAULT_INVENTORY_FILTERS,
  type InventoryFilters,
} from "../InventoryFilterSheet";

/**
 * Round-13 (#5) 추출 — InventoryScreen 의 sticky 상단 (검색 + KPI + 활성 chip).
 *
 * `selecting` 시에는 부모에서 InventorySelectionBanner 를 대신 표시 — 본 컴포넌트는
 * 일반 모드 UI 만 담당.
 */
export interface InventoryStickyHeaderProps {
  search: string;
  setSearch: (v: string) => void;
  onOpenHistory: () => void;
  onOpenFilter: () => void;
  activeFilterCount: number;
  totalsNormal: number;
  totalsLow: number;
  totalsZero: number;
  filters: InventoryFilters;
  onToggleKpi: (next: InventoryFilters["kpi"]) => void;
  activeChips: SummaryChip[];
  setFilters: (f: InventoryFilters) => void;
}

export function InventoryStickyHeader({
  search,
  setSearch,
  onOpenHistory,
  onOpenFilter,
  activeFilterCount,
  totalsNormal,
  totalsLow,
  totalsZero,
  filters,
  onToggleKpi,
  activeChips,
  setFilters,
}: InventoryStickyHeaderProps) {
  return (
    <div className="flex flex-col gap-3 px-4 pt-3 pb-3">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <InlineSearch
            value={search}
            onChange={setSearch}
            placeholder="품명 · 코드 · 모델 · 공급처"
          />
        </div>
        <IconButton
          icon={History}
          label="이력"
          size="md"
          onClick={onOpenHistory}
          color={LEGACY_COLORS.muted2}
        />
        <IconButton
          icon={Filter}
          label="필터"
          size="md"
          onClick={onOpenFilter}
          color={activeFilterCount > 0 ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2}
          badge={activeFilterCount}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <KpiCard
          label="정상"
          value={totalsNormal}
          color={LEGACY_COLORS.green}
          active={filters.kpi === "OK"}
          onClick={() => onToggleKpi("OK")}
        />
        <KpiCard
          label="부족"
          value={totalsLow}
          color={LEGACY_COLORS.yellow}
          active={filters.kpi === "LOW"}
          onClick={() => onToggleKpi("LOW")}
        />
        <KpiCard
          label="품절"
          value={totalsZero}
          color={LEGACY_COLORS.red}
          active={filters.kpi === "ZERO"}
          onClick={() => onToggleKpi("ZERO")}
        />
      </div>

      {activeChips.length > 0 ? (
        <SummaryChipBar
          chips={activeChips}
          trailing={
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_INVENTORY_FILTERS)}
              className={`${TYPO.caption} rounded-full px-3 py-[6px] font-semibold active:scale-95`}
              style={{ color: LEGACY_COLORS.muted2, background: "transparent" }}
            >
              전체 초기화
            </button>
          }
        />
      ) : null}
    </div>
  );
}
