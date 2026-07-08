"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { defectsApi } from "@/lib/api/defects";
import type { DefectKpi, DefectLocation } from "@/lib/api/types/defects";
import { isWarehouseStaff, isDepartmentApprover } from "./_warehouse_steps";
import { useWarehouseData } from "./_warehouse_hooks/useWarehouseData";
import type { Operator } from "./login/useCurrentOperator";
import { DefectKpiCards, type DefectKpiKind } from "./_defect_hub/DefectKpiCards";
import { DefectHubEntry } from "./_defect_hub/DefectHubEntry";
import type { DefectHubCardId } from "./_defect_hub/defectHubCards";
import { DefectFilterBar, type DefectScope, type DefectSort } from "./_defect_hub/DefectFilterBar";
import { DefectDepartmentList } from "./_defect_hub/DefectDepartmentList";
import { DefectCartFlow, type DefectCartMode } from "./_defect_hub/DefectCartFlow";
import { DefectProcessPanel } from "./_defect_hub/DefectProcessPanel";
import { InlineErrorNote } from "./_defect_hub/InlineErrorNote";


const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const PRODUCTION_LINES = new Set(["튜브", "고압", "진공", "튜닝", "조립", "출하"]);

/** 역할 기반 기본 출처 — 창고 전담자만 "warehouse", 나머지 "production". */
function defaultSourceForOp(op: Operator): "warehouse" | "production" {
  return isWarehouseStaff(op) && !isDepartmentApprover(op) ? "warehouse" : "production";
}

