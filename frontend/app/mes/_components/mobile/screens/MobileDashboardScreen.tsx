"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { api, type Item, type ProductModel, type ProductionCapacity } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { mesCodeDept } from "@/lib/mes/process";
import { ChevronDown, SlidersHorizontal, Zap } from "lucide-react";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { InlineSearch } from "../primitives";
import { InventoryKpiPanel, type KpiFilter } from "../../_inventory_sections/InventoryKpiPanel";
import { InventoryCapacityPanel, capacityStatusBadge } from "../../_inventory_sections/InventoryCapacityPanel";
import { InventoryFilters } from "../../_inventory_sections/InventoryFilterBar";
import { InventoryItemsTable } from "../../_inventory_sections/InventoryItemsTable";
import { InventoryDetailPanel } from "../../_inventory_sections/InventoryDetailPanel";
import { useInventoryData } from "../../_hooks/useInventoryData";
import { useDesktopInventoryDerivations } from "../../_hooks/useDesktopInventoryDerivations";
import { useItemImageManifest } from "../../_hooks/useItemImageManifest";
import { useToggleSet } from "../../_hooks/useToggleSet";
import { matchesKpi, matchesSearch } from "../../_inventory_sections/inventoryFilter";
import { useModelsQuery } from "@/lib/queries/useModelsQuery";
import type { IoEntryIntent } from "../../_warehouse_v2/types";

const PAGE_SIZE = 100;

// 안정 참조 — useModelsQuery 미로딩 시 동일 빈 배열을 재사용해 useMemo 의존성을 흔들지 않는다.
const EMPTY_MODELS: ProductModel[] = [];

/**
 * 대시보드 모바일 화면.
 *
 * DesktopInventoryView 의 데이터 오케스트레이션(훅/필터/파생)을 그대로 재사용하되,
 * 데스크탑의 우측 SlidePanel 상세를 모바일 친화적인 드래그-투-디스미스 BottomSheet
 * 로 교체한다. 상단 KPI/생산가능/필터/리스트는 이미 반응형인 기존 섹션을 재사용.
 */
