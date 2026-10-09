"use client";
import { useDesktopTabHome } from "./DesktopTabHome";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { defectsApi } from "@/lib/api/defects";
import type { DefectKpi, DefectLocation } from "@/lib/api/types/defects";
import { isWarehouseStaff } from "./_warehouse_steps";
import { useWarehouseData } from "./_warehouse_hooks/useWarehouseData";
import type { Operator } from "./login/useCurrentOperator";
import { DefectKpiCards, type DefectKpiKind } from "./_defect_hub/DefectKpiCards";
import { DefectHubEntry } from "./_defect_hub/DefectHubEntry";
import type { DefectHubCardId } from "./_defect_hub/defectHubCards";
import { DefectFilterBar, type DefectScope } from "./_defect_hub/DefectFilterBar";
import { DefectSearchInput } from "./_defect_hub/DefectSearchInput";
import { DefectStatisticsView } from "./_defect_hub/DefectStatisticsView";
import { DefectStorageView, ManagementCategoryModal } from "./_defect_hub/DefectStorageView";
import { useDefectFilterPreferences } from "./_defect_hub/useDefectFilterPreferences";
import { filterDefectLocations } from "./_defect_hub/defectCategoryFilter";
import { DefectDepartmentList } from "./_defect_hub/DefectDepartmentList";
import { DefectCartFlow, type DefectCartMode } from "./_defect_hub/DefectCartFlow";
import { DefectWorkChoice, type DefectWorkAction, type DefectSourceKind } from "./_defect_hub/DefectWorkChoice";
import { DefectProcessPanel } from "./_defect_hub/DefectProcessPanel";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import { ReadEmpty, ReadFailure, ReadLoading } from "./common/ReadState";
import { matchesDefectSearch } from "./_defect_hub/defectSearch";
import { makeClientRequestId } from "@/lib/uuid";


const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const PRODUCTION_LINES = new Set(["튜브", "고압", "진공", "튜닝", "조립", "출하"]);

/** 화면 모드 — hub가 진입점. list 외에는 좌측 목록을 덮는 전폭 작업 화면. */
type ViewMode =
  | { kind: "hub" }
  | { kind: "work-choice"; action: DefectWorkAction | null; source: DefectSourceKind | null }
  | { kind: "list" }
  | { kind: "storage" }
  | { kind: "statistics" }
  | { kind: "cart"; mode: DefectCartMode; action: DefectWorkAction; source: DefectSourceKind }
  | { kind: "process"; locations: DefectLocation[]; batch: boolean; restoreOnly?: boolean };

type WorkHistoryState = { defect?: string; mode?: string; action?: string | null; directAction?: string | null; source?: string; step?: number; storageEntry?: string; restoreOnly?: boolean; recordId?: string } | null;

/** 이전 출처 선택 이력은 통합 화면으로, 확정된 카트 이력은 품목 화면으로 복원한다. */
function workViewFromHistory(state: WorkHistoryState): Extract<ViewMode, { kind: "work-choice" | "cart" }> | null {
  if (state?.defect === "work-choice") {
    const action = state.action === "add" || state.action === "scrap" || state.action === "rework" ? state.action : null;
    const source = state.source === "warehouse" || state.source === "production" ? state.source : null;
    return { kind: "work-choice", action, source };
  }
  if (state?.defect !== "cart" || (state.mode !== "add" && state.mode !== "scrap")) return null;
  const action = state.mode === "add" ? "add" : state.directAction === "rework" ? "rework" : state.directAction === "scrap" ? "scrap" : null;
  const valid = (state.step === 2 || (state.step === 3 && action === "rework"))
    && action !== null && !(state.mode === "add" && state.directAction === "rework");
  if (valid && action) return { kind: "cart", mode: state.mode, action, source: action === "rework" ? "production" : state.source === "warehouse" ? "warehouse" : "production" };
  return { kind: "work-choice", action: action === "rework" ? null : action, source: null };
}

interface Props {
  operator: Operator | null;
  defectDeptFilter?: string | null;
  onStatusChange?: (status: string) => void;
}

/**
 * 데스크톱 불량 탭 — 목록(개요) + 전폭 작업 화면.
 * list 모드는 KPI·퀵액션·필터·부서별 목록(다중선택). 액션 시 좌측을 덮는 전폭 흐름으로
 * 전환(새 불량 추가 / R 바로 폐기·반품 / 일괄 처리 / PA·PF 분해).
 */
