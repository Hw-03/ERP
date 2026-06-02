"use client";

import { useEffect, useMemo, useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { defectsApi } from "@/lib/api/defects";
import type { DefectKpi, DefectLocation } from "@/lib/api/types/defects";
import { canEnterIO } from "./_warehouse_steps";
import { WarehouseAccessDenied } from "./_warehouse_sections/WarehouseAccessDenied";
import { SlidePanel } from "./common";
import { DesktopRightPanel } from "./DesktopRightPanel";
import type { Operator } from "./login/useCurrentOperator";
import { DefectKpiCards, type DefectKpiKind } from "./_defect_hub/DefectKpiCards";
import { DefectQuickActions } from "./_defect_hub/DefectQuickActions";
import { DefectFilterBar, type DefectScope, type DefectSort } from "./_defect_hub/DefectFilterBar";
import { DefectDepartmentList } from "./_defect_hub/DefectDepartmentList";
import { RDefectActionPanel } from "./_defect_hub/RDefectActionPanel";
import { PaPfDefectWizardPanel } from "./_defect_hub/PaPfDefectWizardPanel";
import { AddQuarantineModal } from "./_defect_hub/AddQuarantineModal";
import { AddRDirectModal } from "./_defect_hub/AddRDirectModal";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const PRODUCTION_LINES = new Set(["튜브", "고압", "진공", "튜닝", "조립", "출하"]);

const DEFAULT_KPI: DefectKpi = {
  quarantined: 0,
  over_one_year: 0,
  pending_approval: 0,
  processed_today: 0,
};

interface Props {
  operator: Operator | null;
  defectDeptFilter?: string | null;
  onStatusChange?: (status: string) => void;
}

/**
 * 데스크톱 불량 탭 — 마스터-디테일.
 * 왼쪽: KPI · 퀵 액션 · 필터 · 부서별 목록 (DefectHubPanel 의 데이터/필터 로직 재사용).
 * 오른쪽: 항목 클릭 시 SlidePanel 에 처리 패널(R / PA·PF) 호스팅.
 * 권한·가시성은 입출고와 동일(canEnterIO).
 */
export function DesktopDefectView({ operator, defectDeptFilter, onStatusChange }: Props) {
  // 권한 가드 — 입출고와 동일.
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
  const [selectedLocation, setSelectedLocation] = useState<DefectLocation | null>(null);
  const [addQuarantineOpen, setAddQuarantineOpen] = useState(false);
  const [rDirectMode, setRDirectMode] = useState<"scrap" | "return" | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // 마운트 시 KPI + 목록 동시 로드 (처리 완료 후 reloadNonce 증가 시 재로드)
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

  // scope/defectDeptFilter 에 따른 목록 필터 (DefectHubPanel 과 동일)
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

  // 선택된 항목이 목록에서 사라지면(재로드 후) 패널 닫기.
  useEffect(() => {
    if (!selectedLocation) return;
    const stillExists = locations.some(
      (loc) =>
        loc.item_id === selectedLocation.item_id && loc.department === selectedLocation.department,
    );
    if (!stillExists) setSelectedLocation(null);
  }, [locations, selectedLocation]);

  function handleProcessed() {
    setSelectedLocation(null);
    setReloadNonce((n) => n + 1);
    onStatusChange?.("불량 처리 완료");
  }

  function handleAddQuarantineSubmitted() {
    setAddQuarantineOpen(false);
    setReloadNonce((n) => n + 1);
    onStatusChange?.("새 불량 격리 완료");
  }

  function handleRDirectSubmitted() {
    setRDirectMode(null);
    setReloadNonce((n) => n + 1);
    onStatusChange?.("원자재 즉시 처리 완료");
  }

  function handleKpiCardClick(kind: DefectKpiKind) {
    setKpiFilter((prev) => (prev === kind ? null : kind));
  }

  const employee = {
    employee_id: operator.employee_id,
    name: operator.name,
    department: operator.department,
  };

  const panelOpen = !!selectedLocation;

  return (
    <div className="flex min-h-0 flex-1 min-w-0 pl-0 lg:pr-4">
      {/* ── 좌측: 목록 ── */}
      <div
        className="scrollbar-hide min-h-0 min-w-0 flex-1 overflow-y-auto rounded-[28px] border"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.bg }}
      >
        <div className="flex flex-col gap-4 px-4 py-4 pb-6">
          {/* 헤더 */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>
              불량 처리
            </h2>
            <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              {operator.name} · {operator.department}
            </span>
          </div>

          {/* KPI 카드 */}
          <DefectKpiCards kpi={kpi} onCardClick={handleKpiCardClick} />

          {/* 퀵 액션 */}
          <DefectQuickActions
            onAddQuarantine={() => setAddQuarantineOpen(true)}
            onAddRReturn={() => setRDirectMode("return")}
            onAddRScrap={() => setRDirectMode("scrap")}
          />

          {/* 필터 바 */}
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

          {/* KPI 필터 활성 표시 */}
          {kpiFilter && (
            <div
              className="flex items-center justify-between rounded-[10px] border px-4 py-2"
              style={{ background: "#fef2f2", borderColor: "#fca5a5" }}
            >
              <span className="text-sm font-bold text-red-700">
                {kpiFilter === "over_one_year" ? "1년 이상 격리 항목만 표시 중" : `${kpiFilter} 필터 활성`}
              </span>
              <button
                type="button"
                onClick={() => setKpiFilter(null)}
                className="text-xs font-black text-red-600 hover:underline"
              >
                필터 해제
              </button>
            </div>
          )}

          {/* 목록 */}
          {loading ? (
            <div className="py-10 text-center text-sm font-bold" style={{ color: LEGACY_COLORS.muted }}>
              불량 데이터 로딩 중...
            </div>
          ) : error ? (
            <div
              className="rounded-[14px] border px-6 py-4 text-sm font-bold text-red-700"
              style={{ background: "#fef2f2", borderColor: "#fca5a5" }}
            >
              {error}
            </div>
          ) : (
            <DefectDepartmentList locations={filteredLocations} onProcess={setSelectedLocation} />
          )}
        </div>
      </div>

      {/* ── 우측: 처리 패널 ── */}
      <SlidePanel open={panelOpen} onClose={() => setSelectedLocation(null)} hideCloseButton>
        <DesktopRightPanel
          title="불량 처리"
          subtitle={selectedLocation ? `${selectedLocation.department} [불량]` : undefined}
          onClose={() => setSelectedLocation(null)}
        >
          {selectedLocation &&
            (selectedLocation.has_bom ? (
              <PaPfDefectWizardPanel
                location={selectedLocation}
                currentEmployee={employee}
                onSubmitted={handleProcessed}
                onClose={() => setSelectedLocation(null)}
              />
            ) : (
              <RDefectActionPanel
                location={selectedLocation}
                currentEmployee={employee}
                onSubmitted={handleProcessed}
                onClose={() => setSelectedLocation(null)}
              />
            ))}
        </DesktopRightPanel>
      </SlidePanel>

      {/* 새 격리 추가 모달 */}
      <AddQuarantineModal
        open={addQuarantineOpen}
        onClose={() => setAddQuarantineOpen(false)}
        currentEmployee={employee}
        onSubmitted={handleAddQuarantineSubmitted}
      />

      {/* R 바로 폐기/반품 모달 */}
      <AddRDirectModal
        open={rDirectMode !== null}
        mode={rDirectMode ?? "scrap"}
        onClose={() => setRDirectMode(null)}
        currentEmployee={employee}
        onSubmitted={handleRDirectSubmitted}
      />
    </div>
  );
}
