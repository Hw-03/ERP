"use client";
import type { DefectEntryTarget } from "@/lib/defect-entry";
import { useDesktopTabHome } from "./DesktopTabHome";
import { DashboardNavigationProvider, useDashboardNavigation, useDashboardSnapshot } from "./DashboardNavigation";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DashboardViewSwitch, type DashboardView } from "./_cost/DashboardViewSwitch";
import { DesktopCapacityView } from "./_capacity_sections/DesktopCapacityView";
import { getStoredBootId, useCurrentOperator } from "./login/useCurrentOperator";
import { api, type Item, type ProductModel, type ProductionCapacity } from "@/lib/api";
import { InventoryKpiPanel, type KpiFilter } from "./_inventory_sections/InventoryKpiPanel";
import { InventoryFilterToggleButton } from "./_inventory_sections/InventoryFilterToggleButton";
import {
  InventoryFilters,
  InventoryTableStickyHeader,
} from "./_inventory_sections/InventoryFilterBar";
import { InventoryItemsTable } from "./_inventory_sections/InventoryItemsTable";
import { DesktopInventoryRightPanel } from "./_inventory_sections/DesktopInventoryRightPanel";
import { CostAnalysisWorkspace } from "./_cost/CostAnalysisWorkspace";
import styles from "./DesktopInventoryView.module.css";
import { useInventoryData } from "./_hooks/useInventoryData";
import { useInventoryViewState } from "./_hooks/useInventoryViewState";
import { useDesktopInventoryDerivations } from "./_hooks/useDesktopInventoryDerivations";
import { useItemImageManifest } from "./_hooks/useItemImageManifest";
import { useToggleSet } from "./_hooks/useToggleSet";
import { useModelsQuery } from "@/lib/queries/useModelsQuery";
import { useItemSearch } from "@/lib/queries/useItemSearch";
import { SearchConfigStatus } from "./common/SearchConfigStatus";
import { ItemSearchManagementPanel } from "./common/ItemSearchManagementPanel";
// R9-2: helper 4개 (getMinStock / safeQty / matchesSearch / matchesKpi) 분리
import {
  DEFAULT_INVENTORY_FILTER_LOGIC,
  DEFAULT_DEPARTMENT_FILTER_BASIS,
  matchesInventoryCategoryFilters,
  matchesKpi,
  type InventoryFilterLogic,
  type DepartmentFilterBasis,
} from "./_inventory_sections/inventoryFilter";

const DESKTOP_PAGE_SIZE = 100;

// 안정 참조 — useModelsQuery 미로딩 시 동일 빈 배열을 재사용해 useMemo 의존성을 흔들지 않는다.
const EMPTY_MODELS: ProductModel[] = [];


export function DesktopInventoryView(props: Parameters<typeof InventoryDashboard>[0]) {
  const operator = useCurrentOperator();
  return <DashboardNavigationProvider key={`${operator?.employee_id ?? "anonymous"}:${getStoredBootId() ?? ""}`}><InventoryDashboard {...props} /></DashboardNavigationProvider>;
}

