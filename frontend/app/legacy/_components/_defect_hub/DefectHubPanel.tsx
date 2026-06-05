"use client";

import { useEffect, useMemo, useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { defectsApi } from "@/lib/api/defects";
import type { DefectKpi, DefectLocation } from "@/lib/api/types/defects";
/** DefectHubPanel 이 필요한 최소 직원 필드 */
export interface DefectHubEmployee {
  employee_id: string;
  name: string;
  department: string;
}
import { DefectKpiCards, type DefectKpiKind } from "./DefectKpiCards";
import { DefectQuickActions } from "./DefectQuickActions";
import { DefectFilterBar, type DefectScope, type DefectSort } from "./DefectFilterBar";
import { DefectDepartmentList } from "./DefectDepartmentList";
import { RDefectActionModal } from "./RDefectActionModal";
import { PaPfDefectWizard } from "./PaPfDefectWizard";
import { AddQuarantineModal } from "./AddQuarantineModal";
import { AddRDirectModal } from "./AddRDirectModal";
import { InlineErrorNote } from "./InlineErrorNote";
import { tint } from "@/lib/mes/colorUtils";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const PRODUCTION_LINES = new Set(["튜브", "고압", "진공", "튜닝", "조립", "출하"]);

interface Props {
  defectDeptFilter?: string | null;
  currentEmployee: DefectHubEmployee;
}

const DEFAULT_KPI: DefectKpi = {
  quarantined: 0,
  over_one_year: 0,
  pending_approval: 0,
  processed_today: 0,
};

export function DefectHubPanel({ defectDeptFilter, currentEmployee }: Props) {
  const [kpi, setKpi] = useState<DefectKpi>(DEFAULT_KPI);
  const [locations, setLocations] = useState<DefectLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // defectDeptFilter prop 이 있으면 내 부서 필터로 초기 설정,
  // 없으면 생산 라인이면 "my", 아니면 "all"
  const initialScope = (): DefectScope => {
    if (defectDeptFilter) return "my";
    return PRODUCTION_LINES.has(currentEmployee.department) ? "my" : "all";
  };

  const [scope, setScope] = useState<DefectScope>(initialScope);
  const [sort, setSort] = useState<DefectSort>("oldest");
  const [kpiFilter, setKpiFilter] = useState<DefectKpiKind | null>(null);
  const [processingLocation, setProcessingLocation] = useState<DefectLocation | null>(null);
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
    return () => { cancelled = true; };
  }, [reloadNonce]);

  // scope/defectDeptFilter 에 따른 목록 필터
  const filteredLocations = useMemo(() => {
    let result = locations;

    // 부서 범위 필터
    if (scope === "my") {
      const targetDept = defectDeptFilter ?? currentEmployee.department;
      result = result.filter((loc) => loc.department === targetDept);
    } else if (scope === "production") {
      result = result.filter((loc) => PRODUCTION_LINES.has(loc.department));
    }
    // scope === "all" → 필터 없음

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
  }, [locations, scope, sort, kpiFilter, defectDeptFilter, currentEmployee.department]);

  // [처리] 버튼 클릭 → 품목 종류에 따라 모달 분기
  function handleProcess(location: DefectLocation) {
    setProcessingLocation(location);
  }

  function handleModalSubmitted() {
    setProcessingLocation(null);
    setReloadNonce((n) => n + 1);
  }

  function handleAddQuarantine() {
    setAddQuarantineOpen(true);
  }
  function handleAddQuarantineSubmitted() {
    setAddQuarantineOpen(false);
    setReloadNonce((n) => n + 1);
  }
  // R 바로 반품/폐기 — 정상 재고에서 격리 없이 즉시 처리.
  function handleAddRReturn() {
    setRDirectMode("return");
  }
  function handleAddRScrap() {
    setRDirectMode("scrap");
  }
  function handleRDirectSubmitted() {
    setRDirectMode(null);
    setReloadNonce((n) => n + 1);
  }

  function handleKpiCardClick(kind: DefectKpiKind) {
    setKpiFilter((prev) => (prev === kind ? null : kind));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>
          불량 처리 허브
        </h2>
        <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          {currentEmployee.name} · {currentEmployee.department}
        </span>
      </div>

      {/* KPI 카드 */}
      <DefectKpiCards kpi={kpi} onCardClick={handleKpiCardClick} />

      {/* 퀵 액션 */}
      <DefectQuickActions
        onAddQuarantine={handleAddQuarantine}
        onAddRReturn={handleAddRReturn}
        onAddRScrap={handleAddRScrap}
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
      {loading ? (
        <div className="py-10 text-center text-sm font-bold" style={{ color: LEGACY_COLORS.muted }}>
          불량 데이터 로딩 중...
        </div>
      ) : error ? (
        <InlineErrorNote variant="block" className="!text-sm">
          {error}
        </InlineErrorNote>
      ) : (
        <DefectDepartmentList locations={filteredLocations} onProcess={handleProcess} />
      )}

      {/* 처리 모달 — 품목 종류(R / PA·PF)에 따라 분기 */}
      {processingLocation && processingLocation.has_bom ? (
        <PaPfDefectWizard
          open
          onClose={() => setProcessingLocation(null)}
          location={processingLocation}
          currentEmployee={currentEmployee}
          onSubmitted={handleModalSubmitted}
        />
      ) : processingLocation ? (
        <RDefectActionModal
          open
          onClose={() => setProcessingLocation(null)}
          location={processingLocation}
          currentEmployee={currentEmployee}
          onSubmitted={handleModalSubmitted}
        />
      ) : null}

      {/* 새 격리 추가 모달 */}
      <AddQuarantineModal
        open={addQuarantineOpen}
        onClose={() => setAddQuarantineOpen(false)}
        currentEmployee={currentEmployee}
        onSubmitted={handleAddQuarantineSubmitted}
      />

      {/* R 바로 폐기/반품 모달 */}
      <AddRDirectModal
        open={rDirectMode !== null}
        mode={rDirectMode ?? "scrap"}
        onClose={() => setRDirectMode(null)}
        currentEmployee={currentEmployee}
        onSubmitted={handleRDirectSubmitted}
      />
    </div>
  );
}