export function MobileDashboardScreen({
  globalSearch,
  onStatusChange,
  onGoToWarehouse,
  capacityData,
  onCapacityClick,
  onSummaryChange,
  canReceive,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  onGoToWarehouse: (item: Item, intent?: IoEntryIntent) => void;
  onGoToWarehouseTab?: () => void;
  onSummaryChange?: (s: { low: number; zero: number }) => void;
  capacityData?: ProductionCapacity | null;
  onCapacityClick?: () => void;
  canReceive?: boolean;
}) {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const onSelectedSync = useCallback(
    (next: Item[]) =>
      setSelectedItem((current) =>
        current ? next.find((item) => item.item_id === current.item_id) ?? null : null,
      ),
    [],
  );
  const { items, loading, error, loadItems } = useInventoryData({
    globalSearch,
    onStatusChange,
    onSelectedSync,
  });
  const imageManifest = useItemImageManifest();
  const productModels = useModelsQuery().data ?? EMPTY_MODELS;
  const [kpi, setKpi] = useState<KpiFilter>("ALL");
  const [localSearch, setLocalSearch] = useState("");
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // 생산 가능 현황은 첫 화면 면적을 크게 차지하므로 기본 접힘 — 품목 목록을 위로 끌어올린다(리뷰 §4.2).
  const [capacityOpen, setCapacityOpen] = useState(false);

  const lastSelectedItemRef = useRef<Item | null>(null);
  const deferredLocalSearch = useDeferredValue(localSearch.trim().toLowerCase());

  const { selected: selectedDepts, toggle: toggleDept, setSelected: setSelectedDepts } =
    useToggleSet(() => setDisplayLimit(PAGE_SIZE));
  const { selected: selectedModels, toggle: toggleModel, setSelected: setSelectedModels } =
    useToggleSet(() => setDisplayLimit(PAGE_SIZE));
  const { selected: selectedProcessSteps, toggle: toggleProcessStep, setSelected: setSelectedProcessSteps } =
    useToggleSet(() => setDisplayLimit(PAGE_SIZE));

  const showUnclassified = selectedModels.includes("미분류");

  const selectedSlots = useMemo(
    () => new Set(productModels.filter((m) => selectedModels.includes(m.model_name ?? "")).map((m) => m.slot)),
    [productModels, selectedModels],
  );

  const scopedItems = useMemo(
    () =>
      items.filter((item) => {
        if (!matchesSearch(item, deferredLocalSearch)) return false;
        if (selectedDepts.length > 0) {
          const inDept = selectedDepts.some((d) =>
            d === "창고"
              ? (item.warehouse_qty ?? 0) > 0
              : item.department === d ||
                mesCodeDept(item.mes_code) === d ||
                item.locations.some((loc) => loc.department === d),
          );
          if (!inDept) return false;
        }
        if (selectedSlots.size > 0 || showUnclassified) {
          const matchesSlot = selectedSlots.size > 0 && item.model_slots.some((s) => selectedSlots.has(s));
          const matchesUnclassified = showUnclassified && item.model_slots.length === 0;
          if (!matchesSlot && !matchesUnclassified) return false;
        }
        if (selectedProcessSteps.length > 0) {
          // 데스크톱 DesktopInventoryView 와 동일 — 공용 InventoryFilters 의 "불량(DEFECT)"
          // 칩은 공정 스테이지(R/A/F)가 아니라 DEFECTIVE 재고 보유 여부로 매칭한다.
          const stage = item.process_type_code?.slice(-1).toUpperCase() ?? "";
          const hasDefect = item.locations.some(
            (loc) => loc.status === "DEFECTIVE" && (loc.quantity ?? 0) > 0,
          );
          const matches = selectedProcessSteps.some(
            (s) => s === stage || (s === "DEFECT" && hasDefect),
          );
          if (!matches) return false;
        }
        return true;
      }),
    [items, deferredLocalSearch, selectedDepts, selectedSlots, showUnclassified, selectedProcessSteps],
  );
  const filteredItems = useMemo(() => scopedItems.filter((item) => matchesKpi(item, kpi)), [scopedItems, kpi]);

  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [filteredItems]);

  // 필터 변경 시 짧은 스켈레톤(200ms) — 즉시 결과가 깜빡이는 인지부담 완화.
  const [filterChanging, setFilterChanging] = useState(false);
  useEffect(() => {
    setFilterChanging(true);
    const t = setTimeout(() => setFilterChanging(false), 200);
    return () => clearTimeout(t);
  }, [selectedDepts, selectedModels, selectedProcessSteps, kpi]);

  if (selectedItem) lastSelectedItemRef.current = selectedItem;
  const displayItem = selectedItem ?? lastSelectedItemRef.current;

  const { isFiltered, activeFilterCount, kpiCards, headerBadge } = useDesktopInventoryDerivations({
    items,
    scopedItems,
    filteredItems,
    selectedDepts,
    selectedModels,
    selectedProcessSteps,
    deferredLocalSearch,
    displayItem,
    onSummaryChange,
  });

  const resetAllFilters = useCallback(() => {
    setSelectedDepts([]);
    setSelectedModels([]);
    setSelectedProcessSteps([]);
    setLocalSearch("");
    setKpi("ALL");
  }, [setSelectedDepts, setSelectedModels, setSelectedProcessSteps]);

  const capacityBadge = capacityStatusBadge(capacityData);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        className="scrollbar-hide min-h-0 min-w-0 flex-1 overflow-y-auto"
        style={{ background: LEGACY_COLORS.bg }}
      >
        <div className="flex flex-col gap-3 px-3 pb-6 pt-3">
          <section className="card" style={{ padding: "14px 16px" }}>
            <InventoryKpiPanel
              cards={kpiCards}
              activeKey={kpi}
              onChange={(key) => {
                if (key === "ALL") resetAllFilters();
                else setKpi(key);
              }}
            />
            {capacityData && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setCapacityOpen((o) => !o)}
                  aria-expanded={capacityOpen}
                  className="flex w-full items-center justify-between gap-2 rounded-[12px] border px-3 py-2.5 text-left transition-[transform] active:scale-[0.99]"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                >
                  <span
                    className="flex min-w-0 items-center gap-2 text-sm font-black"
                    style={{ color: LEGACY_COLORS.text }}
                  >
                    <Zap className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                    <span className="shrink-0">생산 가능 현황</span>
                    {/* 항목 1 — 상태는 펼친 패널 헤더 대신 토글 버튼 우측 배지로 노출 */}
                    {capacityBadge && (
                      <span
                        className="truncate rounded-full px-2 py-0.5 text-[11px] font-bold"
                        style={{
                          background: `color-mix(in srgb, ${capacityBadge.color} 16%, transparent)`,
                          color: capacityBadge.color,
                        }}
                      >
                        {capacityBadge.label}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 transition-transform"
                    style={{
                      color: LEGACY_COLORS.muted2,
                      transform: capacityOpen ? "rotate(180deg)" : undefined,
                    }}
                  />
                </button>
                {capacityOpen && (
                  <div className="mt-2 flex flex-col gap-2">
                    {/* 항목 1 — 인라인 패널은 표만(클릭 X), 자세히 보기는 아래 전폭 버튼으로 분리 */}
                    <InventoryCapacityPanel capacityData={capacityData} />
                    <button
                      type="button"
                      onClick={onCapacityClick}
                      className="w-full rounded-[12px] border px-3 py-2.5 text-sm font-bold transition-[transform] active:scale-[0.99]"
                      style={{
                        background: LEGACY_COLORS.s2,
                        borderColor: LEGACY_COLORS.border,
                        color: LEGACY_COLORS.blue,
                      }}
                    >
                      자세히 보기 →
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          <section
            className="card"
            style={{ backgroundImage: "linear-gradient(rgba(101, 169, 255, 0.08), rgba(101, 169, 255, 0.08))" }}
          >
            {/* 모바일 검색/필터 바 — 데스크탑 sticky 헤더 대신 ≥44px 터치 타깃 */}
            <div
              className="sticky top-0 z-10 flex flex-col gap-2 p-2.5"
              style={{ background: LEGACY_COLORS.s1 }}
            >
              <div className="flex items-center gap-2">
                <InlineSearch
                  value={localSearch}
                  onChange={setLocalSearch}
                  placeholder="품명 · 코드 · 위치 · 공급처"
                  className="min-w-0 flex-1"
                />
                <button
                  type="button"
                  onClick={() => setFiltersOpen((prev) => !prev)}
                  aria-label={filtersOpen ? "필터 닫기" : "필터 열기"}
                  aria-expanded={filtersOpen}
                  className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border transition-[transform] active:scale-95"
                  style={{
                    background: filtersOpen || isFiltered ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
                    borderColor: LEGACY_COLORS.border,
                    color: filtersOpen || isFiltered ? LEGACY_COLORS.white : LEGACY_COLORS.muted,
                  }}
                >
                  <SlidersHorizontal size={18} strokeWidth={2} />
                  {activeFilterCount > 0 && (
                    <span
                      className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold"
                      style={{ background: LEGACY_COLORS.red, color: LEGACY_COLORS.white }}
                    >
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
              <div
                className="flex items-center justify-between px-0.5 text-xs font-semibold"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                <span>총 {filteredItems.length}건</span>
                {isFiltered && (
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="rounded-full px-2 py-1 font-bold"
                    style={{ color: LEGACY_COLORS.blue }}
                  >
                    필터 초기화
                  </button>
                )}
              </div>
            </div>
            {/* 항목 2 — 필터 칩은 sticky 밖(일반 흐름)에 둬서 열려도 목록을 가리지 않고 아래로 밀어낸다. */}
            {filtersOpen && (
              <div className="px-2.5 pb-2.5">
                <InventoryFilters
                  open={filtersOpen}
                  selectedDepts={selectedDepts}
                  selectedModels={selectedModels}
                  selectedProcessSteps={selectedProcessSteps}
                  productModels={productModels}
                  toggleDept={toggleDept}
                  toggleModel={toggleModel}
                  toggleProcessStep={toggleProcessStep}
                  onClearDepts={() => setSelectedDepts([])}
                  onClearModels={() => setSelectedModels([])}
                  onClearProcessSteps={() => setSelectedProcessSteps([])}
                  onResetAll={resetAllFilters}
                  isAnyFilterActive={isFiltered}
                />
              </div>
            )}
            <InventoryItemsTable
              error={error}
              loading={loading || filterChanging}
              filteredItems={filteredItems}
              displayLimit={displayLimit}
              setDisplayLimit={setDisplayLimit}
              selectedItem={selectedItem}
              onSelectItem={setSelectedItem}
              activeFilterCount={activeFilterCount}
              hasKpiFilter={kpi !== "ALL"}
              onRetry={() => void loadItems()}
              onResetAllFilters={resetAllFilters}
              imageManifest={imageManifest}
            />
          </section>
        </div>
      </div>

      <BottomSheet
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        ariaLabel={displayItem ? `${displayItem.item_name} 상세` : "품목 상세"}
      >
        {displayItem && (
          <div className="px-5">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-black leading-tight" style={{ color: LEGACY_COLORS.text }}>
                  {displayItem.item_name}
                </div>
                <div className="mt-0.5 truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                  {displayItem.legacy_part
                    ? `${displayItem.mes_code} · ${displayItem.legacy_part}`
                    : displayItem.mes_code ?? "-"}
                </div>
              </div>
              {headerBadge}
            </div>
            <div className="mt-3">
              <InventoryDetailPanel
                item={displayItem}
                onGoToWarehouse={(item, intent) => {
                  setSelectedItem(null);
                  onGoToWarehouse(item, intent);
                }}
                canReceive={canReceive}
                quickActionVariant="mobile"
                imageFilename={displayItem.mes_code ? imageManifest?.[displayItem.mes_code] : undefined}
              />
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
