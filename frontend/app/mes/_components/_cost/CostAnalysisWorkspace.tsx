"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowLeft, Calculator, PanelLeft, Search } from "lucide-react";
import { itemsApi } from "@/lib/api/items";
import { CostModelKpis, toCostKpiTargets, type CapacityKpiSource } from "../DashboardModelKpis";
import type { ProductModel } from "@/lib/api";
import { useModelsQuery } from "@/lib/queries/useModelsQuery";
import { queryKeys } from "@/lib/queries/keys";
import { useCostActor, useCostQuery, useCostSummaryQueries } from "@/lib/queries/useCostQuery";
import { useRegisterDirty } from "@/lib/ui/dirty-guard";
import { useDashboardNavigation, useDashboardSnapshot } from "../DashboardNavigation";
import { useDesktopTabHome } from "../DesktopTabHome";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { ApiError } from "@/lib/api-core";
import { CostViews, CostIssues, type CostView } from "./CostAnalysisPanel";
import { costNumber, CostStatusBadge } from "./CostSummaryCard";
import { CostPurchaseInfo } from "./CostPurchaseInfo";
import { CostYieldSummary } from "./CostYieldSimulation";
import { tableAmount } from "./CostTable";
import styles from "./CostAnalysisWorkspace.module.css";
import scrollStyles from "../DashboardOverviewScroll.module.css";
import { DashboardViewSwitch, type DashboardView } from "./DashboardViewSwitch";
import { useToggleSet } from "../_hooks/useToggleSet";
import { InventoryFilters } from "../_inventory_sections/InventoryFilterBar";
import { InventoryFilterToggleButton } from "../_inventory_sections/InventoryFilterToggleButton";
import { InventoryTable } from "../_inventory_sections/InventoryTable";
import { DEFAULT_DEPARTMENT_FILTER_BASIS, DEFAULT_INVENTORY_FILTER_LOGIC, matchesInventoryCategoryFilters, type DepartmentFilterBasis, type InventoryFilterLogic } from "../_inventory_sections/inventoryFilter";

type EditState = { dirty: boolean; busy: boolean };
type Phase = "catalogue" | "collapsing" | "detail" | "expanding";
type MotionStart = { element: HTMLElement; left: number; top: number };
const BUTTON = "flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition hover:bg-[var(--c-s2)] focus-visible:ring-2 focus-visible:ring-[var(--c-purple)] disabled:opacity-40";
const SIMULATION_RATE_PATTERN = /^\d{1,16}(?:\.\d{1,2})?$/;
const CATALOGUE_PAGE_SIZE = 100;
const EMPTY_MODELS: ProductModel[] = [];

/** Compare API money with inputs that omit trailing decimal places. */
function rateKey(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
}