export function DesktopDefectView({ operator, defectDeptFilter, onStatusChange }: Props) {
  if (!operator) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6">
        <div className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted }}>
          작업자 로그인이 필요합니다.
        </div>
      </div>
    );
  }

  return (
    <DefectViewInner
      operator={operator}
      defectDeptFilter={defectDeptFilter}
      onStatusChange={onStatusChange}
    />
  );
}

function DefectViewInner({
  operator,
  defectDeptFilter,
  onStatusChange,
}: {
  operator: Operator;
  defectDeptFilter?: string | null;
  onStatusChange?: (status: string) => void;
}) {
  const realtimeRevision = useRealtimeRevision();
  const noop = useMemo(() => () => {}, []);
  // 피커용 품목/모델 — 입출고와 동일하게 자체 로드(shell 은 넘겨주지 않음).
  const { items, productModels } = useWarehouseData({
    globalSearch: "",
    onStatusChange: onStatusChange ?? noop,
  });

  const [locations, setLocations] = useState<DefectLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const restoreSessionRef = useRef<{ entry: string | undefined; location: DefectLocation } | null>(null);
  const completedStorageEntryRef = useRef<string | null>(null);

  const defaultScope: DefectScope = defectDeptFilter
    ? "my"
    : isWarehouseStaff(operator)
      ? "all"
      : PRODUCTION_LINES.has(operator.department)
        ? "my"
        : "all";
  const {
    scope,
    actorScope,
    sort,
    filterLocked,
    setScope,
    setActorScope,
    setSort,
    setFilterLocked,
    selectedDepartments,
    selectedModels,
    selectedProcessSteps,
    setSelectedDepartments,
    setSelectedModels,
    setSelectedProcessSteps,
    resetCategoryFilters,
  } = useDefectFilterPreferences({
    employeeId: operator.employee_id,
    defaultScope,
    defaultSort: "newest",
    currentDept: operator.department,
    defectDeptFilter,
  });
  const [kpiFilter, setKpiFilter] = useState<DefectKpiKind | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>({ kind: "hub" });
  const [managementLocation, setManagementLocation] = useState<DefectLocation | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  useDesktopTabHome("defect", {
    isHome: view.kind === "hub" && managementLocation === null,
    returnHome: () => {
      setView({ kind: "hub" });
      setManagementLocation(null);
    },
  });

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    const background = hasLoadedRef.current;
    async function load() {
      if (background) {
        setRefreshError(null);
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        const locData = await defectsApi.listDefects();
        if (generation === requestGenerationRef.current) {
          hasLoadedRef.current = true;
          setLocations(locData);
          setRefreshError(null);
          setView((currentView) => {
            if (currentView.kind !== "process") return currentView;
            const freshLocations = currentView.locations
              .map((selected) => locData.find(
                (location) =>
                  location.record_id === selected.record_id &&
                  Number(location.available_quantity) > 0,
              ))
              .filter((location): location is DefectLocation => location !== undefined);
            return freshLocations.length === currentView.locations.length
              ? { kind: "process", locations: freshLocations, batch: currentView.batch, restoreOnly: currentView.restoreOnly }
              : { kind: "list" };
          });
        }
      } catch (err) {
        if (generation === requestGenerationRef.current) {
          const message = err instanceof Error ? err.message : "불량 데이터 로드에 실패했습니다.";
          if (background) setRefreshError(message);
          else setError(message);
        }
      } finally {
        if (generation === requestGenerationRef.current && !background) setLoading(false);
      }
    }
    void load();
    return () => {
      if (generation === requestGenerationRef.current) requestGenerationRef.current += 1;
    };
  }, [reloadNonce, realtimeRevision]);

  const departmentOptions = useMemo(
    () => Array.from(new Set(locations.map((location) => location.department).filter(Boolean))).sort(),
    [locations],
  );
  const modelOptions = useMemo(
    () => Array.from(new Set(productModels.map((model) => model.model_name).filter((name): name is string => Boolean(name)))),
    [productModels],
  );

  // 부서·모델·공정과 격리 처리자 범위를 합성 — KPI 집계와 목록이 공유하는 모집단
  const scopedLocations = useMemo(() => {
    let result = locations.filter((location) => (location.management_category ?? "DEFECT") === "DEFECT");
    if (scope === "my") {
      const targetDept = defectDeptFilter ?? operator.department;
      result = result.filter((loc) => loc.department === targetDept);
    } else if (scope === "production") {
      result = result.filter((loc) => PRODUCTION_LINES.has(loc.department));
    }
    if (actorScope === "mine") {
      result = result.filter(
        (loc) => loc.quarantined_by_employee_id === operator.employee_id,
      );
    }
    return filterDefectLocations(result, items, productModels, {
      departments: selectedDepartments,
      models: selectedModels,
      processSteps: selectedProcessSteps,
    });
  }, [locations, scope, actorScope, defectDeptFilter, operator.department, operator.employee_id, items, productModels, selectedDepartments, selectedModels, selectedProcessSteps]);

  // KPI — 현재 부서 범위 기준으로 집계해 목록과 항상 일치 (서버 /kpi 대신 클라 계산)
  const kpi = useMemo<DefectKpi>(
    () => ({
      quarantined: scopedLocations.length,
      over_one_year: scopedLocations.filter(
        (loc) =>
          loc.defective_at != null &&
          Date.now() - new Date(loc.defective_at).getTime() > ONE_YEAR_MS,
      ).length,
    }),
    [scopedLocations],
  );

  // 화면 목록 — 범위 + KPI 필터(1년 이상) + 정렬
  const filteredLocations = useMemo(() => {
    let result = scopedLocations;

    if (kpiFilter === "over_one_year") {
      result = result.filter(
        (loc) =>
          loc.defective_at != null &&
          Date.now() - new Date(loc.defective_at).getTime() > ONE_YEAR_MS,
      );
    }
    result = result.filter((loc) => matchesDefectSearch(loc, search));

    return [...result].sort((a, b) => {
      const ta = a.defective_at ? new Date(a.defective_at).getTime() : 0;
      const tb = b.defective_at ? new Date(b.defective_at).getTime() : 0;
      return sort === "oldest" ? ta - tb : tb - ta;
    });
  }, [scopedLocations, sort, kpiFilter, search]);

  // KPI 집계 범위 라벨 — 숫자가 어느 범위인지 카드 부제로 노출
  const departmentScopeLabel = selectedDepartments.length > 0
    ? selectedDepartments.join(" · ")
    : scope === "my"
      ? `${defectDeptFilter ?? operator.department} 부서`
      : scope === "production"
      ? "생산 전체"
      : "전체 부서";
  const scopeLabel = `${departmentScopeLabel} · ${actorScope === "mine" ? "내가 격리" : "격리자 전체"}`;

  const employee = {
    employee_id: operator.employee_id,
    name: operator.name,
    department: operator.department,
  };

  // history.state 기반 뒤로/앞으로 동기화.
  // 마운트 시 현재 엔트리에 defect state가 있으면 뷰 복원 (다른 탭에서 뒤로가기로 복귀하는 경우).
  // defect state가 없으면 hub로 replaceState — 항상 스택 바닥이 hub.
  useEffect(() => {
    const cur = window.history.state as WorkHistoryState;
    const workView = workViewFromHistory(cur);
    if (workView) {
      setView(workView);
      if (workView.kind === "work-choice") window.history.replaceState({ ...window.history.state, defect: "work-choice", action: workView.action, source: workView.source }, "");
    } else if (cur?.defect === "storage") {
      setView({ kind: "storage" });
    } else if (cur?.defect === "list") {
      setView({ kind: "list" });
    } else if (cur?.defect === "statistics") {
      setView({ kind: "statistics" });
    } else if (cur?.defect === "process") {
      // location 데이터 없이 복원 불가 — 목록으로
      const target = cur.restoreOnly ? "hub" : "list";
      setView({ kind: target });
      window.history.replaceState({ ...window.history.state, defect: target }, "");
    } else {
      window.history.replaceState({ ...window.history.state, defect: "hub" }, "");
    }

    function onPop(e: PopStateEvent) {
      // 다른 탭 이탈은 Shell의 확인 결과가 나올 때까지 현재 초안을 유지한다.
      if (window.location.pathname === "/mes" && new URLSearchParams(window.location.search).get("tab") !== "defect") return;
      const s = e.state as WorkHistoryState;
      const completedEntry = completedStorageEntryRef.current;
      completedStorageEntryRef.current = null;
      if ((completedEntry && (s?.defect !== "storage" || s.storageEntry !== completedEntry))
        || (s?.defect === "storage" && !s.storageEntry)) {
        window.history.replaceState({ ...window.history.state, defect: "hub" }, "");
        setView({ kind: "hub" });
        return;
      }
      const nextWorkView = workViewFromHistory(s);
      if (nextWorkView) {
        setView(nextWorkView);
        if (nextWorkView.kind === "work-choice") window.history.replaceState({ ...window.history.state, defect: "work-choice", action: nextWorkView.action, source: nextWorkView.source }, "");
      } else if (!s?.defect || s.defect === "hub") {
        setView({ kind: "hub" });
      } else if (s.defect === "storage") {
        setView({ kind: "storage" });
      } else if (s.defect === "list") {
        setView({ kind: "list" });
      } else if (s.defect === "statistics") {
        setView({ kind: "statistics" });
      } else if (s.defect === "process" && s.restoreOnly) {
        const session = restoreSessionRef.current;
        if (session && s.recordId === session.location.record_id && s.storageEntry === session.entry) {
          setView({ kind: "process", locations: [session.location], batch: false, restoreOnly: true });
        } else {
          window.history.replaceState({ ...window.history.state, defect: "hub" }, "");
          setView({ kind: "hub" });
        }
      } else {
        setView({ kind: "list" });
      }
    }

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []); // mount only

  function handleHubSelect(id: DefectHubCardId) {
    if (id === "work") {
      window.history.pushState({ ...window.history.state, defect: "work-choice", action: null, source: null }, "");
      setView({ kind: "work-choice", action: null, source: null });
    } else if (id === "list") {
      window.history.pushState({ ...window.history.state, defect: "list" }, "");
      setView({ kind: "list" });
    } else if (id === "storage") {
      window.history.pushState({ ...window.history.state, defect: "storage", storageEntry: makeClientRequestId() }, "");
      setView({ kind: "storage" });
    } else {
      window.history.pushState({ ...window.history.state, defect: "statistics" }, "");
      setView({ kind: "statistics" });
    }
  }

  function selectWork(action: DefectWorkAction): void {
    const source = view.kind === "work-choice" && view.action === action ? view.source : null;
    window.history.replaceState({ ...window.history.state, defect: "work-choice", action, source }, "");
    setView({ kind: "work-choice", action, source });
  }

  function openCart(action: DefectWorkAction, source: DefectSourceKind): void {
    const mode = action === "add" ? "add" : "scrap";
    window.history.replaceState({ ...window.history.state, defect: "work-choice", action, source }, "");
    window.history.pushState({ ...window.history.state, defect: "cart", mode, directAction: action === "rework" ? "rework" : "scrap", source, step: 2 }, "");
    setView({ kind: "cart", mode, action, source });
  }

  function handleProcessed(message: string, returnToStorage = false): void {
    const state = window.history.state as WorkHistoryState;
    const entry = returnToStorage && state?.defect === "process" && state.restoreOnly
      && state.storageEntry === restoreSessionRef.current?.entry ? state.storageEntry : undefined;
    restoreSessionRef.current = null;
    // 완료한 폼을 Forward로 다시 열 수 없도록 먼저 무효화한다.
    window.history.replaceState({ ...window.history.state, defect: "hub" }, "");
    setView(entry ? { kind: "storage" } : { kind: "hub" });
    setReloadNonce((n) => n + 1);
    onStatusChange?.(message);
    if (entry) {
      completedStorageEntryRef.current = entry;
      window.history.back();
    }
  }

  function handleProcessRow(loc: DefectLocation) {
    window.history.pushState({ ...window.history.state, defect: "process", restoreOnly: false }, "");
    setView({ kind: "process", locations: [loc], batch: false });
  }

  function handleBatchProcess(selectedLocations: DefectLocation[]) {
    if (selectedLocations.length === 0) return;
    window.history.pushState({ ...window.history.state, defect: "process", restoreOnly: false }, "");
    setView({ kind: "process", locations: selectedLocations, batch: true });
  }

  function handleMemoUpdated(recordId: string, memo: string) {
    setLocations((current) => current.map((location) =>
      location.record_id === recordId ? { ...location, reason_memo: memo } : location,
    ));
  }

  const isFullWidthWork = view.kind !== "list" && view.kind !== "hub" && view.kind !== "storage";

  if (view.kind === "storage") {
    return <div className="animate-desktop-navigation-enter flex min-h-0 min-w-0 flex-1 overflow-y-auto rounded-[28px] border p-4" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}><DefectStorageView locations={locations} items={items} productModels={productModels} currentEmployee={employee} loading={loading} loadError={error ?? refreshError} onRetry={() => setReloadNonce((value) => value + 1)} onBack={handleStorageBack} onUpdated={(recordId, managementCategory) => setLocations((current) => current.map((location) => location.record_id === recordId ? { ...location, management_category: managementCategory } : location))} onMemoUpdated={handleMemoUpdated} onRestore={handleRestoreRow} /></div>;
  }

  /** 직접 진입에는 확인된 이전 허브가 없으므로 현재 기록을 허브로 바꾼다. */
  function handleStorageBack(): void {
    if (window.history.state?.storageEntry) window.history.back();
    else {
      window.history.replaceState({ ...window.history.state, defect: "hub" }, "");
      setView({ kind: "hub" });
    }
  }

  function handleRestoreRow(loc: DefectLocation): void {
    const entry = window.history.state?.storageEntry as string | undefined;
    restoreSessionRef.current = { entry, location: loc };
    window.history.pushState({ ...window.history.state, defect: "process", restoreOnly: true, recordId: loc.record_id }, "");
    setView({ kind: "process", locations: [loc], batch: false, restoreOnly: true });
  }

  if (view.kind === "statistics") {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 pl-0 lg:pr-4">
        <div className="relative min-h-0 min-w-0 flex-1">
          <div
            role="region"
            aria-label="불량 통계 전체 스크롤 영역"
            tabIndex={0}
            data-keep-scroll
            className="absolute inset-y-0 left-0 right-0 overflow-y-auto lg:-right-2.5 lg:[scrollbar-gutter:stable]"
          >
            <div
              className="animate-desktop-navigation-enter min-h-full min-w-full p-[17px]"
              style={{ background: LEGACY_COLORS.s1 }}
            >
              <DefectStatisticsView
                departmentOptions={departmentOptions}
                modelOptions={modelOptions}
                currentDepartment={operator.department}
                onBack={() => window.history.back()}
              />
            </div>
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between">
            <div className="flex justify-between">
              <span className="h-7 w-7" style={{ background: "radial-gradient(circle at 100% 100%, transparent 0 27px, var(--c-bg) 28px)" }} />
              <span className="h-7 w-7" style={{ background: "radial-gradient(circle at 0 100%, transparent 0 27px, var(--c-bg) 28px)" }} />
            </div>
            <div className="flex justify-between">
              <span className="h-7 w-7" style={{ background: "radial-gradient(circle at 100% 0, transparent 0 27px, var(--c-bg) 28px)" }} />
              <span className="h-7 w-7" style={{ background: "radial-gradient(circle at 0 0, transparent 0 27px, var(--c-bg) 28px)" }} />
            </div>
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-20 rounded-[28px] border"
            style={{ borderColor: LEGACY_COLORS.border }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 min-w-0 pl-0 lg:pr-4">
      <div
        className="scrollbar-hide flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-[28px] border"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}
      >
        {view.kind === "hub" && (
          <div key="hub" className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4">
            <DefectHubEntry onSelect={handleHubSelect} />
          </div>
        )}

        {isFullWidthWork && (
          <div
            key={view.kind}
            className="animate-desktop-navigation-enter flex min-h-0 min-w-0 flex-1 flex-col px-4 py-4"
          >
            {view.kind === "cart" && (
              <DefectCartFlow
                mode={view.mode}
                initialAction={view.action === "rework" ? "rework" : "scrap"}
                initialSource={view.source}
                items={items}
                productModels={productModels}
                currentEmployee={employee}
                onCancel={() => window.history.back()}
                onDone={(directAction) =>
                  handleProcessed(
                    view.mode === "add"
                      ? "새 불량 격리 완료"
                      : directAction === "rework"
                        ? "즉시 재작업 완료"
                        : "즉시 폐기 완료",
                  )
                }
              />
            )}
            {view.kind === "work-choice" && (
              <DefectWorkChoice action={view.action} source={view.source} onActionChange={selectWork} onProceed={openCart} onCancel={() => window.history.back()} />
            )}
            {view.kind === "process" && (
              <DefectProcessPanel
                location={view.locations[0]}
                locations={view.locations}
                batchMode={view.batch}
                restoreOnly={view.restoreOnly}
                currentEmployee={employee}
                onCancel={() => window.history.back()}
                onDone={() => handleProcessed(view.restoreOnly ? "정상 복귀 완료" : "불량 처리 완료", view.restoreOnly)}
                onInvalidated={(message) => {
                  window.history.replaceState({ ...window.history.state, defect: "list" }, "");
                  setView({ kind: "list" });
                  setReloadNonce((value) => value + 1);
                  onStatusChange?.(`${message} 선택을 해제하고 목록을 갱신합니다.`);
                }}
              />
            )}
          </div>
        )}

        {view.kind === "list" && (
          <div key="list" className="animate-desktop-navigation-enter flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 pb-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="standard-hover flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-sm font-bold transition-colors"
                style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2 }}
              >
                <ArrowLeft className="h-4 w-4" />
                작업 선택
              </button>
              <h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>
                격리 목록
              </h2>
            </div>

            <DefectKpiCards
              kpi={kpi}
              scopeLabel={scopeLabel}
              activeFilter={kpiFilter}
              onCardClick={(kind) => setKpiFilter((prev) => (prev === kind ? null : kind))}
            />

            <DefectFilterBar
              scope={scope}
              actorScope={actorScope}
              sort={sort}
              filterLocked={filterLocked}
              onScopeChange={(next) => {
                setScope(next);
                setKpiFilter(null);
              }}
              onActorScopeChange={(next) => {
                setActorScope(next);
                setKpiFilter(null);
              }}
              onSortChange={setSort}
              onFilterLockedChange={setFilterLocked}
              currentDept={operator.department}
              departments={departmentOptions}
              selectedDepartments={selectedDepartments}
              onDepartmentsChange={(values) => {
                setScope("all");
                setSelectedDepartments(values);
                setKpiFilter(null);
              }}
              models={modelOptions}
              selectedModels={selectedModels}
              onModelsChange={(values) => {
                setSelectedModels(values);
                setKpiFilter(null);
              }}
              selectedProcessSteps={selectedProcessSteps}
              onProcessStepsChange={(values) => {
                setSelectedProcessSteps(values);
                setKpiFilter(null);
              }}
              onResetCategoryFilters={() => {
                setScope("all");
                resetCategoryFilters();
                setKpiFilter(null);
              }}
            />

            <DefectSearchInput value={search} onChange={setSearch} />

            {refreshError && (
              <ReadFailure
                refresh
                message={refreshError}
                onRetry={() => setReloadNonce((value) => value + 1)}
              />
            )}

            {loading ? (
              <ReadLoading label="불량 데이터 로딩 중..." />
            ) : error ? (
              <ReadFailure message={error} onRetry={() => setReloadNonce((value) => value + 1)} />
            ) : (
              <>
                <DefectDepartmentList
                  emptyContent={<ReadEmpty hasSearch={!!search.trim()} hasFilters={locations.length > 0}
                    illustrated
                    aboveFold
                    className="min-h-[260px] flex-1"
                    title={!search.trim() && locations.length === 0 ? "격리된 불량 재고가 없습니다." : undefined}
                    onReset={() => { setSearch(""); setScope("all"); resetCategoryFilters(); setKpiFilter(null); }} />}
                  locations={filteredLocations}
                  currentEmployee={employee}
                  onMemoUpdated={handleMemoUpdated}
                  onProcess={handleProcessRow}
                  onBatchProcess={handleBatchProcess}
                  priorityDept={operator.department}
                  searchActive={search.trim().length > 0}
                  onMoveToStorage={setManagementLocation}
                />
                {managementLocation && <ManagementCategoryModal location={managementLocation} currentEmployee={employee} onClose={() => setManagementLocation(null)} onUpdated={(managementCategory) => { setLocations((current) => current.map((location) => location.record_id === managementLocation.record_id ? { ...location, management_category: managementCategory } : location)); setManagementLocation(null); }} />}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
