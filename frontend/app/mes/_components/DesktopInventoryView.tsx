"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { api, type Item, type ProductModel, type ProductionCapacity } from "@/lib/api";
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
import {
  DEFAULT_INVENTORY_FILTER_LOGIC,
  matchesInventoryCategoryFilters,
  matchesKpi,
  matchesSearch,
  type InventoryFilterLogic,
} from "./_inventory_sections/inventoryFilter";

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
  const { items, setItems, loading, error, refreshError, loadItems } = useInventoryData({
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
  const [filterLogic, setFilterLogic] = useState<InventoryFilterLogic>(DEFAULT_INVENTORY_FILTER_LOGIC);

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
  const hasNonDefaultFilterLogic = filterLogic !== DEFAULT_INVENTORY_FILTER_LOGIC;

  const selectedSlots = useMemo(
    () => new Set(productModels.filter((m) => selectedModels.includes(m.model_name ?? "")).map((m) => m.slot)),
    [productModels, selectedModels],
  );

  const scopedItems = useMemo(
    () =>
      items.filter((item) => {
        // 김건호 피드백 1 — 삭제(소프트삭제) 품목은 대시보드 재고 목록에 노출하지 않음.
        if (item.deleted_at) return false;
        if (!matchesSearch(item, deferredLocalSearch)) return false;
        if (
          !matchesInventoryCategoryFilters(item, {
            selectedDepts,
            selectedSlots,
            showUnclassified,
            selectedProcessSteps,
            logic: filterLogic,
          })
        ) return false;
        return true;
      }),
    [items, deferredLocalSearch, selectedDepts, selectedSlots, showUnclassified, selectedProcessSteps, filterLogic],
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
    setFilterLogic(DEFAULT_INVENTORY_FILTER_LOGIC);
  }

  return (
    <div className="flex min-h-0 flex-1 min-w-0 pl-0 lg:pr-4">
      {/* ── 좌측: 스크롤 컨테이너 ── */}
      <div
        data-testid="inventory-left-viewport"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[32px]"
      >
        <div
          ref={scrollRef}
          data-testid="inventory-left-content"
          className="sg min-h-0 flex-1 overflow-y-auto"
        >
          <div className="flex flex-col gap-3">
          {/* ── 컴팩트 상단: KPI + 생산가능 + (접힘형) 필터 ── */}
          <section className="card desktop-flat-surface" style={{ padding: "14px 16px" }}>
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
                logic={filterLogic}
                onLogicChange={setFilterLogic}
                onToggle={() => setFiltersOpen((prev) => !prev)}
              />
            </div>
            <InventoryFilters
              open={filtersOpen}
              logic={filterLogic}
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
                localSearch.length > 0 ||
                hasNonDefaultFilterLogic
              }
            />
          </section>

          {/* ── 재고 테이블 ── */}
          <section data-testid="inventory-list-card" className="card desktop-flat-surface">
            <InventoryTableStickyHeader
              searchValue={localSearch}
              onSearchChange={setLocalSearch}
              count={filteredItems.length}
              isFiltered={isFiltered}
              onResetAllFilters={resetAllFilters}
            />
            <InventoryItemsTable
              error={error}
              refreshError={refreshError}
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
