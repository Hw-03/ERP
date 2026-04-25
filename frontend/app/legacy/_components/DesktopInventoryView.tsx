"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { PackageSearch } from "lucide-react";
import { api, type Item, type ProductModel, type ProductionCapacity, type TransactionLog } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import { LEGACY_COLORS, erpCodeDept, getStockState } from "./legacyUi";
import { InventoryKpiPanel, type KpiCard, type KpiFilter } from "./_inventory_sections/InventoryKpiPanel";
import { InventoryActionRequired } from "./_inventory_sections/InventoryActionRequired";
import { InventoryCapacityPanel } from "./_inventory_sections/InventoryCapacityPanel";
import {
  InventoryFilters,
  InventoryTableStickyHeader,
} from "./_inventory_sections/InventoryFilterBar";
import { InventoryItemsTable } from "./_inventory_sections/InventoryItemsTable";
import { InventoryDetailPanel } from "./_inventory_sections/InventoryDetailPanel";

const DESKTOP_PAGE_SIZE = 100;

function getMinStock(item: Item) {
  return item.min_stock == null ? 0 : Number(item.min_stock);
}

function matchesSearch(item: Item, keyword: string) {
  if (!keyword) return true;
  const haystack = [
    item.erp_code,
    item.item_name,
    item.spec ?? "",
    item.location ?? "",
    item.supplier ?? "",
    item.legacy_model ?? "",
    item.barcode ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(keyword);
}

function safeQty(item: Item) {
  const n = Number(item.quantity);
  return isNaN(n) ? 0 : n;
}

function matchesKpi(item: Item, kpi: KpiFilter) {
  const qty = safeQty(item);
  const min = getMinStock(item);
  if (kpi === "NORMAL") return qty > 0 && qty >= min;
  if (kpi === "LOW") return qty > 0 && qty < min;
  if (kpi === "ZERO") return qty <= 0;
  return true;
}

export function DesktopInventoryView({
  globalSearch,
  onStatusChange,
  onGoToWarehouse,
  onGoToWarehouseTab,
  onSummaryChange,
  capacityData,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  onGoToWarehouse: (item: Item) => void;
  onGoToWarehouseTab?: () => void;
  onSummaryChange?: (s: { low: number; zero: number }) => void;
  capacityData?: ProductionCapacity | null;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemLogs, setItemLogs] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [kpi, setKpi] = useState<KpiFilter>("ALL");
  const [localSearch, setLocalSearch] = useState("");
  const [displayLimit, setDisplayLimit] = useState(DESKTOP_PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const deferredLocalSearch = useDeferredValue(localSearch.trim().toLowerCase());

  async function loadItems() {
    try {
      setLoading(true);
      setError(null);
      const nextItems = await api.getItems({
        limit: 2000,
        search: globalSearch.trim() || undefined,
      });
      setItems(nextItems);
      onStatusChange(`재고 ${nextItems.length}건을 불러왔습니다.`);
      setSelectedItem((current) => (current ? nextItems.find((item) => item.item_id === current.item_id) ?? null : null));
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "재고 데이터를 불러오지 못했습니다.";
      setError(message);
      onStatusChange(message);
    } finally {
      setLoading(false);
    }
  }

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
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSearch]);

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
        if (selectedSlots.size > 0 && !item.model_slots.some((s) => selectedSlots.has(s))) return false;
        return true;
      }),
    [items, deferredLocalSearch, selectedDepts, selectedSlots],
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
      value: filteredItems.length,
      hint: isFiltered
        ? `필터 적용 중 · 전체 ${items.length}건 중 ${filteredItems.length}건 조회`
        : "조회 기준 전체 품목",
      tone: LEGACY_COLORS.blue,
      key: "ALL",
    },
    { label: "정상", value: summary.normalCount, hint: "운영 가능", tone: LEGACY_COLORS.green, key: "NORMAL" },
    { label: "부족", value: summary.lowCount, hint: "안전재고 이하", tone: LEGACY_COLORS.yellow, key: "LOW" },
    { label: "품절", value: summary.zeroCount, hint: "즉시 조치 필요", tone: LEGACY_COLORS.red, key: "ZERO" },
  ];

  const headerBadge = selectedItem
    ? (() => {
        const stock = getStockState(
          Number(selectedItem.quantity),
          selectedItem.min_stock == null ? null : Number(selectedItem.min_stock),
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
    <div className="flex min-h-0 flex-1 gap-4 pl-0 pr-4">
      {/* ── 좌측: 스크롤 컨테이너 ── */}
      <div
        ref={scrollRef}
        className="scrollbar-hide min-h-0 min-w-0 flex-1 overflow-y-auto rounded-[28px] border"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.bg }}
      >
        <div className="flex flex-col gap-3 pb-6">
          {/* ── 컴팩트 상단: KPI + 생산가능 + (접힘형) 필터 ── */}
          <section className="card" style={{ padding: "14px 16px" }}>
            <InventoryKpiPanel cards={kpiCards} activeKey={kpi} onChange={setKpi} />
            <InventoryActionRequired
              lowCount={summary.lowCount}
              zeroCount={summary.zeroCount}
              onGoToWarehouseTab={onGoToWarehouseTab}
            />
            <InventoryCapacityPanel capacityData={capacityData} />
            <InventoryFilters
              open={filtersOpen}
              selectedDepts={selectedDepts}
              selectedModels={selectedModels}
              productModels={productModels}
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
      <DesktopRightPanel
        title={selectedItem ? selectedItem.item_name : "품목을 선택해 주세요"}
        subtitle={selectedItem ? `${selectedItem.erp_code} · ${selectedItem.legacy_part ?? "-"}` : undefined}
        headerBadge={headerBadge}
      >
        {!selectedItem ? (
          <div
            className="flex h-full flex-col items-center justify-center gap-3 rounded-[28px] border p-8 text-center"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <div
              className="rounded-3xl p-5"
              style={{ background: "rgba(101,169,255,.12)", color: LEGACY_COLORS.blue }}
            >
              <PackageSearch className="h-7 w-7" />
            </div>
            <div className="text-base font-bold">선택된 품목이 없습니다.</div>
            <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
              목록에서 품목을 선택하세요.
            </div>
          </div>
        ) : (
          <InventoryDetailPanel item={selectedItem} logs={itemLogs} onGoToWarehouse={onGoToWarehouse} />
        )}
      </DesktopRightPanel>
    </div>
  );
}
