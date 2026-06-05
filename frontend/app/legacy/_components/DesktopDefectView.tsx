"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { defectsApi } from "@/lib/api/defects";
import type { DefectKpi, DefectLocation } from "@/lib/api/types/defects";
import { canEnterIO } from "./_warehouse_steps";
import { WarehouseAccessDenied } from "./_warehouse_sections/WarehouseAccessDenied";
import { useWarehouseData } from "./_warehouse_hooks/useWarehouseData";
import type { Operator } from "./login/useCurrentOperator";
import { DefectKpiCards, type DefectKpiKind } from "./_defect_hub/DefectKpiCards";
import { DefectHubEntry } from "./_defect_hub/DefectHubEntry";
import type { DefectHubCardId } from "./_defect_hub/defectHubCards";
import { DefectFilterBar, type DefectScope, type DefectSort } from "./_defect_hub/DefectFilterBar";
import { DefectDepartmentList } from "./_defect_hub/DefectDepartmentList";
import { PaPfDefectWizardPanel } from "./_defect_hub/PaPfDefectWizardPanel";
import { DefectCartFlow, type DefectCartMode } from "./_defect_hub/DefectCartFlow";
import { DefectBatchConfirm, type BatchAction } from "./_defect_hub/DefectBatchConfirm";
import { InlineErrorNote } from "./_defect_hub/InlineErrorNote";
import { tint } from "@/lib/mes/colorUtils";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const PRODUCTION_LINES = new Set(["튜브", "고압", "진공", "튜닝", "조립", "출하"]);

const DEFAULT_KPI: DefectKpi = {
  quarantined: 0,
  over_one_year: 0,
  pending_approval: 0,
  processed_today: 0,
};

const locKey = (loc: DefectLocation) => `${loc.item_id}__${loc.department}`;