/** A disposable analysis session leaves the underlying inventory selection untouched. */
export function CostAnalysisWorkspace({ initialItemId, onClose, active = true, initialRequest = 0, headerTarget, onDashboardViewChange, renderDashboardSwitch = true, onNavigationBusyChange, capacityData, capacityLoading, capacityError, onCapacityRetry }: { initialRequest?: number; active?: boolean; initialItemId: string | null; onClose: () => void; headerTarget?: HTMLElement | null; onDashboardViewChange?: (view: DashboardView) => void; renderDashboardSwitch?: boolean; onNavigationBusyChange?: (busy: boolean) => void } & CapacityKpiSource) {
  const navigation = useDashboardNavigation();
  const actor = useCostActor();
  const initialToken = useRef(actor?.token);
  const previousRequest = useRef(initialRequest);
  const [selectedId, setSelectedId] = useState(initialItemId);
  const [phase, setPhase] = useState<Phase>(initialItemId ? "detail" : "catalogue");
  const compact = phase === "detail" || phase === "expanding";
  const detailTarget = phase === "detail" || phase === "collapsing";
  const transitioning = phase === "collapsing" || phase === "expanding";
  const [search, setSearch] = useState("");
  const [querySearch, setQuerySearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterLogic, setFilterLogic] = useState<InventoryFilterLogic>(DEFAULT_INVENTORY_FILTER_LOGIC);
  const [departmentFilterBasis, setDepartmentFilterBasis] = useState<DepartmentFilterBasis>(DEFAULT_DEPARTMENT_FILTER_BASIS);
  const [showDisused, setShowDisused] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(CATALOGUE_PAGE_SIZE);
  const restoredCatalogue = useRef<{ filters: string; limit: number } | null>(null);
  const { selected: selectedDepts, toggle: toggleDept, setSelected: setSelectedDepts } = useToggleSet();
  const { selected: selectedModels, toggle: toggleModel, setSelected: setSelectedModels } = useToggleSet();
  const { selected: selectedProcessSteps, toggle: toggleProcessStep, setSelected: setSelectedProcessSteps } = useToggleSet();
  const productModels = useModelsQuery({ enabled: Boolean(actor) }).data ?? EMPTY_MODELS;
  const [informationVersion, setInformationVersion] = useState(0);
  const [informationDenied, setInformationDenied] = useState(false);
  const [view, setView] = useState<CostView>("tree");
  const [yieldExpanded, setYieldExpanded] = useState(false);
  const [simulationInput, setSimulationInput] = useState<string | null>(null);
  const [simulationFocused, setSimulationFocused] = useState(false);
  const [simulationRate, setSimulationRate] = useState<string | undefined>();
  const simulationStorageKey = actor ? `mes.cost-simulation.hourly-rate.${actor.employee_id}` : null;
  const [simulationLoadedKey, setSimulationLoadedKey] = useState<string | null>(null);
  const simulationValid = simulationInput === null || simulationInput === "" || SIMULATION_RATE_PATTERN.test(simulationInput);
  useEffect(() => {
    if (!simulationStorageKey) return;
    let stored: string | null = null;
    try { stored = localStorage.getItem(simulationStorageKey); } catch { /* Keep simulation usable when browser storage is unavailable. */ }
    const rate = stored !== null && SIMULATION_RATE_PATTERN.test(stored) ? stored : null;
    setSimulationInput(rate);
    setSimulationRate(rate ?? undefined);
    setSimulationLoadedKey(simulationStorageKey);
  }, [simulationStorageKey]);
  useEffect(() => {
    if (!simulationValid || !simulationStorageKey || simulationLoadedKey !== simulationStorageKey) return;
    try {
      if (simulationInput) localStorage.setItem(simulationStorageKey, simulationInput);
      else if (simulationInput === "") localStorage.removeItem(simulationStorageKey);
    } catch { /* Calculation does not depend on browser storage. */ }
    const timer = setTimeout(() => setSimulationRate(simulationInput || undefined), 300);
    return () => clearTimeout(timer);
  }, [simulationInput, simulationValid, simulationStorageKey, simulationLoadedKey]);
  const [editState, setEditState] = useState<EditState>({ dirty: false, busy: false });
  useEffect(() => {
    onNavigationBusyChange?.(active && editState.busy);
    return () => onNavigationBusyChange?.(false);
  }, [active, editState.busy, onNavigationBusyChange]);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const overviewViewport = useRef<HTMLDivElement>(null);
  const catalogueScroll = useRef(0);
  const detailScroll = useRef(0);
  const frozenTableWidth = useRef(0);
  const pendingMotion = useRef<MotionStart[]>([]);
  const animations = useRef<Animation[]>([]);
  const [snap, setSnap] = useState(false);
  const [wide, setWide] = useState(true);
  const navigationWidth = view === "tree" ? "280px" : "500px";
  useLayoutEffect(() => {
    const inner = tableRef.current?.closest<HTMLDivElement>(`.${styles.scroller}`);
    if (phase === "catalogue" && overviewViewport.current) overviewViewport.current.scrollTop = catalogueScroll.current;
    else if (phase === "collapsing" && inner) inner.scrollTop = detailScroll.current;
  }, [phase]);
  useRegisterDirty("cost-analysis", editState.dirty || editState.busy, () => {}, undefined, { mode: "confirm-only" });
  useDesktopTabHome("cost-analysis-busy", { isHome: true, busy: editState.busy, returnHome: () => {} });
  const titleId = useId();
  const costQuery = useCostQuery(selectedId, actor, simulationRate);
  const refreshCost = costQuery.refetch;
  useEffect(() => {
    if (active && costQuery.isError && costQuery.error instanceof ApiError && (costQuery.error.status === 403 || costQuery.error.status === 404)) {
      setSelectedId(null); setPhase("catalogue");
    }
  }, [active, costQuery.isError, costQuery.error]);
  const cost = costQuery.data?.item_id === selectedId ? costQuery.data : undefined;
  const costBreakdown = [{ label: "재료비", value: cost?.material_cost ?? null }, { label: "누적 인건비", value: cost?.labor_cost ?? null }];
  const simulationValue = simulationInput ?? cost?.hourly_labor_rate ?? "";
  const simulationDisplay = !simulationFocused && simulationValue !== "" && simulationValid ? costNumber(simulationValue) : simulationValue;
  const yieldBusy = Boolean(costQuery.isFetching || costQuery.isPlaceholderData || editState.busy
    || simulationLoadedKey !== simulationStorageKey
    || (simulationValid && (simulationInput || undefined) !== simulationRate)
    || (simulationRate !== undefined && (cost?.hourly_labor_rate == null || rateKey(simulationRate) !== rateKey(cost.hourly_labor_rate))));
  const canEdit = Boolean(cost?.can_edit && !informationDenied);
  const catalogue = useInfiniteQuery({
    queryKey: queryKeys.costs.catalogue(actor?.employee_id ?? "", actor?.token ?? "", querySearch),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => itemsApi.getItems({ skip: pageParam, limit: CATALOGUE_PAGE_SIZE, search: querySearch || undefined }, { signal }),
    getNextPageParam: (last, pages) => last.length === CATALOGUE_PAGE_SIZE ? pages.length * CATALOGUE_PAGE_SIZE : undefined,
    enabled: Boolean(actor),
  });
  const selectedSlots = useMemo(() => new Set(productModels.filter(model => selectedModels.includes(model.model_name ?? "")).map(model => model.slot)), [productModels, selectedModels]);
  const hasCategoryFilters = Boolean(selectedDepts.length || selectedModels.length || selectedProcessSteps.length || showDisused);
  const filteredPages = useMemo(() => (catalogue.data?.pages ?? []).map(page => page.filter(item => !item.deleted_at && matchesInventoryCategoryFilters(item, {
    selectedDepts, departmentFilterBasis, selectedSlots, showUnclassified: selectedModels.includes("미분류"), showDisused, selectedProcessSteps, logic: filterLogic,
  }))), [catalogue.data?.pages, selectedDepts, departmentFilterBasis, selectedSlots, selectedModels, showDisused, selectedProcessSteps, filterLogic]);
  const matchingItems = filteredPages.flat();
  const items = matchingItems.slice(0, displayLimit);
  const navigationItems = compact && cost && !items.some(item => item.item_id === cost.item_id) ? [cost.tree, ...items] : items;
  const visibleIds = new Set(items.map(item => item.item_id));
  const summaryPages = filteredPages.map(page => page.filter(item => visibleIds.has(item.item_id)).map(item => item.item_id)).filter(page => page.length > 0);
  const summaryQueries = useCostSummaryQueries(summaryPages, actor, simulationRate);
  const summaries = new Map(summaryQueries.flatMap(query => query.data ?? []).map(summary => [summary.item_id, summary]));
  const summaryStates = new Map(summaryPages.flatMap((page, index) => page.map(id => [id, summaryQueries[index]] as const)));
  const summariesFailed = summaryQueries.some(query => query.isError);
  const filteringMore = Boolean(catalogue.hasNextPage) && (hasCategoryFilters || matchingItems.length === 0);
  const fetchNextCataloguePage = catalogue.fetchNextPage;
  const fetchingCataloguePage = catalogue.isFetchingNextPage;
  const catalogueFailed = catalogue.isError;
  useEffect(() => {
    const filters = JSON.stringify([querySearch, selectedDepts, selectedModels, selectedProcessSteps, departmentFilterBasis, filterLogic, showDisused]);
    if (restoredCatalogue.current?.filters === filters) setDisplayLimit(restoredCatalogue.current.limit);
    else { restoredCatalogue.current = null; setDisplayLimit(CATALOGUE_PAGE_SIZE); }
  }, [querySearch, selectedDepts, selectedModels, selectedProcessSteps, departmentFilterBasis, filterLogic, showDisused]);
  useEffect(() => {
    // A match can be on a later API page; never filter only the first loaded page.
    if (filteringMore && !fetchingCataloguePage && !catalogueFailed) void fetchNextCataloguePage();
  }, [filteringMore, fetchingCataloguePage, catalogueFailed, fetchNextCataloguePage, catalogue.data?.pages.length]);
  function resetFilters(): void {
    setSelectedDepts([]); setSelectedModels([]); setSelectedProcessSteps([]);
    setDepartmentFilterBasis(DEFAULT_DEPARTMENT_FILTER_BASIS); setFilterLogic(DEFAULT_INVENTORY_FILTER_LOGIC);
    setShowDisused(false); setSearch("");
  }
  const stopMotion = useCallback((): void => {
    animations.current.forEach(animation => animation.cancel());
    animations.current = [];
  }, []);
  const settleMotion = useCallback((): void => {
    pendingMotion.current = [];
    stopMotion();
    setSnap(true);
    setPhase(current => current === "collapsing" ? "detail" : current === "expanding" ? "catalogue" : current);
  }, [stopMotion]);
  useLayoutEffect(() => {
    const starts = pendingMotion.current;
    pendingMotion.current = [];
    // Batch destination reads before starting compositor-only animations.
    const targets = starts.filter(start => start.element.isConnected).map(start => ({
      ...start, destination: start.element.getBoundingClientRect(), base: getComputedStyle(start.element).transform || "none",
    }));
    for (const { element, left, top, destination, base } of targets) {
      if (typeof element.animate !== "function") continue;
      animations.current.push(element.animate([
        { transform: `translate(${left - destination.left}px, ${top - destination.top}px) ${base === "none" ? "" : base}`.trim() },
        { transform: base },
      ], { duration: 400, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "both" }));
    }
    return stopMotion;
  }, [phase, stopMotion]);
  useLayoutEffect(() => {
    if (!snap) return;
    navigationRef.current?.getBoundingClientRect();
    const frame = requestAnimationFrame(() => setSnap(false));
    return () => cancelAnimationFrame(frame);
  }, [snap]);
  useEffect(() => {
    if (!transitioning) return;
    window.addEventListener("resize", settleMotion);
    return () => window.removeEventListener("resize", settleMotion);
  }, [transitioning, settleMotion]);
  useEffect(() => {
    const timer = setTimeout(() => setQuerySearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => { if (phase === "catalogue") searchRef.current?.focus({ preventScroll: true }); }, [phase]);
  useEffect(() => {
    if (!transitioning) return;
    // A canceled/disabled CSS transition must not leave analysis waiting forever.
    const timer = setTimeout(() => setPhase(phase === "collapsing" ? "detail" : "catalogue"), 450);
    return () => clearTimeout(timer);
  }, [phase, transitioning]);
  useEffect(() => {
    if (!initialToken.current && actor?.token) initialToken.current = actor.token;
    else if (initialToken.current && actor?.token !== initialToken.current) { setYieldExpanded(false); onClose(); }
  }, [actor?.token, onClose]);
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const measure = (): void => {
      const isWide = surface.clientWidth >= 1280;
      setWide(isWide);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [initialItemId]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (initialItemId ? closeRef.current ?? searchRef.current : searchRef.current)?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [initialItemId]);
  const guarded = useCallback((action: () => void): void => {
    if (editState.busy) return;
    if (editState.dirty) setPendingAction(() => action);
    else action();
  }, [editState]);
  const resetInformation = useCallback((): void => { setInformationVersion(version => version + 1); setEditState({ dirty: false, busy: false }); }, []);
  const informationAccessDenied = useCallback((): void => { setInformationDenied(true); resetInformation(); setView("tree"); void refreshCost(); }, [resetInformation, refreshCost]);
  useLayoutEffect(() => {
    if (!navigation || !active || !(editState.dirty || editState.busy)) return;
    navigation.guard.current = guarded;
    return () => { if (navigation.guard.current === guarded) navigation.guard.current = null; };
  }, [navigation, active, guarded, editState.dirty, editState.busy]);
  useDashboardSnapshot("cost:main", () => ({ selectedId, view, yieldExpanded, simulationInput, search, selectedDepts, selectedModels, selectedProcessSteps, filterLogic, departmentFilterBasis, showDisused, displayLimit, catalogueScroll: catalogueScroll.current, detailScroll: detailScroll.current }), state => {
    restoredCatalogue.current = { filters: JSON.stringify([state.search.trim(), state.selectedDepts, state.selectedModels, state.selectedProcessSteps, state.departmentFilterBasis, state.filterLogic, state.showDisused]), limit: state.displayLimit };
    resetInformation(); setSelectedId(state.selectedId); setPhase(state.selectedId ? "detail" : "catalogue"); setView(state.view); setYieldExpanded(state.yieldExpanded); setSimulationInput(state.simulationInput); setSearch(state.search); setQuerySearch(state.search.trim()); setSelectedDepts(state.selectedDepts); setSelectedModels(state.selectedModels); setSelectedProcessSteps(state.selectedProcessSteps); setFilterLogic(state.filterLogic); setDepartmentFilterBasis(state.departmentFilterBasis); setShowDisused(state.showDisused); setDisplayLimit(state.displayLimit); catalogueScroll.current = state.catalogueScroll; detailScroll.current = state.detailScroll;
  }, { isHome: !selectedId, home: () => { resetInformation(); setSelectedId(null); setPhase("catalogue"); catalogueScroll.current = 0; if (overviewViewport.current) overviewViewport.current.scrollTop = 0; } });
  useEffect(() => {
    if (!active) return;
    function escape(event: KeyboardEvent): void {
      if (event.key !== "Escape" || event.defaultPrevented || pendingAction) return;
      event.preventDefault();
      event.stopPropagation();
      if (view === "info") guarded(() => { resetInformation(); setView("tree"); });
      else guarded(onClose);
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [active, view, pendingAction, guarded, resetInformation, onClose]);
  function select(id: string | null): void {
    const change = (): void => {
      const next = selectedId === id ? null : id;
      setYieldExpanded(false);
      resetInformation();
      setView("tree");
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      if (!next || !selectedId) {
        const navigation = navigationRef.current;
        const innerScroller = tableRef.current?.closest<HTMLDivElement>(`.${styles.scroller}`);
        const scroller = phase === "catalogue" ? overviewViewport.current : innerScroller;
        if (phase === "catalogue" && scroller && tableRef.current) {
          catalogueScroll.current = scroller.scrollTop;
          detailScroll.current = Math.max(0, scroller.getBoundingClientRect().top - tableRef.current.getBoundingClientRect().top);
        }
        if (phase === "catalogue") frozenTableWidth.current = tableRef.current?.getBoundingClientRect().width ?? 0;
        else if (navigation?.parentElement && scroller) {
          const padding = getComputedStyle(scroller);
          frozenTableWidth.current = navigation.parentElement.clientWidth - (navigation.offsetWidth - navigation.clientWidth)
            - (scroller.offsetWidth - scroller.clientWidth) - (parseFloat(padding.paddingLeft) || 0) - (parseFloat(padding.paddingRight) || 0);
        }
        // Fixed row/header heights let us measure only the visible slice.
        const rows = tableRef.current?.tBodies[0]?.rows;
        const starts: MotionStart[] = [];
        if (!reduced && rows && scroller) {
          const rowScroll = phase === "catalogue" ? detailScroll.current : scroller.scrollTop;
          const first = Math.max(0, Math.floor(rowScroll / 65));
          const last = Math.min(rows.length, Math.ceil((rowScroll + Math.max(0, scroller.clientHeight - (tableRef.current?.tHead?.offsetHeight ?? 0))) / 65));
          for (let index = first; index < last; index++) {
            rows[index].querySelectorAll<HTMLElement>("[data-cost-motion]").forEach(element => {
              const rect = element.getBoundingClientRect();
              starts.push({ element, left: rect.left, top: rect.top });
            });
          }
        }
        pendingMotion.current = starts;
        setPhase(next ? reduced ? "detail" : "collapsing" : reduced ? "catalogue" : "expanding");
      }
      setSelectedId(next);
    };
    guarded(() => navigation ? navigation.commit(change, Boolean(selectedId && id)) : change());
  }

  useEffect(() => {
    if (previousRequest.current === initialRequest) return;
    previousRequest.current = initialRequest;
    if (initialItemId) {
      navigation?.commit(() => { resetInformation(); setSelectedId(initialItemId); setPhase("detail"); setView("tree"); setYieldExpanded(false); }, true);
    }
  }, [initialRequest, initialItemId, navigation, resetInformation]);

  const header = <header className={headerTarget ? "flex min-h-11 min-w-0 flex-1 items-center gap-3" : "flex min-h-16 shrink-0 items-center gap-3 border-b px-5"} style={{ borderColor: "var(--c-border)" }}>
          <button ref={closeRef} type="button" aria-label="대시보드로 돌아가기" disabled={editState.busy} onClick={() => guarded(onClose)} className={`${BUTTON} shrink-0`} style={{ color: "var(--c-muted2)" }}><ArrowLeft size={16} />대시보드</button>
          <span aria-hidden="true" style={{ color: "var(--c-muted)" }}>/</span>
          <Calculator size={20} className="shrink-0" style={{ color: "var(--c-purple)" }} /><h2 id={titleId} className="shrink-0 text-[24px] font-black tracking-[-0.02em]">원가 분석</h2>
          {selectedId && <span className="text-xs" style={{ color: "var(--c-muted2)" }}>선택 품목 1개 기준</span>}
          {process.env.NEXT_PUBLIC_COST_PREVIEW === "1" && <span className="rounded-full px-3 py-1 text-xs" style={{ color: "var(--c-yellow)", background: "var(--c-warning-bg)" }}>BOM 참고 단가 · 검수용</span>}
          {selectedId && <button type="button" disabled={editState.busy} className={`${BUTTON} ml-auto`} onClick={() => select(null)}><PanelLeft size={16} />품목 목록</button>}
        </header>
  return <>
    {renderDashboardSwitch && active && headerTarget && createPortal(<DashboardViewSwitch active="cost" disabled={editState.busy} onChange={target => navigation ? onDashboardViewChange?.(target) : guarded(() => onDashboardViewChange ? onDashboardViewChange(target) : onClose())} />, headerTarget)}
    <div className={scrollStyles.root}><div ref={overviewViewport} data-testid="cost-overview-scroll" data-overview={phase === "catalogue"} onScroll={() => { if (phase === "catalogue" && overviewViewport.current) catalogueScroll.current = overviewViewport.current.scrollTop; }} className={`sg ${scrollStyles.viewport} ${phase === "catalogue" ? styles.overview : ""}`}><div className={scrollStyles.content}>
    {phase === "catalogue" && (capacityData || capacityLoading || capacityError) && <CostModelKpis targets={toCostKpiTargets(capacityData?.af?.auto_representatives ?? [])} actor={actor} hourlyRate={simulationRate} capacityLoading={capacityLoading} capacityError={capacityError} onCapacityRetry={onCapacityRetry} onOpen={select} />}
    <section ref={surfaceRef} role="region" aria-label={headerTarget ? "원가 분석" : undefined} aria-labelledby={headerTarget ? undefined : titleId} className={`${styles.surface} flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[24px] border`} style={{ background: "var(--c-s1)", borderColor: "var(--c-border)" }}>
        {!headerTarget && header}
        <div className={`relative flex min-h-0 flex-1 ${styles.body}`} data-phase={phase} data-detail={detailTarget} data-compact={compact} data-snap={snap} style={{ "--cost-nav-width": wide ? navigationWidth : "0px", "--cost-table-width": `${Math.max(0, frozenTableWidth.current)}px` } as CSSProperties}>
          <aside ref={navigationRef} aria-label="분석 품목 탐색" aria-hidden={Boolean(phase === "detail" && !wide) || undefined} inert={Boolean(phase === "detail" && !wide) || undefined} onTransitionEnd={event => {
            if (event.target !== event.currentTarget || event.propertyName !== "width") return;
            const actual = event.currentTarget.getBoundingClientRect().width;
            const parentWidth = event.currentTarget.parentElement!.clientWidth;
            const target = detailTarget ? (wide ? parseFloat(navigationWidth) : 0) : parentWidth;
            // A completion queued before a reversal cannot finish the new target.
            if (actual > 0 && Math.abs(actual - target) > 1) return;
            setPhase(current => current === "collapsing" ? "detail" : current === "expanding" ? "catalogue" : current);
          }} className={`flex min-h-0 flex-col ${styles.navigation}`} style={{ background: "var(--c-popup-bg)", borderColor: "var(--c-border)" }}>
            <div data-testid="cost-search-bar" className={`flex shrink-0 items-center ${phase === "catalogue" ? "gap-2.5 px-5 pb-[15px] pt-[14px]" : "min-h-[57px] gap-2 border-b px-4 py-[5px]"}`} style={{ borderColor: "var(--c-border)" }}>
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3" style={{ borderColor: "var(--c-border)", background: "var(--c-s2)" }}><Search size={16} className="shrink-0" /><input ref={searchRef} aria-label="분석 품목 검색" placeholder="품목명 · 코드 · 검색용 이름" value={search} onChange={event => setSearch(event.target.value)} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
              {phase === "catalogue" && <InventoryFilterToggleButton filtersOpen={filtersOpen} logic={filterLogic} onLogicChange={setFilterLogic} onToggle={() => setFiltersOpen(open => !open)} controlsId="cost-inventory-filter-panel" ariaLabel={filtersOpen ? "원가 목록 필터 닫기" : "원가 목록 필터 열기"} />}
            </div>
              <div data-testid="cost-catalogue-viewport" onScroll={() => { if (transitioning) settleMotion(); }} className={`sg min-h-0 flex-1 overflow-y-auto ${styles.scroller}`}>
                <InventoryFilters panelId="cost-inventory-filter-panel" className="!mt-[-1.5px] mb-[13.5px]" open={phase === "catalogue" && filtersOpen}
                  selectedDepts={selectedDepts} departmentFilterBasis={departmentFilterBasis} selectedModels={selectedModels} selectedProcessSteps={selectedProcessSteps} showDisused={showDisused} productModels={productModels}
                  toggleDept={toggleDept} onDepartmentFilterBasisChange={setDepartmentFilterBasis} toggleModel={toggleModel} toggleProcessStep={toggleProcessStep} toggleDisused={() => setShowDisused(value => !value)}
                  onClearDepts={() => setSelectedDepts([])} onClearModels={() => setSelectedModels([])} onClearProcessSteps={() => setSelectedProcessSteps([])} onResetAll={resetFilters}
                  isAnyFilterActive={hasCategoryFilters || search.length > 0 || filterLogic !== DEFAULT_INVENTORY_FILTER_LOGIC || departmentFilterBasis !== DEFAULT_DEPARTMENT_FILTER_BASIS} />
                <InventoryTable tableRef={tableRef} ariaLabel={compact ? "분석 품목 탐색 목록" : "원가분석 품목 목록"} tableClassName={`w-full text-left ${styles.table}`} stickyTop="0px" showHeader={!detailTarget}
                  columns={["품목명", "품목코드", "개당 원가", "단계 인건비", "합계"].map((label, index) => ({ label, header: label === "단계 인건비" ? <span title="이 단계 1개당 인건비 (개당 원가에 포함)">{label}</span> : undefined, ariaHidden: Boolean(compact && index > 0), nowrap: true, className: `${index > 0 ? styles.metadata : ""} ${index > 1 ? styles.price : ""}`, center: index > 1 }))}>
                  {navigationItems.map(item => <tr key={item.item_id} data-selected={selectedId === item.item_id} onClick={() => select(item.item_id)} className="group cursor-pointer hover:bg-[var(--c-s2)]">
                    <td className={styles.nameCell}><button type="button" disabled={editState.busy} aria-pressed={selectedId === item.item_id} aria-label={compact ? `${item.item_name} ${item.mes_code}` : `${item.item_name} ${item.mes_code} 원가 분석`} className="flex min-h-14 w-full items-center text-left font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-purple)] disabled:opacity-40"><span data-cost-motion="name" className={`block min-w-0 flex-1 truncate leading-5 ${styles.nameText}`}>{item.item_name}</span></button></td>
                    <td aria-hidden={compact || undefined} className={`${styles.codeCell} font-mono text-xs`} style={{ color: "var(--c-muted2)" }}><span data-cost-motion="code" className={styles.codeText}>{item.mes_code}</span></td>
                    {(["unit_cost", "own_labor_cost", "amount"] as const).map(field => {
                      const summary = summaries.get(item.item_id);
                      const value = summary?.[field];
                      const repeated = field === "amount" && summary?.own_labor_cost !== null && costNumber(summary?.own_labor_cost ?? null) === "0" && value !== null && value === summary?.unit_cost;
                      return <td key={field} aria-hidden={compact || undefined} className={`${styles.metadata} ${styles.price} tabular-nums ${field === "amount" ? "font-bold" : ""}`} style={{ color: field === "amount" ? "var(--c-purple)" : "var(--c-text)" }}>
                        {!summary ? <span style={{ color: "var(--c-muted2)" }}>{summaryStates.get(item.item_id)?.isError ? "조회 실패" : summaryStates.get(item.item_id)?.data ? "정보 없음" : "불러오는 중…"}</span> : <span title={repeated ? `개당 원가와 동일: ${costNumber(value ?? null)} 원` : value !== null && costNumber(value ?? null) === "0" ? "등록된 0원" : summary.status === "partial" ? "부분 합계 · 미등록 기준값이 있습니다" : undefined}>{summary.status === "partial" && field === "unit_cost" && <span className="sr-only">부분 합계 </span>}{repeated ? "—" : field === "own_labor_cost" && value === null ? "미등록" : tableAmount(value ?? null)}{summary.status === "partial" && field === "amount" && <span className="block text-xs font-normal" style={{ color: "var(--c-muted2)" }}>부분 합계</span>}</span>}
                      </td>;
                    })}
                  </tr>)}
                </InventoryTable>
                {catalogue.isPending && <p role="status" className="p-6 text-sm">품목을 불러오는 중입니다.</p>}
                {catalogue.isError && <div role="alert" className="p-6 text-sm"><p>품목을 불러오지 못했습니다.</p><button className={BUTTON} onClick={() => void catalogue.refetch()}>다시 불러오기</button></div>}
                {summariesFailed && !compact && <div role="alert" className="p-4 text-sm"><p>일부 품목의 원가를 불러오지 못했습니다.</p><button className={BUTTON} onClick={() => { summaryQueries.filter(query => query.isError).forEach(query => void query.refetch()); }}>원가 다시 불러오기</button></div>}
                {filteringMore && !catalogue.isError && <p role="status" className="p-4 text-sm" style={{ color: "var(--c-muted2)" }}>나머지 품목의 필터 조건을 확인하고 있습니다.</p>}
                {!catalogue.isPending && !catalogue.isError && !filteringMore && navigationItems.length === 0 && <p className="p-6 text-sm">검색 결과가 없습니다.</p>}
                {(matchingItems.length > displayLimit || (!hasCategoryFilters && catalogue.hasNextPage)) && <button className={`${BUTTON} mt-3 w-full`} disabled={catalogue.isFetchingNextPage} onClick={() => { if (matchingItems.length <= displayLimit && catalogue.hasNextPage) void catalogue.fetchNextPage(); setDisplayLimit(limit => limit + CATALOGUE_PAGE_SIZE); }}>{catalogue.isFetchingNextPage ? "불러오는 중…" : "더 보기"}</button>}
              </div>
          </aside>
          <main aria-hidden={phase !== "detail" || undefined} inert={phase !== "detail" || undefined} className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" style={{ background: "var(--c-bg)" }}>
            {headerTarget && selectedId && !wide && (!cost || costQuery.isError) && <button type="button" disabled={editState.busy} className={`${BUTTON} self-start`} onClick={() => select(null)}><PanelLeft size={16} />품목 목록</button>}
            <div className={`relative flex min-h-0 flex-1 flex-col ${styles.analysis} ${phase === "detail" ? styles.reveal : ""}`}>
            {phase === "detail" && selectedId && (costQuery.isError ? <div role="alert" className="p-6"><p>원가를 불러오지 못했습니다.</p><button className={BUTTON} onClick={() => void costQuery.refetch()}>다시 불러오기</button></div>
              : !cost ? <p role="status" className="p-6">원가를 불러오는 중입니다.</p>
              : <>
                <div data-testid="cost-summary-bar" className={`${styles.summaryBar} flex min-h-[57px] shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-5 py-1.5`} style={{ background: "var(--c-s1)", borderColor: "var(--c-border)" }}>
                  {headerTarget && selectedId && !wide && <button type="button" disabled={editState.busy} className={`${BUTTON} shrink-0`} onClick={() => select(null)}><PanelLeft size={16} />품목 목록</button>}
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-x-3"><h3 className="break-words text-base font-bold">{cost.tree.item_name}</h3><p className="text-xs" style={{ color: "var(--c-muted2)" }}>{cost.tree.mes_code}</p></div>{process.env.NEXT_PUBLIC_COST_PREVIEW === "1" && <p className="mt-0.5 text-xs" style={{ color: "var(--c-yellow)" }}>실습 DB · 추정 단가 포함 · 시간·시급은 운영 확정값이 아닙니다.</p>}</div>
                  <dl className="flex flex-wrap items-center gap-x-4 gap-y-2">{[{ label: cost.status === "partial" ? "개당 원가 · 부분 합계" : "개당 원가", value: cost.unit_cost }, ...(view === "info" ? costBreakdown : [])].map(({ label, value }, index) => <div key={label} className="flex items-baseline gap-2"><dt className="whitespace-nowrap text-xs" style={{ color: "var(--c-muted2)" }}>{label}</dt><dd className={`whitespace-nowrap font-bold tabular-nums ${index === 0 ? "text-2xl" : "text-base"}`} style={{ color: index === 0 ? "var(--c-purple)" : "var(--c-text)" }}>{costNumber(value)}{value !== null && <span className="ml-1 text-xs font-normal">원</span>}</dd></div>)}</dl>
                  <CostStatusBadge status={cost.status} issues={cost.issues} />
                  {(yieldBusy || !simulationValid) && <p role="status" className="text-xs" style={{ color: "var(--c-muted2)" }}>이전 계산값 · {simulationValid ? "다시 계산 중" : "시급 입력 확인 필요"}</p>}
                  {view !== "info" && <CostYieldSummary cost={cost} assumedHourly={Boolean(simulationInput)} busy={yieldBusy} invalidHourly={!simulationValid} compact inline expanded={yieldExpanded} onExpandedChange={setYieldExpanded}>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-6 gap-y-2">
                      <dl className="flex flex-wrap gap-x-6 gap-y-2">{costBreakdown.map(({ label, value }) => <div key={label} className="flex items-baseline gap-2"><dt className="text-xs" style={{ color: "var(--c-muted2)" }}>{label}</dt><dd className="text-sm font-bold tabular-nums">{costNumber(value)}{value !== null && <span className="ml-1 text-xs font-normal">원</span>}</dd></div>)}</dl>
                      <div role="group" aria-label="원가 계산 변수" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={{ color: "var(--c-muted2)" }}>
                      <label className="flex items-center gap-2 font-bold">가정 시급<span className="relative inline-flex items-center"><input aria-label="가정 시급 (원/시간)" inputMode="decimal" value={simulationDisplay} placeholder="기준 시급" aria-invalid={!simulationValid} disabled={editState.busy} onFocus={() => setSimulationFocused(true)} onBlur={() => setSimulationFocused(false)} onChange={event => setSimulationInput(event.target.value.replaceAll(",", ""))} className="min-h-9 w-[11ch] rounded-[10px] border pl-2 pr-6 text-right tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-purple)]" style={{ background: "var(--c-s2)", borderColor: simulationValid ? "var(--c-border)" : "var(--c-red)", color: "var(--c-text)" }} /><span aria-hidden="true" className="pointer-events-none absolute right-2 font-normal">원</span></span></label>
                      {!simulationValid && <span role="alert" style={{ color: "var(--c-red)" }}>0 이상, 소수 둘째 자리까지 입력해 주세요.</span>}
                      </div>
                    </div>
                  </CostYieldSummary>}
                </div>
                <div className={`${styles.views} flex min-h-0 flex-1 flex-col [&>[role=tabpanel]]:min-h-0 [&>[role=tabpanel]]:flex-1 [&>[role=tabpanel]>div]:flex [&>[role=tabpanel]>div]:h-full [&>[role=tabpanel]>div]:min-h-0 [&>[role=tabpanel]>div]:flex-col [&>[role=tabpanel]>div>div:last-child]:min-h-0 [&>[role=tabpanel]>div>div:last-child]:flex-1`} style={{ "--cost-view-height": "0px" } as CSSProperties}>
                  <CostViews key={`${actor?.token}:${selectedId}`} root={cost.tree} canEdit={canEdit} activeView={view} onViewChange={setView} beforeViewChange={guarded} navigationDisabled={editState.busy}
                    information={canEdit && actor ? <CostPurchaseInfo key={`${actor.token}:${selectedId}:${informationVersion}`} itemId={cost.item_id} actor={actor} onStateChange={setEditState} onAccessDenied={informationAccessDenied} /> : undefined} />
                </div>
                <CostIssues key={selectedId} root={cost.tree} issues={cost.issues} compact />
              </>)}
            </div>
          </main>
        </div>
    </section></div></div></div>
    <ConfirmModal open={Boolean(pendingAction)} title="수정 중인 내용을 버릴까요?" tone="caution" confirmLabel="변경 내용 버리기" onClose={() => setPendingAction(null)} onConfirm={() => {
      const action = pendingAction;
      setPendingAction(null);
      if (navigation?.guard.current === guarded) navigation.guard.current = null;
      resetInformation();
      action?.();
    }}><p>저장하지 않은 정보 변경이 사라집니다.</p></ConfirmModal>
  </>;
}
