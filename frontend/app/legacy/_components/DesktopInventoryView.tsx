"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { api, type Item, type ProductModel, type ProductionCapacity, type TransactionLog } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import { LEGACY_COLORS } from "./legacyUi";
import { erpCodeDept } from "@/lib/mes/process";
import { getStockState } from "@/lib/mes/inventory";
import { useDepartments } from "./DepartmentsContext";
import { InventoryKpiPanel, type KpiCard, type KpiFilter } from "./_inventory_sections/InventoryKpiPanel";
import { InventoryCapacityPanel } from "./_inventory_sections/InventoryCapacityPanel";
import {
  InventoryFilters,
  InventoryTableStickyHeader,
} from "./_inventory_sections/InventoryFilterBar";
import { InventoryItemsTable } from "./_inventory_sections/InventoryItemsTable";
import { InventoryDetailPanel } from "./_inventory_sections/InventoryDetailPanel";
import { useInventoryData } from "./_hooks/useInventoryData";
// R9-2: helper 4개 (getMinStock / safeQty / matchesSearch / matchesKpi) 분리
import { getMinStock, matchesKpi, matchesSearch, safeQty } from "./_inventory_sections/inventoryFilter";

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

  const summary = useMemo(() => {
    const totalQuantity = scopedItems.reduce((acc, item) => acc + safeQty(item), 0);
    const normalCount = scopedItems.filter((item) => safeQty(item) > 0 && safeQty(item) >= getMinStock(item)).length;
    const lowCount = scopedItems.filter((item) => safeQty(item) > 0 && safeQty(item) < getMinStock(item)).length;
    const zeroCount = scopedItems.filter((item) => safeQty(item) <= 0).length;
    return { totalCount: scopedItems.length, totalQuantity, normalCount, lowCount, zeroCount };
  }, [scopedItems]);

  useEffect(() => {
    onSummaryChange?.({ low: summary.lowCount, zero: summary.zeroCount });
  }, [summary.lowCount, summary.zeroCount, onSummaryChange]);

  const isFiltered = selectedDepts.length > 0 || selectedModels.length > 0 || deferredLocalSearch.length > 0;
  const activeFilterCount =
    selectedDepts.length + selectedModels.length + (deferredLocalSearch.length > 0 ? 1 : 0);

  const kpiCards: KpiCard[] = [
    {
      label: "전체",
      value: items.length,
      hint: isFiltered
        ? `${filteredItems.length}건 조회 중 · 클릭하면 전체 초기화`
        : "전체 품목",
      tone: LEGACY_COLORS.blue,
      key: "ALL",
    },
    { label: "정상", value: summary.normalCount, hint: "운영 가능", tone: LEGACY_COLORS.green, key: "NORMAL" },
    { label: "부족", value: summary.lowCount, hint: "안전재고 이하", tone: LEGACY_COLORS.yellow, key: "LOW" },
    { label: "품절", value: summary.zeroCount, hint: "즉시 조치 필요", tone: LEGACY_COLORS.red, key: "ZERO" },
  ];

  if (selectedItem) lastSelectedItemRef.current = selectedItem;
  const displayItem = selectedItem ?? lastSelectedItemRef.current;

  const headerBadge = displayItem
    ? (() => {
        const stock = getStockState(
          Number(displayItem.quantity),
          displayItem.min_stock == null ? null : Number(displayItem.min_stock),
        );
        return (
          <span
            className="inline-flex rounded-full px-3 py-1 text-sm font-bold"
            style={{ color: stock.color, background: `color-mix(in srgb, ${stock.color} 12%, transparent)` }}
          >
            {stock.label}
          </span>
        );
      })()
    : null;

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

      {/* ── 우측: 품목 상세 패널 ── */}
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: selectedItem ? 436 : 0,
          transition: "width 160ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div
          className="h-full pl-4"
          style={{
            opacity: selectedItem ? 1 : 0,
            transform: selectedItem ? "translateX(0)" : "translateX(18px)",
            transition: "opacity 260ms ease, transform 260ms ease",
            willChange: "transform, opacity",
          }}
        >
          {displayItem && (
            <DesktopRightPanel
              title={displayItem.item_name}
              subtitle={displayItem.legacy_part ? `${displayItem.erp_code} · ${displayItem.legacy_part}` : (displayItem.erp_code ?? undefined)}
              headerBadge={headerBadge}
            >
              <InventoryDetailPanel item={displayItem} logs={itemLogs} onGoToWarehouse={onGoToWarehouse} />
            </DesktopRightPanel>
          )}
        </div>
      </div>
    </div>
  );
}
