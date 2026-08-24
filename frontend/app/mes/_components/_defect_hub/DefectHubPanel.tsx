"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { defectsApi } from "@/lib/api/defects";
import type { DefectKpi, DefectLocation } from "@/lib/api/types/defects";
/** DefectHubPanel 이 필요한 최소 직원 필드 */
export interface DefectHubEmployee {
  employee_id: string;
  name: string;
  department: string;
}
import { DEFECT_HUB_CARDS, type DefectHubCardId } from "./defectHubCards";
import { DefectKpiCards, type DefectKpiKind } from "./DefectKpiCards";
import { DefectFilterBar, type DefectActorScope, type DefectScope, type DefectSort } from "./DefectFilterBar";
import { DefectDepartmentList } from "./DefectDepartmentList";
import { MobileDefectProcessPanel } from "../mobile/screens/MobileDefectProcessPanel";
import { MobileDefectCartFlow } from "../mobile/screens/MobileDefectCartFlow";
import type { DefectCartMode } from "./DefectCartFlow";
import type { Item, ProductModel } from "../_warehouse_v2/types";
import { InlineErrorNote } from "./InlineErrorNote";
import { tint } from "@/lib/mes/colorUtils";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import { LoadFailureCard } from "../common/LoadFailureCard";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const PRODUCTION_LINES = new Set(["튜브", "고압", "진공", "튜닝", "조립", "출하"]);

interface Props {
  defectDeptFilter?: string | null;
  currentEmployee: DefectHubEmployee;
  // 격리 추가·바로 폐기(다품목 카트) 흐름용 — MobileDefectScreen 이 주입.
  items?: Item[];
  productModels?: ProductModel[];
  defaultSource?: "warehouse" | "production";
}

