"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { KpiCard } from "../common/KpiCard";
import type { DefectKpi } from "@/lib/api/types/defects";

export type DefectKpiKind = "quarantined" | "over_one_year";

interface Props {
  kpi: DefectKpi;
  activeFilter?: DefectKpiKind | null;
  onCardClick: (kind: DefectKpiKind) => void;
}

export function DefectKpiCards({ kpi, activeFilter, onCardClick }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <KpiCard
        label="격리 중"
        value={kpi.quarantined}
        hint="현재 DEFECTIVE 상태"
        tone={LEGACY_COLORS.red}
      />
      <KpiCard
        label="1년 이상 ⚠"
        value={kpi.over_one_year}
        hint="격리 후 365일 초과"
        tone={LEGACY_COLORS.red}
        active={activeFilter === "over_one_year"}
        onClick={() => onCardClick("over_one_year")}
      />
    </div>
  );
}