/** 화면 모드 — hub가 진입점. list 외에는 좌측 목록을 덮는 전폭 작업 화면. */
type ViewMode =
  | { kind: "hub" }
  | { kind: "list" }
  | { kind: "cart"; mode: DefectCartMode }
  | { kind: "process"; location: DefectLocation };

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
  const noop = useMemo(() => () => {}, []);
  // 피커용 품목/모델 — 입출고와 동일하게 자체 로드(shell 은 넘겨주지 않음).
  const { items, productModels } = useWarehouseData({
    globalSearch: "",
    onStatusChange: onStatusChange ?? noop,
  });

  const [locations, setLocations] = useState<DefectLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initialScope = (): DefectScope => {
    if (defectDeptFilter) return "my";
    // 창고 담당자는 "창고" 부서 그룹을 보기 위해 전체 기본
    if (isWarehouseStaff(operator)) return "all";
    return PRODUCTION_LINES.has(operator.department) ? "my" : "all";
  };

  const [scope, setScope] = useState<DefectScope>(initialScope);
  const [sort, setSort] = useState<DefectSort>("newest");
  const [kpiFilter, setKpiFilter] = useState<DefectKpiKind | null>(null);
  const [view, setView] = useState<ViewMode>({ kind: "hub" });
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const locData = await defectsApi.listDefects();
        if (!cancelled) {
          setLocations(locData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "불량 데이터 로드에 실패했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  // 부서/scope 범위만 적용 — KPI 집계와 목록이 공유하는 모집단
  const scopedLocations = useMemo(() => {
    if (scope === "my") {
      const targetDept = defectDeptFilter ?? operator.department;
      return locations.filter((loc) => loc.department === targetDept);
    }
    if (scope === "production") {
      return locations.filter((loc) => PRODUCTION_LINES.has(loc.department));
    }
    return locations;
  }, [locations, scope, defectDeptFilter, operator.department]);

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

    return [...result].sort((a, b) => {
      const ta = a.defective_at ? new Date(a.defective_at).getTime() : 0;
      const tb = b.defective_at ? new Date(b.defective_at).getTime() : 0;
      return sort === "oldest" ? ta - tb : tb - ta;
    });
  }, [scopedLocations, sort, kpiFilter]);

  // KPI 집계 범위 라벨 — 숫자가 어느 범위인지 카드 부제로 노출
  const scopeLabel =
    scope === "my"
      ? `${defectDeptFilter ?? operator.department} 부서`
      : scope === "production"
      ? "생산 전체"
      : "전체 부서";

  const employee = {
    employee_id: operator.employee_id,
    name: operator.name,
    department: operator.department,
  };

  // history.state 기반 뒤로/앞으로 동기화.
  // 마운트 시 현재 엔트리에 defect state가 있으면 뷰 복원 (다른 탭에서 뒤로가기로 복귀하는 경우).
  // defect state가 없으면 hub로 replaceState — 항상 스택 바닥이 hub.
  useEffect(() => {
    const cur = window.history.state as { defect?: string; mode?: string } | null;
    if (cur?.defect === "cart" && (cur.mode === "add" || cur.mode === "scrap")) {
      setView({ kind: "cart", mode: cur.mode });
    } else if (cur?.defect === "list") {
      setView({ kind: "list" });
    } else if (cur?.defect === "process") {
      // location 데이터 없이 복원 불가 — 목록으로
      setView({ kind: "list" });
      window.history.replaceState({ defect: "list" }, "");
    } else {
      window.history.replaceState({ defect: "hub" }, "");
    }

    function onPop(e: PopStateEvent) {
      const s = e.state as { defect?: string; mode?: string } | null;
      if (!s?.defect || s.defect === "hub") {
        setView({ kind: "hub" });
      } else if (s.defect === "list") {
        setView({ kind: "list" });
      } else if (s.defect === "cart" && (s.mode === "add" || s.mode === "scrap")) {
        setView({ kind: "cart", mode: s.mode });
      } else {
        setView({ kind: "list" });
      }
    }

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []); // mount only

  function handleHubSelect(id: DefectHubCardId) {
    if (id === "quarantine") {
      window.history.pushState({ defect: "cart", mode: "add" }, "");
      setView({ kind: "cart", mode: "add" });
    } else if (id === "scrap") {
      window.history.pushState({ defect: "cart", mode: "scrap" }, "");
      setView({ kind: "cart", mode: "scrap" });
    } else {
      window.history.pushState({ defect: "list" }, "");
      setView({ kind: "list" });
    }
  }

  function handleProcessed(message: string) {
    setView({ kind: "hub" });
    setReloadNonce((n) => n + 1);
    onStatusChange?.(message);
  }

  function handleProcessRow(loc: DefectLocation) {
    window.history.pushState({ defect: "process" }, "");
    setView({ kind: "process", location: loc });
  }

  const isFullWidthWork = view.kind !== "list" && view.kind !== "hub";

  return (
    <div className="flex min-h-0 flex-1 min-w-0 pl-0 lg:pr-4">
      <div
        className="scrollbar-hide flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-[28px] border"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}
      >
        {view.kind === "hub" && (
          <div key="hub" className="animate-view-fade flex min-h-0 flex-1 flex-col gap-4 px-4 py-4">
            <DefectHubEntry onSelect={handleHubSelect} />
          </div>
        )}

        {isFullWidthWork && (
          <div key={view.kind} className="animate-view-fade flex min-h-0 flex-1 flex-col px-4 py-4">
            {view.kind === "cart" && (
              <DefectCartFlow
                mode={view.mode}
                items={items}
                productModels={productModels}
                currentEmployee={employee}
                defaultSource={defaultSourceForOp(operator)}
                onCancel={() => window.history.back()}
                onDone={() =>
                  handleProcessed(
                    view.mode === "add" ? "새 불량 격리 완료" : "즉시 폐기 완료",
                  )
                }
              />
            )}
            {view.kind === "process" && (
              <DefectProcessPanel
                location={view.location}
                currentEmployee={employee}
                onCancel={() => window.history.back()}
                onDone={() => handleProcessed("불량 처리 완료")}
              />
            )}
          </div>
        )}

        {view.kind === "list" && (
          <div key="list" className="animate-view-fade flex flex-col gap-4 px-4 py-4 pb-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-sm font-bold transition-colors hover:brightness-110"
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
              sort={sort}
              onScopeChange={(next) => {
                setScope(next);
                setKpiFilter(null);
              }}
              onSortChange={setSort}
              currentDept={operator.department}
            />

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
                onProcess={handleProcessRow}
                priorityDept={operator.department}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
