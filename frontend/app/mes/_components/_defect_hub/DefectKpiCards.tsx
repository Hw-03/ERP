"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { KpiCard } from "../common/KpiCard";
import type { DefectKpi } from "@/lib/api/types/defects";

export type DefectKpiKind = "quarantined" | "over_one_year";

interface Props {
  kpi: DefectKpi;
  /** 집계 범위 라벨 (예: "조립 부서", "전체 부서"). 숫자가 어느 범위인지 부제로 표시. */
  scopeLabel?: string;
  activeFilter?: DefectKpiKind | null;
  onCardClick: (kind: DefectKpiKind) => void;
}

export function DefectKpiCards({ kpi, scopeLabel, activeFilter, onCardClick }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <KpiCard
        label="격리 중"
        value={kpi.quarantined}
        unit="건"
        hint={scopeLabel ? `${scopeLabel} 기준` : "현재 DEFECTIVE 상태"}
        tone={LEGACY_COLORS.red}
      />
      <KpiCard
        label="1년 이상 ⚠"
        value={kpi.over_one_year}
        unit="건"
        hint="격리 후 365일 초과"
        tone={LEGACY_COLORS.red}
        active={activeFilter === "over_one_year"}
        onClick={() => onCardClick("over_one_year")}
      />
    </div>
  );
}
