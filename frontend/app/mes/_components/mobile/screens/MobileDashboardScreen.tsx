"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { api, type Item, type ProductModel, type ProductionCapacity, type TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { mesCodeDept } from "@/lib/mes/process";
import { SlidersHorizontal } from "lucide-react";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { InlineSearch } from "../primitives";
import { InventoryKpiPanel, type KpiFilter } from "../../_inventory_sections/InventoryKpiPanel";
import { InventoryCapacityPanel } from "../../_inventory_sections/InventoryCapacityPanel";
import { InventoryFilters } from "../../_inventory_sections/InventoryFilterBar";
import { InventoryItemsTable } from "../../_inventory_sections/InventoryItemsTable";
import { InventoryDetailPanel } from "../../_inventory_sections/InventoryDetailPanel";
import { useInventoryData } from "../../_hooks/useInventoryData";
import { useDesktopInventoryDerivations } from "../../_hooks/useDesktopInventoryDerivations";
import { useItemImageManifest } from "../../_hooks/useItemImageManifest";
import { matchesKpi, matchesSearch } from "../../_inventory_sections/inventoryFilter";
import { useModelsQuery } from "@/lib/queries/useModelsQuery";

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
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  onGoToWarehouse: (item: Item) => void;
  onGoToWarehouseTab?: () => void;
  onSummaryChange?: (s: { low: number; zero: number }) => void;
  capacityData?: ProductionCapacity | null;
  onCapacityClick?: () => void;
}) {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemLogs, setItemLogs] = useState<TransactionLog[]>([]);
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
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedProcessSteps, setSelectedProcessSteps] = useState<string[]>([]);
  const productModels = useModelsQuery().data ?? EMPTY_MODELS;
  const [kpi, setKpi] = useState<KpiFilter>("ALL");
  const [localSearch, setLocalSearch] = useState("");
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const lastSelectedItemRef = useRef<Item | null>(null);
  const deferredLocalSearch = useDeferredValue(localSearch.trim().toLowerCase());

  function toggleDept(v: string) {
    setSelectedDepts((prev) => (prev.includes(v) ? prev.filter((d) => d !== v) : [...prev, v]));
    setDisplayLimit(PAGE_SIZE);
  }
  function toggleModel(v: string) {
    setSelectedModels((prev) => (prev.includes(v) ? prev.filter((m) => m !== v) : [...prev, v]));
    setDisplayLimit(PAGE_SIZE);
  }
  function toggleProcessStep(v: string) {
    setSelectedProcessSteps((prev) => (prev.includes(v) ? prev.filter((p) => p !== v) : [...prev, v]));
    setDisplayLimit(PAGE_SIZE);
  }

  useEffect(() => {
    if (!selectedItem) {
      setItemLogs([]);
      return;
    }
    void api
      .getTransactions({ itemId: selectedItem.item_id, limit: 5 })
      .then(setItemLogs)
      .catch(() => setItemLogs([]));
  }, [selectedItem]);

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
          const stage = item.process_type_code?.slice(-1).toUpperCase() ?? "";
          if (!selectedProcessSteps.includes(stage)) return false;
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
  }, []);

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
            <div className="mt-3">
              <InventoryCapacityPanel capacityData={capacityData} onClick={onCapacityClick} />
            </div>
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
              {filtersOpen && (
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
              )}
            </div>
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
                logs={itemLogs}
                onGoToWarehouse={(item) => {
                  setSelectedItem(null);
                  onGoToWarehouse(item);
                }}
              />
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