export function DefectHubPanel({
  defectDeptFilter,
  currentEmployee,
  items = [],
  productModels = [],
  defaultSource,
}: Props) {
  const realtimeRevision = useRealtimeRevision();
  const [locations, setLocations] = useState<DefectLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const requestGenerationRef = useRef(0);

  // defectDeptFilter prop 이 있으면 내 부서 필터로 초기 설정,
  // 없으면 생산 라인이면 "my", 아니면 "all"
  const initialScope = (): DefectScope => {
    if (defectDeptFilter) return "my";
    return PRODUCTION_LINES.has(currentEmployee.department) ? "my" : "all";
  };

  const [view, setView] = useState<"hub" | "list" | "process" | "cart">("hub");
  const [scope, setScope] = useState<DefectScope>(initialScope);
  const [actorScope, setActorScope] = useState<DefectActorScope>("all");
  const [sort, setSort] = useState<DefectSort>("oldest");
  const [kpiFilter, setKpiFilter] = useState<DefectKpiKind | null>(null);
  const [processingLocation, setProcessingLocation] = useState<DefectLocation | null>(null);
  const [cartMode, setCartMode] = useState<DefectCartMode>("add");
  const [reloadNonce, setReloadNonce] = useState(0);

  const activeProcessingLocation = useMemo(() => {
    if (!processingLocation) return null;
    return locations.find(
      (location) =>
        location.record_id === processingLocation.record_id &&
        Number(location.available_quantity) > 0,
    ) ?? null;
  }, [locations, processingLocation]);

  useEffect(() => {
    if (view !== "process" || !processingLocation || loading || activeProcessingLocation) return;
    setProcessingLocation(null);
    setView("list");
  }, [view, processingLocation, loading, activeProcessingLocation]);

  // 마운트 시 목록 로드 (처리 완료 후 reloadNonce 증가 시 재로드)
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

  // 부서 범위와 격리 처리자 범위를 먼저 합성 — KPI 집계와 목록이 공유하는 모집단
  const scopedLocations = useMemo(() => {
    let result = locations;

    // 부서 범위 필터
    if (scope === "my") {
      const targetDept = defectDeptFilter ?? currentEmployee.department;
      result = result.filter((loc) => loc.department === targetDept);
    } else if (scope === "production") {
      result = result.filter((loc) => PRODUCTION_LINES.has(loc.department));
    }
    // scope === "all" → 필터 없음

    if (actorScope === "mine") {
      result = result.filter(
        (loc) => loc.quarantined_by_employee_id === currentEmployee.employee_id,
      );
    }

    return result;
  }, [locations, scope, actorScope, defectDeptFilter, currentEmployee.department, currentEmployee.employee_id]);

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

  const filteredLocations = useMemo(() => {
    let result = scopedLocations;

    // KPI 카드 클릭 필터. defective_at NULL 인 행은 비교 불가 → 제외(보수적).
    if (kpiFilter === "over_one_year") {
      result = result.filter(
        (loc) => loc.defective_at != null && Date.now() - new Date(loc.defective_at).getTime() > ONE_YEAR_MS,
      );
    }
    // "quarantined" / "pending" / "today" 는 목록 레벨 필터 불가 (KPI 카운트만 표시)

    // 정렬 — NULL defective_at 은 0 으로 처리(가장 오래된 쪽으로).
    result = [...result].sort((a, b) => {
      const ta = a.defective_at ? new Date(a.defective_at).getTime() : 0;
      const tb = b.defective_at ? new Date(b.defective_at).getTime() : 0;
      return sort === "oldest" ? ta - tb : tb - ta;
    });

    return result;
  }, [scopedLocations, sort, kpiFilter]);

  const departmentScopeLabel =
    scope === "my"
      ? `${defectDeptFilter ?? currentEmployee.department} 부서`
      : scope === "production"
      ? "생산 전체"
      : "전체 부서";
  const scopeLabel = `${departmentScopeLabel} · ${actorScope === "mine" ? "내가 격리" : "격리자 전체"}`;

  // [처리] 버튼 클릭 → 데스크톱과 동일한 통합 처리 패널(전폭 view)로 전환.
  function handleProcess(location: DefectLocation) {
    setProcessingLocation(location);
    setView("process");
  }

  function handleProcessDone() {
    setProcessingLocation(null);
    setReloadNonce((n) => n + 1);
    setView("list"); // 처리 후 갱신된 목록을 바로 보여줌
  }

  function handleProcessCancel() {
    setProcessingLocation(null);
    setView("list");
  }

  // 격리 추가·바로 폐기(다품목 카트) 완료/취소 → 허브 복귀.
  function handleCartDone() {
    setReloadNonce((n) => n + 1);
    setView("hub");
  }
  function handleCartCancel() {
    setView("hub");
  }

  // 브라우저 뒤로가기 → cart/process는 한 단계 위로, list면 hub로 (hub에서는 무시).
  useEffect(() => {
    const onPop = () => {
      setView((cur) =>
        cur === "cart" ? "hub" : cur === "process" ? "list" : cur === "list" ? "hub" : cur,
      );
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function handleHubSelect(id: DefectHubCardId) {
    if (id === "quarantine") {
      setCartMode("add");
      setView("cart");
    } else if (id === "scrap") {
      setCartMode("scrap");
      setView("cart");
    } else {
      window.history.pushState({ defect: "list" }, "");
      setView("list");
    }
  }

  function handleKpiCardClick(kind: DefectKpiKind) {
    setKpiFilter((prev) => (prev === kind ? null : kind));
  }

  function handleMemoUpdated(recordId: string, memo: string) {
    setLocations((current) => current.map((location) =>
      location.record_id === recordId ? { ...location, reason_memo: memo } : location,
    ));
  }

  // 처리 화면 — 데스크톱 DefectProcessPanel 과 동일 동작의 모바일 통합 패널(전폭).
  if (view === "process" && activeProcessingLocation) {
    return (
      <MobileDefectProcessPanel
        location={activeProcessingLocation}
        currentEmployee={currentEmployee}
        onDone={handleProcessDone}
        onCancel={handleProcessCancel}
      />
    );
  }

  // 격리 추가 / 바로 폐기 — 데스크톱 DefectCartFlow 와 동일 흐름의 모바일 다품목 카트.
  if (view === "cart") {
    return (
      <MobileDefectCartFlow
        mode={cartMode}
        items={items}
        productModels={productModels}
        currentEmployee={currentEmployee}
        defaultSource={defaultSource}
        onDone={handleCartDone}
        onCancel={handleCartCancel}
      />
    );
  }

  // KPI + 필터 + 목록 — 허브 첫 화면과 (처리 후 복귀하는) 목록 화면이 공유한다.
  const listSection = (
    <>
      <DefectKpiCards
        kpi={kpi}
        scopeLabel={scopeLabel}
        activeFilter={kpiFilter}
        onCardClick={handleKpiCardClick}
      />

      <DefectFilterBar
        scope={scope}
        actorScope={actorScope}
        sort={sort}
        onScopeChange={(next) => {
          setScope(next);
          setKpiFilter(null);
        }}
        onActorScopeChange={(next) => {
          setActorScope(next);
          setKpiFilter(null);
        }}
        onSortChange={setSort}
        currentDept={currentEmployee.department}
      />

      {/* KPI 필터 활성 표시 */}
      {kpiFilter && (
        <div
          className="flex items-center justify-between rounded-[10px] border px-4 py-2"
          style={{ background: LEGACY_COLORS.errorBg, borderColor: tint(LEGACY_COLORS.red, 30) }}
        >
          <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.red }}>
            {kpiFilter === "over_one_year" ? "1년 이상 격리 항목만 표시 중" : `${kpiFilter} 필터 활성`}
          </span>
          <button
            type="button"
            onClick={() => setKpiFilter(null)}
            className="text-xs font-black hover:underline"
            style={{ color: LEGACY_COLORS.red }}
          >
            필터 해제
          </button>
        </div>
      )}

      {/* 목록 */}
      {refreshError && (
        <LoadFailureCard
          prefix="최신 불량 격리 목록을 동기화하지 못했습니다"
          message={refreshError}
          retryLabel="다시 동기화"
          onRetry={() => setReloadNonce((value) => value + 1)}
        />
      )}
      {loading ? (
        <div className="py-10 text-center text-sm font-bold" style={{ color: LEGACY_COLORS.muted }}>
          불량 데이터 로딩 중...
        </div>
      ) : error ? (
        <InlineErrorNote variant="block" className="!text-sm">
          {error}
        </InlineErrorNote>
      ) : (
        <DefectDepartmentList
          locations={filteredLocations}
          currentEmployee={currentEmployee}
          onMemoUpdated={handleMemoUpdated}
          onProcess={handleProcess}
        />
      )}
    </>
  );

  return (
    <div className="flex min-h-full flex-col gap-4">
      {/* 항목 7-3 — 헤더("불량 처리 허브" 제목 + 우상단 이름·부서) 제거(불필요). */}
      {view === "hub" ? (
        /* 항목 2-5 — 첫 화면은 키오스크식 카드 3장(격리·폐기·목록)만. PC(DesktopDefectView)
           처럼 "무엇을 할지 선택만" 하게 한다. KPI/필터/격리 목록은 카드 선택 후 list 화면에서만.
           (이전엔 카드 2장 + listSection 을 첫 화면에 함께 띄워 모바일이 혼잡했음.) */
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {DEFECT_HUB_CARDS.map((card) => {
            const Icon = card.icon;
            const accent = LEGACY_COLORS[card.accentKey];
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => handleHubSelect(card.id)}
                className="flex min-h-[96px] flex-1 items-center gap-5 rounded-[18px] border p-4 text-left transition-[transform] active:scale-[0.99]"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              >
                <span
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[16px]"
                  style={{ background: `color-mix(in srgb, ${accent} 20%, transparent)` }}
                >
                  <Icon
                    className="h-8 w-8"
                    style={{ color: `color-mix(in srgb, ${accent} 42%, ${LEGACY_COLORS.text})` }}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xl font-black leading-tight">{card.label}</span>
                  <span
                    className="block text-sm font-semibold"
                    style={{ color: LEGACY_COLORS.muted2 }}
                  >
                    {card.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        /* 목록 화면 — 처리 후 복귀 시. */
        <>
          <button
            type="button"
            onClick={() => setView("hub")}
            className="flex items-center gap-1 self-start rounded-[10px] border px-3 py-1.5 text-xs font-bold transition-colors hover:brightness-110"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2 }}
          >
            ← 작업 선택
          </button>
          {listSection}
        </>
      )}
    </div>
  );
}
