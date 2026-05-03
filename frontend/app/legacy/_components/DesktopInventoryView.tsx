"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { api, type Item, type ProductModel, type ProductionCapacity, type TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "./legacyUi";
import { erpCodeDept } from "@/lib/mes/process";
import { useDepartments } from "./DepartmentsContext";
import { InventoryKpiPanel, type KpiFilter } from "./_inventory_sections/InventoryKpiPanel";
import { InventoryCapacityPanel } from "./_inventory_sections/InventoryCapacityPanel";
import {
  InventoryFilters,
  InventoryTableStickyHeader,
} from "./_inventory_sections/InventoryFilterBar";
import { InventoryItemsTable } from "./_inventory_sections/InventoryItemsTable";
import { DesktopInventoryRightPanel } from "./_inventory_sections/DesktopInventoryRightPanel";
import { useInventoryData } from "./_hooks/useInventoryData";
import { useDesktopInventoryDerivations } from "./_hooks/useDesktopInventoryDerivations";
// R9-2: helper 4개 (getMinStock / safeQty / matchesSearch / matchesKpi) 분리
import { matchesKpi, matchesSearch } from "./_inventory_sections/inventoryFilter";

const DESKTOP_PAGE_SIZE = 100;


export function DesktopInventoryView({
  globalSearch,
  onStatusChange,
  onGoToWarehouse,
  onGoToWarehouseTab,
  onSummaryChange,
  capacityData,
  onCapacityClick,
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
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const departments = useDepartments();
  const [kpi, setKpi] = useState<KpiFilter>("ALL");
  const [localSearch, setLocalSearch] = useState("");
  const [displayLimit, setDisplayLimit] = useState(DESKTOP_PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSelectedItemRef = useRef<Item | null>(null);
  const deferredLocalSearch = useDeferredValue(localSearch.trim().toLowerCase());

  // loadItems 본문은 useInventoryData 훅이 제공 (R7-HOOK2). 호출만 외부에서 가능.

  function toggleDept(v: string) {
    setSelectedDepts((prev) => (prev.includes(v) ? prev.filter((d) => d !== v) : [...prev, v]));
    setDisplayLimit(DESKTOP_PAGE_SIZE);
  }
  function toggleModel(v: string) {
    setSelectedModels((prev) => (prev.includes(v) ? prev.filter((m) => m !== v) : [...prev, v]));
    setDisplayLimit(DESKTOP_PAGE_SIZE);
  }

  useEffect(() => {
    void api.getModels().then(setProductModels).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedItem) {
      setItemLogs([]);
      return;
    }
    void api
      .getTransactions({ itemId: selectedItem.item_id, limit: 10 })
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
                erpCodeDept(item.erp_code) === d ||
                item.locations.some((loc) => loc.department === d),
          );
          if (!inDept) return false;
        }
        if (selectedSlots.size > 0 || showUnclassified) {
          const matchesSlot = selectedSlots.size > 0 && item.model_slots.some((s) => selectedSlots.has(s));
          const matchesUnclassified = showUnclassified && item.model_slots.length === 0;
          if (!matchesSlot && !matchesUnclassified) return false;
        }
        return true;
      }),
    [items, deferredLocalSearch, selectedDepts, selectedSlots, showUnclassified],
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
    deferredLocalSearch,
    displayItem,
    onSummaryChange,
  });

  function resetAllFilters() {
    setSelectedDepts([]);
    setSelectedModels([]);
    setLocalSearch("");
    setKpi("ALL");
  }

  return (
    <div className="flex min-h-0 flex-1 pl-0 pr-4">
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
            <InventoryCapacityPanel capacityData={capacityData} onClick={onCapacityClick} />
            <InventoryFilters
              open={filtersOpen}
              selectedDepts={selectedDepts}
              selectedModels={selectedModels}
              productModels={productModels}
              departments={departments}
              toggleDept={toggleDept}
              toggleModel={toggleModel}
              onClearDepts={() => setSelectedDepts([])}
              onClearModels={() => setSelectedModels([])}
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
              activeFilterCount={activeFilterCount}
              filtersOpen={filtersOpen}
              isFiltered={isFiltered}
              onToggleFilters={() => setFiltersOpen((prev) => !prev)}
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
            />
          </section>
        </div>
      </div>

      <DesktopInventoryRightPanel
        selectedItem={selectedItem}
        displayItem={displayItem}
        itemLogs={itemLogs}
        headerBadge={headerBadge}
        onGoToWarehouse={onGoToWarehouse}
      />
    </div>
  );
}
