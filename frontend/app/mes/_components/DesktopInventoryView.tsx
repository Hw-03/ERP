"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { api, type Item, type ProductModel, type ProductionCapacity } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { mesCodeDept } from "@/lib/mes/process";
import { InventoryKpiPanel, type KpiFilter } from "./_inventory_sections/InventoryKpiPanel";
import { InventoryCapacityPanel } from "./_inventory_sections/InventoryCapacityPanel";
import { InventoryFilterToggleButton } from "./_inventory_sections/InventoryFilterToggleButton";
import {
  InventoryFilters,
  InventoryTableStickyHeader,
} from "./_inventory_sections/InventoryFilterBar";
import { InventoryItemsTable } from "./_inventory_sections/InventoryItemsTable";
import { DesktopInventoryRightPanel } from "./_inventory_sections/DesktopInventoryRightPanel";
import { useInventoryData } from "./_hooks/useInventoryData";
import { useDesktopInventoryDerivations } from "./_hooks/useDesktopInventoryDerivations";
import { useItemImageManifest } from "./_hooks/useItemImageManifest";
import { useToggleSet } from "./_hooks/useToggleSet";
import { useModelsQuery } from "@/lib/queries/useModelsQuery";
// R9-2: helper 4개 (getMinStock / safeQty / matchesSearch / matchesKpi) 분리
import { matchesKpi, matchesSearch } from "./_inventory_sections/inventoryFilter";

const DESKTOP_PAGE_SIZE = 100;

// 안정 참조 — useModelsQuery 미로딩 시 동일 빈 배열을 재사용해 useMemo 의존성을 흔들지 않는다.
const EMPTY_MODELS: ProductModel[] = [];


export function DesktopInventoryView({
  globalSearch,
  onStatusChange,
  onGoToWarehouse,
  onGoToWarehouseTab,
  onSummaryChange,
  capacityData,
  onCapacityClick,
  canReceive,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  onGoToWarehouse: (item: Item, intent?: import("./_warehouse_v2/types").IoEntryIntent) => void;
  onGoToWarehouseTab?: () => void;
  onSummaryChange?: (s: { low: number; zero: number }) => void;
  capacityData?: ProductionCapacity | null;
  onCapacityClick?: () => void;
  canReceive?: boolean;
}) {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  // R7-HOOK2: items/loading/error + loadItems 훅으로 분리
  const onSelectedSync = useCallback(
    (next: Item[]) =>
      setSelectedItem((current) =>
        current ? next.find((item) => item.item_id === current.item_id) ?? null : null,
      ),
    [],
  );
  const { items, setItems, loading, error, loadItems } = useInventoryData({
    globalSearch,
    onStatusChange,
    onSelectedSync,
  });
  const imageManifest = useItemImageManifest();
  const productModels = useModelsQuery().data ?? EMPTY_MODELS;
  const [kpi, setKpi] = useState<KpiFilter>("ALL");
  const [localSearch, setLocalSearch] = useState("");
  const [displayLimit, setDisplayLimit] = useState(DESKTOP_PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSelectedItemRef = useRef<Item | null>(null);
  const deferredLocalSearch = useDeferredValue(localSearch.trim().toLowerCase());

  // loadItems 본문은 useInventoryData 훅이 제공 (R7-HOOK2). 호출만 외부에서 가능.

  const { selected: selectedDepts, toggle: toggleDept, setSelected: setSelectedDepts } =
    useToggleSet(() => setDisplayLimit(DESKTOP_PAGE_SIZE));
  const { selected: selectedModels, toggle: toggleModel, setSelected: setSelectedModels } =
    useToggleSet(() => setDisplayLimit(DESKTOP_PAGE_SIZE));
  const { selected: selectedProcessSteps, toggle: toggleProcessStep, setSelected: setSelectedProcessSteps } =
    useToggleSet(() => setDisplayLimit(DESKTOP_PAGE_SIZE));

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
    setDisplayLimit(DESKTOP_PAGE_SIZE);
  }, [filteredItems]);

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

  function resetAllFilters() {
    setSelectedDepts([]);
    setSelectedModels([]);
    setSelectedProcessSteps([]);
    setLocalSearch("");
    setKpi("ALL");
  }

  return (
    <div className="flex min-h-0 flex-1 min-w-0 pl-0 lg:pr-4">
      {/* ── 좌측: 스크롤 컨테이너 ── */}
      <div
        ref={scrollRef}
        className="scrollbar-hide min-h-0 min-w-0 flex-1 overflow-y-auto rounded-[28px] border"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.bg }}
      >
        <div className="flex flex-col gap-3 pb-6">
          {/* ── 컴팩트 상단: KPI + 생산가능 + (접힘형) 필터 ── */}
          <section className="card" style={{ padding: "14px 16px" }}>
            <InventoryKpiPanel
              cards={kpiCards}
              activeKey={kpi}
              onChange={(key) => {
                if (key === "ALL") resetAllFilters();
                else setKpi(key);
              }}
            />
            <div className="mt-3 flex items-stretch gap-2">
              <InventoryCapacityPanel capacityData={capacityData} onClick={onCapacityClick} />
              <InventoryFilterToggleButton
                filtersOpen={filtersOpen}
                activeFilterCount={activeFilterCount}
                onToggle={() => setFiltersOpen((prev) => !prev)}
              />
            </div>
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
              isAnyFilterActive={
                selectedDepts.length > 0 ||
                selectedModels.length > 0 ||
                selectedProcessSteps.length > 0 ||
                kpi !== "ALL" ||
                localSearch.length > 0
              }
            />
          </section>

          {/* ── 재고 테이블 ── */}
          <section
            className="card"
            style={{ backgroundImage: "linear-gradient(rgba(101, 169, 255, 0.08), rgba(101, 169, 255, 0.08))" }}
          >
            <InventoryTableStickyHeader
              searchValue={localSearch}
              onSearchChange={setLocalSearch}
              count={filteredItems.length}
              isFiltered={isFiltered}
              onResetAllFilters={resetAllFilters}
            />
            <InventoryItemsTable
              error={error}
              loading={loading}
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

      <DesktopInventoryRightPanel
        selectedItem={selectedItem}
        displayItem={displayItem}
        headerBadge={headerBadge}
        onClose={() => setSelectedItem(null)}
        onGoToWarehouse={onGoToWarehouse}
        canReceive={canReceive}
        imageFilename={displayItem?.mes_code ? imageManifest[displayItem.mes_code] : undefined}
      />
    </div>
  );
}