function InventoryDashboard({
  globalSearch,
  onStatusChange,
  onGoToWarehouse,
  onGoToDefect,
  onGoToWarehouseTab,
  onSummaryChange,
  capacityData,
  capacityLoading = false,
  capacityError,
  onCapacityRetry,
  capacityRefreshKey = 0,
  canReceive,
  costHeaderTarget,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  onGoToWarehouse: (item: Item, intent?: import("./_warehouse_v2/types").IoEntryIntent) => void;
  onGoToWarehouseTab?: () => void;
  onGoToDefect?: (target: DefectEntryTarget) => void;
  onSummaryChange?: (s: { low: number; zero: number }) => void;
  capacityData?: ProductionCapacity | null;
  capacityLoading?: boolean;
  capacityError?: string | null;
  onCapacityRetry?: () => void;
  capacityRefreshKey?: number;
  canReceive?: boolean;
  costHeaderTarget?: HTMLElement | null;
}) {
  // R7-HOOK2: items/loading/error + loadItems 훅으로 분리
  const { items, setItems, loading, refreshing, error, refreshError, loadItems } = useInventoryData({
    globalSearch,
    onStatusChange,
  });
  const { search: localSearch, setSearch: setLocalSearch, selectedItem, displayItem, detailOpen, detailStatus, detailError,
    actionsDisabled, selectItem, closeDetail, retryDetail } = useInventoryViewState(items);
  const imageManifest = useItemImageManifest();
  useEffect(() => {
    if (detailOpen && (detailStatus === "deleted" || detailStatus === "not-found" || detailStatus === "access-error")) {
      closeDetail(); onStatusChange("선택한 품목을 표시할 수 없어 목록으로 돌아왔습니다.");
    }
  }, [detailOpen, detailStatus, closeDetail, onStatusChange]);
  const { matchesItem } = useItemSearch();
  const [searchManagementOpen, setSearchManagementOpen] = useState(false);
  const navigation = useDashboardNavigation()!;
  const dashboardView = navigation.view;
  const setDashboardView = navigation.navigate;
  const [costVisited, setCostVisited] = useState(false);
  const [costNavigationBusy, setCostNavigationBusy] = useState(false);
  const [costRequest, setCostRequest] = useState(0);
  const costAnalysisOpen = dashboardView === "cost";
  const operator = useCurrentOperator();
  const [capacityVisited, setCapacityVisited] = useState(false);
  const setCostAnalysisOpen = (open: boolean): void => setDashboardView(open ? "cost" : "inventory");
  const changeView = (view: DashboardView): void => { if (view === "cost") setCostVisited(true); if (view === "capacity") setCapacityVisited(true); setDashboardView(view); };
  const [costInitialItemId, setCostInitialItemId] = useState<string | null>(null);
  useDesktopTabHome("inventory", {
    isHome: !detailOpen && dashboardView === "inventory",
    returnHome: () => {
      setCostAnalysisOpen(false);
      closeDetail();
    },
  });
  const productModels = useModelsQuery().data ?? EMPTY_MODELS;
  const [kpi, setKpi] = useState<KpiFilter>("ALL");
  const [displayLimit, setDisplayLimit] = useState(DESKTOP_PAGE_SIZE);
  const restoredList = useRef<{ filters: string; limit: number } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterLogic, setFilterLogic] = useState<InventoryFilterLogic>(DEFAULT_INVENTORY_FILTER_LOGIC);
  const [departmentFilterBasis, setDepartmentFilterBasis] = useState<DepartmentFilterBasis>(DEFAULT_DEPARTMENT_FILTER_BASIS);
  const [showDisused, setShowDisused] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const selectInventoryItem = useCallback((item: Item | null): void => {
    setSearchManagementOpen(false);
    navigation.commit(() => selectItem(item), detailOpen);
  }, [selectItem, navigation, detailOpen]);
  const openCostAnalysis = (): void => {
    setCostRequest(value => value + 1);
    setCostInitialItemId(detailOpen ? selectedItem?.item_id ?? null : null);
    setCostVisited(true);
    setCostAnalysisOpen(true);
  };
  const deferredLocalSearch = useDeferredValue(localSearch.trim().toLowerCase());

  // loadItems 본문은 useInventoryData 훅이 제공 (R7-HOOK2). 호출만 외부에서 가능.

  const { selected: selectedDepts, toggle: toggleDept, setSelected: setSelectedDepts } =
    useToggleSet(() => setDisplayLimit(DESKTOP_PAGE_SIZE));
  const { selected: selectedModels, toggle: toggleModel, setSelected: setSelectedModels } =
    useToggleSet(() => setDisplayLimit(DESKTOP_PAGE_SIZE));
  const { selected: selectedProcessSteps, toggle: toggleProcessStep, setSelected: setSelectedProcessSteps } =
    useToggleSet(() => setDisplayLimit(DESKTOP_PAGE_SIZE));
  const toggleDisused = useCallback(() => {
    setShowDisused((prev) => !prev);
    setDisplayLimit(DESKTOP_PAGE_SIZE);
  }, []);

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
        if (!matchesItem(item, deferredLocalSearch)) return false;
        if (
          !matchesInventoryCategoryFilters(item, {
            selectedDepts,
            departmentFilterBasis,
            selectedSlots,
            showUnclassified,
            showDisused,
            selectedProcessSteps,
            logic: filterLogic,
          })
        ) return false;
        return true;
      }),
    [items, deferredLocalSearch, matchesItem, selectedDepts, departmentFilterBasis, selectedSlots, showUnclassified, showDisused, selectedProcessSteps, filterLogic],
  );
  const filteredItems = useMemo(() => scopedItems.filter((item) => matchesKpi(item, kpi)), [scopedItems, kpi]);

  useEffect(() => {
    const filters = JSON.stringify([localSearch, kpi, selectedDepts, selectedModels, selectedProcessSteps, filterLogic, departmentFilterBasis, showDisused]);
    if (restoredList.current?.filters === filters) setDisplayLimit(restoredList.current.limit);
    else { restoredList.current = null; setDisplayLimit(DESKTOP_PAGE_SIZE); }
  }, [filteredItems, localSearch, kpi, selectedDepts, selectedModels, selectedProcessSteps, filterLogic, departmentFilterBasis, showDisused]);

  const { isFiltered, activeFilterCount, kpiCards, headerBadge } = useDesktopInventoryDerivations({
    items,
    scopedItems,
    filteredItems,
    selectedDepts,
    selectedModels,
    selectedProcessSteps,
    showDisused,
    deferredLocalSearch,
    displayItem,
    onSummaryChange,
  });

  useDashboardSnapshot("inventory:main", () => ({ itemId: selectedItem?.item_id ?? null, detailOpen, localSearch, kpi, selectedDepts, selectedModels, selectedProcessSteps, filterLogic, departmentFilterBasis, showDisused, displayLimit, scroll: scrollRef.current?.scrollTop ?? 0 }), state => {
    restoredList.current = { filters: JSON.stringify([state.localSearch, state.kpi, state.selectedDepts, state.selectedModels, state.selectedProcessSteps, state.filterLogic, state.departmentFilterBasis, state.showDisused]), limit: state.displayLimit };
    setLocalSearch(state.localSearch); setKpi(state.kpi); setSelectedDepts(state.selectedDepts); setSelectedModels(state.selectedModels); setSelectedProcessSteps(state.selectedProcessSteps); setFilterLogic(state.filterLogic); setDepartmentFilterBasis(state.departmentFilterBasis); setShowDisused(state.showDisused); setDisplayLimit(state.displayLimit);
    if (state.detailOpen && state.itemId) selectItem((selectedItem?.item_id === state.itemId ? selectedItem : items.find(item => item.item_id === state.itemId)) ?? { item_id: state.itemId } as Item); else closeDetail();
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = state.scroll; });
  }, { isHome: !detailOpen, home: () => { closeDetail(); if (scrollRef.current) scrollRef.current.scrollTop = 0; } });

  function resetAllFilters() {
    setSelectedDepts([]);
    setDepartmentFilterBasis(DEFAULT_DEPARTMENT_FILTER_BASIS);
    setSelectedModels([]);
    setSelectedProcessSteps([]);
    setShowDisused(false);
    setLocalSearch("");
    setKpi("ALL");
    setFilterLogic(DEFAULT_INVENTORY_FILTER_LOGIC);
  }

  return (
    <div data-dashboard-view={dashboardView} className={`${styles.view} flex min-h-0 flex-1 min-w-0 pl-0 lg:pr-4`}>
      <div className="contents" style={dashboardView !== "inventory" ? { display: "none" } : undefined}>
      {/* ── 좌측: 전체 작업 영역 스크롤 + 바깥 전용 스크롤 바 ── */}
      <div
        data-testid="inventory-left-viewport"
        className="relative flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div
          ref={scrollRef}
          data-testid="inventory-left-content"
          className="sg min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] sm:block sm:overflow-y-scroll"
        >
          <div data-testid="inventory-scroll-surface" className="flex min-h-full flex-col">
            <div className="flex flex-1 flex-col gap-3">
          {/* ── 컴팩트 상단: KPI + 생산가능 + (접힘형) 필터 ── */}
          <section className="card desktop-flat-surface" style={{ padding: "14px 16px" }}>
            <InventoryKpiPanel
              cards={kpiCards}
              activeKey={kpi}
              loading={loading && items.length === 0}
              onChange={(key) => {
                if (key === "ALL") resetAllFilters();
                else setKpi(key);
              }}
            />
          </section>

          {/* ── 재고 테이블 ── */}
          <section data-testid="inventory-list-card" aria-label="자재 목록" className="card desktop-flat-surface flex flex-1 flex-col">
            <InventoryTableStickyHeader
              searchActions={
                <InventoryFilterToggleButton
                  filtersOpen={filtersOpen}
                  logic={filterLogic}
                  onLogicChange={setFilterLogic}
                  onToggle={() => setFiltersOpen((prev) => !prev)}
                />
              }
              searchValue={localSearch}
              searchPlaceholder="품명 · 품목 코드 · 검색용 이름"
              onSearchChange={setLocalSearch}
              onManageSearch={() => setSearchManagementOpen(true)}
              count={filteredItems.length}
              isFiltered={isFiltered}
              onResetAllFilters={resetAllFilters}
            />
            <InventoryFilters
              className="!mt-[-1.5px] mb-[13.5px]"
              open={filtersOpen}
              selectedDepts={selectedDepts}
              departmentFilterBasis={departmentFilterBasis}
              selectedModels={selectedModels}
              selectedProcessSteps={selectedProcessSteps}
              showDisused={showDisused}
              productModels={productModels}
              toggleDept={toggleDept}
              onDepartmentFilterBasisChange={setDepartmentFilterBasis}
              toggleModel={toggleModel}
              toggleProcessStep={toggleProcessStep}
              toggleDisused={toggleDisused}
              onClearDepts={() => setSelectedDepts([])}
              onClearModels={() => setSelectedModels([])}
              onClearProcessSteps={() => setSelectedProcessSteps([])}
              onResetAll={resetAllFilters}
              isAnyFilterActive={
                selectedDepts.length > 0 ||
                selectedModels.length > 0 ||
                selectedProcessSteps.length > 0 ||
                showDisused ||
                kpi !== "ALL" ||
                localSearch.length > 0 ||
                hasNonDefaultFilterLogic
              }
            />
            <SearchConfigStatus active={!!localSearch.trim()} />
            <InventoryItemsTable
              error={error}
              refreshError={refreshError}
              loading={loading}
              filteredItems={filteredItems}
              displayLimit={displayLimit}
              setDisplayLimit={setDisplayLimit}
              selectedItem={selectedItem}
              detailOpen={detailOpen && !searchManagementOpen}
              onSelectItem={selectInventoryItem}
              activeFilterCount={activeFilterCount}
              hasKpiFilter={kpi !== "ALL"}
              hasSearch={!!localSearch.trim()}
              onRetry={() => void loadItems()}
              onResetAllFilters={resetAllFilters}
              imageManifest={imageManifest}
            />
          </section>
            </div>
          </div>
        </div>
        <div
          aria-hidden
          data-testid="inventory-scroll-frame"
          className="pointer-events-none absolute bottom-0 left-0 right-2.5 z-30 h-6"
        >
          <span
            className="absolute bottom-0 left-0 h-6 w-6"
            style={{ background: "radial-gradient(circle at 100% 0, transparent 0 23px, var(--c-bg) 24px)" }}
          />
          <span
            className="absolute bottom-0 right-0 h-6 w-6"
            style={{ background: "radial-gradient(circle at 0 0, transparent 0 23px, var(--c-bg) 24px)" }}
          />
        </div>
      </div>

      <DesktopInventoryRightPanel
        open={dashboardView === "inventory" && detailOpen && !searchManagementOpen}
        selectedItem={selectedItem}
        displayItem={displayItem}
        headerBadge={headerBadge}
        onClose={closeDetail}
        onGoToWarehouse={onGoToWarehouse}
        onGoToDefect={onGoToDefect}
        canReceive={canReceive}
        detailLoading={detailOpen && detailStatus === "loading"}
        refreshing={refreshing}
        detailError={detailError}
        onRetryDetail={() => void retryDetail()}
        actionsDisabled={actionsDisabled}
        imageFilename={displayItem?.mes_code ? imageManifest[displayItem.mes_code] : undefined}
        onOpenCost={openCostAnalysis}
      />
      </div>
      {costHeaderTarget && createPortal(<DashboardViewSwitch active={dashboardView} disabled={costAnalysisOpen && costNavigationBusy} onChange={changeView} />, costHeaderTarget)}
      {capacityVisited && <div hidden={dashboardView !== "capacity"} inert={dashboardView !== "capacity" || undefined} className={dashboardView === "capacity" ? "flex min-h-0 min-w-0 flex-1" : "hidden"}><DesktopCapacityView key={operator?.employee_id} capacityData={capacityData} loading={capacityLoading} error={capacityError} onRetry={onCapacityRetry} active={dashboardView === "capacity"} refreshKey={capacityRefreshKey} /></div>}
      {costVisited && <div hidden={!costAnalysisOpen} inert={!costAnalysisOpen || undefined} className={costAnalysisOpen ? "flex min-h-0 min-w-0 flex-1" : "hidden"}><CostAnalysisWorkspace initialRequest={costRequest} active={costAnalysisOpen} capacityData={capacityData} capacityLoading={capacityLoading} capacityError={capacityError} onCapacityRetry={onCapacityRetry} initialItemId={costInitialItemId} onClose={() => setCostAnalysisOpen(false)} onDashboardViewChange={changeView} headerTarget={costHeaderTarget} renderDashboardSwitch={false} onNavigationBusyChange={setCostNavigationBusy} /></div>}
      <ItemSearchManagementPanel open={dashboardView === "inventory" && searchManagementOpen} onClose={() => setSearchManagementOpen(false)} />
    </div>
  );
}