/** 화면 모드 — hub가 진입점. list 외에는 좌측 목록을 덮는 전폭 작업 화면. */
type ViewMode =
  | { kind: "hub" }
  | { kind: "list" }
  | { kind: "cart"; mode: DefectCartMode }
  | { kind: "batch"; action: BatchAction; locations: DefectLocation[] }
  | { kind: "disassemble"; location: DefectLocation };

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
  if (operator && !canEnterIO(operator)) {
    return <WarehouseAccessDenied department={operator.department ?? ""} />;
  }
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

  const [kpi, setKpi] = useState<DefectKpi>(DEFAULT_KPI);
  const [locations, setLocations] = useState<DefectLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initialScope = (): DefectScope => {
    if (defectDeptFilter) return "my";
    return PRODUCTION_LINES.has(operator.department) ? "my" : "all";
  };

  const [scope, setScope] = useState<DefectScope>(initialScope);
  const [sort, setSort] = useState<DefectSort>("oldest");
  const [kpiFilter, setKpiFilter] = useState<DefectKpiKind | null>(null);
  const [view, setView] = useState<ViewMode>({ kind: "hub" });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [kpiData, locData] = await Promise.all([
          defectsApi.getDefectKpi(),
          defectsApi.listDefects(),
        ]);
        if (!cancelled) {
          setKpi(kpiData);
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

  const filteredLocations = useMemo(() => {
    let result = locations;

    if (scope === "my") {
      const targetDept = defectDeptFilter ?? operator.department;
      result = result.filter((loc) => loc.department === targetDept);
    } else if (scope === "production") {
      result = result.filter((loc) => PRODUCTION_LINES.has(loc.department));
    }

    if (kpiFilter === "over_one_year") {
      result = result.filter(
        (loc) =>
          loc.defective_at != null &&
          Date.now() - new Date(loc.defective_at).getTime() > ONE_YEAR_MS,
      );
    }

    result = [...result].sort((a, b) => {
      const ta = a.defective_at ? new Date(a.defective_at).getTime() : 0;
      const tb = b.defective_at ? new Date(b.defective_at).getTime() : 0;
      return sort === "oldest" ? ta - tb : tb - ta;
    });

    return result;
  }, [locations, scope, sort, kpiFilter, defectDeptFilter, operator.department]);

  // 목록이 갱신되면(처리 후) 더 이상 존재하지 않는 선택 키 정리.
  useEffect(() => {
    const valid = new Set(locations.map(locKey));
    setSelectedKeys((prev) => {
      const next = new Set(Array.from(prev).filter((k) => valid.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [locations]);

  const employee = {
    employee_id: operator.employee_id,
    name: operator.name,
    department: operator.department,
  };

  // 브라우저 뒤로가기 → 현재 뷰에서 한 단계 뒤로 (hub이면 무시 — 탭 URL 네비에 넘김).
  useEffect(() => {
    const onPop = () => {
      setView((cur) => {
        if (cur.kind === "list" || cur.kind === "cart") return { kind: "hub" };
        if (cur.kind === "batch" || cur.kind === "disassemble") return { kind: "list" };
        return cur; // hub에서 popstate → 아무것도 안 함(브라우저 기본 동작)
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function backToHub() {
    setView({ kind: "hub" });
  }

  function handleHubSelect(id: DefectHubCardId) {
    if (id === "quarantine") {
      window.history.pushState({ defect: "cart" }, "");
      setView({ kind: "cart", mode: "add" });
    } else if (id === "scrap") {
      window.history.pushState({ defect: "cart" }, "");
      setView({ kind: "cart", mode: "scrap" });
    } else {
      window.history.pushState({ defect: "list" }, "");
      setView({ kind: "list" });
    }
  }

  function handleProcessed(message: string) {
    setView({ kind: "hub" });
    setSelectedKeys(new Set());
    setReloadNonce((n) => n + 1);
    onStatusChange?.(message);
  }

  function toggleSelect(loc: DefectLocation) {
    const key = locKey(loc);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const selectedLocations = useMemo(
    () => filteredLocations.filter((loc) => selectedKeys.has(locKey(loc))),
    [filteredLocations, selectedKeys],
  );

  function startBatch(action: BatchAction) {
    if (selectedLocations.length === 0) return;
    window.history.pushState({ defect: "batch" }, "");
    setView({ kind: "batch", action, locations: selectedLocations });
  }

  function handleProcessRow(loc: DefectLocation) {
    if (loc.has_bom) {
      window.history.pushState({ defect: "disassemble" }, "");
      setView({ kind: "disassemble", location: loc });
    } else {
      // 단순 R 항목 단건 처리도 일괄 흐름(1건)으로 통일.
      window.history.pushState({ defect: "batch" }, "");
      setView({ kind: "batch", action: "unquarantine", locations: [loc] });
    }
  }

  const isFullWidthWork = view.kind !== "list" && view.kind !== "hub";

  // 헤더 — hub/list 공통
  const header = (
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>
        불량 처리
      </h2>
      <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
        {operator.name} · {operator.department}
      </span>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 min-w-0 pl-0 lg:pr-4">
      <div
        className="scrollbar-hide flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-[28px] border"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.bg }}
      >
        {view.kind === "hub" && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4">
            {header}
            <DefectHubEntry onSelect={handleHubSelect} />
          </div>
        )}

        {isFullWidthWork && (
          <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
            {view.kind === "cart" && (
              <DefectCartFlow
                mode={view.mode}
                items={items}
                productModels={productModels}
                currentEmployee={employee}
                onCancel={backToHub}
                onDone={() =>
                  handleProcessed(
                    view.mode === "add" ? "새 불량 격리 완료" : "즉시 폐기 완료",
                  )
                }
              />
            )}
            {view.kind === "batch" && (
              <DefectBatchConfirm
                action={view.action}
                locations={view.locations}
                currentEmployee={employee}
                onCancel={() => setView({ kind: "list" })}
                onDone={() => handleProcessed("불량 처리 완료")}
              />
            )}
            {view.kind === "disassemble" && (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setView({ kind: "list" })}
                  className="self-start rounded-[10px] border px-3 py-1.5 text-sm font-bold transition-colors hover:brightness-110"
                  style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2 }}
                >
                  ← 목록으로
                </button>
                <div className="min-h-0 flex-1">
                  <PaPfDefectWizardPanel
                    location={view.location}
                    currentEmployee={employee}
                    onSubmitted={() => handleProcessed("불량 분해/처리 완료")}
                    onClose={() => setView({ kind: "list" })}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {view.kind === "list" && (
          <div className="flex flex-col gap-4 px-4 py-4 pb-6">
            {header}

            <button
              type="button"
              onClick={() => setView({ kind: "hub" })}
              className="self-start flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-sm font-bold transition-colors hover:brightness-110"
              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2 }}
            >
              <ArrowLeft className="h-4 w-4" />
              작업 선택
            </button>

            <DefectKpiCards
              kpi={kpi}
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

            {/* 일괄 액션 바 — 선택 ≥1 일 때 */}
            {selectedLocations.length > 0 && (
              <div
                className="flex flex-wrap items-center gap-2 rounded-[12px] border px-4 py-2.5"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              >
                <span className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                  {selectedLocations.length}건 선택
                </span>
                <button
                  type="button"
                  onClick={() => startBatch("unquarantine")}
                  className="rounded-[10px] border px-3 py-1.5 text-xs font-black transition-colors hover:brightness-110"
                  style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text, background: LEGACY_COLORS.s1 }}
                >
                  정상 복귀
                </button>
                <button
                  type="button"
                  onClick={() => startBatch("scrap")}
                  className="rounded-[10px] px-3 py-1.5 text-xs font-black text-white transition-colors hover:brightness-110"
                  style={{ background: LEGACY_COLORS.red }}
                >
                  폐기
                </button>
                <button
                  type="button"
                  onClick={() => startBatch("return")}
                  className="rounded-[10px] px-3 py-1.5 text-xs font-black text-white transition-colors hover:brightness-110"
                  style={{ background: LEGACY_COLORS.red }}
                >
                  반품
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedKeys(new Set())}
                  className="ml-auto text-xs font-bold hover:underline"
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  선택 해제
                </button>
              </div>
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
                onProcess={handleProcessRow}
                selectable
                selectedKeys={selectedKeys}
                onToggleSelect={toggleSelect}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
