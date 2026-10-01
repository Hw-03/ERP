"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { api, type Item, type ProductModel, type ProductionCapacity } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { ChevronDown, SlidersHorizontal, Zap } from "lucide-react";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { InlineSearch } from "../primitives";
import { MobileScrollFrame } from "../primitives/MobileScrollFrame";
import { InventoryKpiPanel, type KpiFilter } from "../../_inventory_sections/InventoryKpiPanel";
import { InventoryCapacityPanel, capacityStatusBadge } from "../../_inventory_sections/InventoryCapacityPanel";
import { InventoryFilters } from "../../_inventory_sections/InventoryFilterBar";
import { InventoryFilterLogicToggle } from "../../_inventory_sections/InventoryFilterToggleButton";
import { InventoryItemsTable } from "../../_inventory_sections/InventoryItemsTable";
import { MobileInventoryDetailContent } from "./MobileInventoryDetailContent";
import { useInventoryData } from "../../_hooks/useInventoryData";
import { useDesktopInventoryDerivations } from "../../_hooks/useDesktopInventoryDerivations";
import { useItemImageManifest } from "../../_hooks/useItemImageManifest";
import { useToggleSet } from "../../_hooks/useToggleSet";
import {
  DEFAULT_INVENTORY_FILTER_LOGIC,
  DEFAULT_DEPARTMENT_FILTER_BASIS,
  matchesInventoryCategoryFilters,
  matchesKpi,
  matchesSearch,
  type InventoryFilterLogic,
  type DepartmentFilterBasis,
} from "../../_inventory_sections/inventoryFilter";
import { useModelsQuery } from "@/lib/queries/useModelsQuery";
import type { IoEntryIntent } from "../../_warehouse_v2/types";
import { ReadFailure } from "../../common/ReadState";
import { SkeletonBlock } from "../../common/LoadingSkeleton";

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
  capacityLoading = false,
  capacityError = null,
  onCapacityRetry = () => {},
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
  capacityLoading?: boolean;
  capacityError?: string | null;
  onCapacityRetry?: () => void;
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
  const { items, loading, error, refreshError, loadItems } = useInventoryData({
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
  const [filterLogic, setFilterLogic] = useState<InventoryFilterLogic>(DEFAULT_INVENTORY_FILTER_LOGIC);
  const [departmentFilterBasis, setDepartmentFilterBasis] = useState<DepartmentFilterBasis>(DEFAULT_DEPARTMENT_FILTER_BASIS);
  const [showDisused, setShowDisused] = useState(false);
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
  const toggleDisused = useCallback(() => {
    setShowDisused((prev) => !prev);
    setDisplayLimit(PAGE_SIZE);
  }, []);

  const showUnclassified = selectedModels.includes("미분류");

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
    [items, deferredLocalSearch, selectedDepts, departmentFilterBasis, selectedSlots, showUnclassified, showDisused, selectedProcessSteps, filterLogic],
  );
  const filteredItems = useMemo(() => scopedItems.filter((item) => matchesKpi(item, kpi)), [scopedItems, kpi]);

  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
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
    showDisused,
    deferredLocalSearch,
    displayItem,
    onSummaryChange,
  });
  const hasNonDefaultFilterLogic = filterLogic !== DEFAULT_INVENTORY_FILTER_LOGIC;

  const resetAllFilters = useCallback(() => {
    setSelectedDepts([]);
    setDepartmentFilterBasis(DEFAULT_DEPARTMENT_FILTER_BASIS);
    setSelectedModels([]);
    setSelectedProcessSteps([]);
    setShowDisused(false);
    setLocalSearch("");
    setKpi("ALL");
    setFilterLogic(DEFAULT_INVENTORY_FILTER_LOGIC);
  }, [setSelectedDepts, setSelectedModels, setSelectedProcessSteps]);

  const capacityBadge = capacityStatusBadge(capacityData);
  const searchControlsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controls = searchControlsRef.current;
    if (!controls) return;
    // Include the normal 8px gap below the toolbar, even when the reset row grows it.
    const updateHeaderTop = (): void => {
      controls.parentElement?.style.setProperty("--mobile-inventory-header-top", `${controls.getBoundingClientRect().height + 8}px`);
    };
    updateHeaderTop();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateHeaderTop);
    observer.observe(controls);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <MobileScrollFrame>
        <div className="flex flex-col gap-2">
          <section className="flex flex-col gap-2">
            <InventoryKpiPanel
              mobile
              cards={kpiCards}
              activeKey={kpi}
              loading={loading && items.length === 0}
              onChange={(key) => {
                if (key === "ALL") resetAllFilters();
                else setKpi(key);
              }}
            />
            {capacityLoading || capacityData ? (
              <div>
                <button
                  type="button"
                  disabled={!capacityData}
                  onClick={() => setCapacityOpen((o) => !o)}
                  aria-expanded={capacityOpen}
                  className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[14px] border px-3 py-2.5 text-left transition-[transform] active:scale-[0.99]"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                >
                  <span
                    className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold"
                    style={{ color: LEGACY_COLORS.text }}
                  >
                    <Zap className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                    <span className="shrink-0">생산 가능 현황</span>
                    {/* 항목 1 — 상태는 펼친 패널 헤더 대신 토글 버튼 우측 배지로 노출 */}
                    {capacityLoading && !capacityData ? (
                      <span role="status" aria-busy="true" aria-label="생산 가능 수량 불러오는 중" className="flex h-5 items-center">
                        <SkeletonBlock className="h-5 w-16 rounded-full" />
                      </span>
                    ) : capacityBadge && (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
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
                {capacityError && <ReadFailure message={capacityError} onRetry={onCapacityRetry} refresh />}
                {capacityOpen && capacityData && (
                  <div className="mt-2 flex flex-col gap-2">
                    {/* 항목 1 — 인라인 패널은 표만(클릭 X), 자세히 보기는 아래 전폭 버튼으로 분리 */}
                    <InventoryCapacityPanel capacityData={capacityData} mobile />
                    <button
                      type="button"
                      onClick={onCapacityClick}
                      className="min-h-11 w-full rounded-[12px] border px-3 py-2.5 text-sm font-semibold transition-[transform] active:scale-[0.99]"
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
            ) : capacityError ? <ReadFailure message={capacityError} onRetry={onCapacityRetry} /> : null}
          </section>

          {/* 검색/필터 영역은 배경 위 도구줄로 두고, 입력 컨트롤 자체만 테두리를 가진다. */}
          <div
            ref={searchControlsRef}
            className="sticky top-0 z-20 -mx-3 flex flex-col gap-2 px-3"
            style={{ background: LEGACY_COLORS.bg }}
          >
            <div className="flex items-center gap-2">
              <InlineSearch
                value={localSearch}
                onChange={setLocalSearch}
                placeholder="품명 · 코드 · 위치 · 공급처"
                className="min-w-0 flex-1"
              />
              <div className={`flex shrink-0 self-stretch items-center${filtersOpen ? " gap-2" : ""}`}>
                <InventoryFilterLogicToggle open={filtersOpen} logic={filterLogic} onLogicChange={setFilterLogic} />
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
                      className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold"
                      style={{ background: LEGACY_COLORS.redSolid, color: LEGACY_COLORS.white }}
                    >
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
            {isFiltered && (
              <div
                className="flex items-center justify-end px-0.5 text-xs font-semibold"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="min-h-11 rounded-full px-2 py-1 font-semibold"
                  style={{ color: LEGACY_COLORS.blue }}
                >
                  필터 초기화
                </button>
              </div>
            )}
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-full h-2" style={{ background: LEGACY_COLORS.bg }} />
          </div>
          {/* 항목 2 — 필터 칩은 sticky 밖(일반 흐름)에 둬서 열려도 목록을 가리지 않고 아래로 밀어낸다.
              4-2 — 검색바와 함께 card 밖, 화면 배경 위에 배치. */}
          {filtersOpen && (
            <div className="-mx-3 px-3 pb-2.5">
              <InventoryFilters
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
                isAnyFilterActive={isFiltered || hasNonDefaultFilterLogic}
              />
            </div>
          )}
          {/* 목록 테이블 자체가 둥근 테두리를 가지므로 바깥 카드는 두지 않는다. */}
          <section>
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
              hasSearch={!!localSearch.trim()}
              onRetry={() => void loadItems()}
              onResetAllFilters={resetAllFilters}
              imageManifest={imageManifest}
              compact
            />
          </section>
        </div>
      </MobileScrollFrame>

      <BottomSheet
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        ariaLabel={displayItem ? `${displayItem.item_name} 상세` : "품목 상세"}
      >
        {selectedItem && displayItem && (
          <MobileInventoryDetailContent
            key={selectedItem.item_id}
            item={displayItem}
            headerBadge={headerBadge}
            onGoToWarehouse={(item, intent) => {
              setSelectedItem(null);
              onGoToWarehouse(item, intent);
            }}
            canReceive={canReceive}
            imageFilename={displayItem.mes_code ? imageManifest?.[displayItem.mes_code] : undefined}
          />
        )}
      </BottomSheet>
    </div>
  );
}
