"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { KpiCard } from "../common/KpiCard";
import type { DefectKpi } from "@/lib/api/types/defects";

export type DefectKpiKind = "quarantined" | "over_one_year" | "pending" | "today";

interface Props {
  kpi: DefectKpi;
  onCardClick: (kind: DefectKpiKind) => void;
}

export function DefectKpiCards({ kpi, onCardClick }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <KpiCard
        label="격리 중"
        value={kpi.quarantined}
        hint="현재 DEFECTIVE 상태"
        tone={LEGACY_COLORS.red}
        onClick={() => onCardClick("quarantined")}
      />
      <KpiCard
        label="1년 이상 ⚠"
        value={kpi.over_one_year}
        hint="격리 후 365일 초과"
        tone="#b91c1c"
        onClick={() => onCardClick("over_one_year")}
      />
      <KpiCard
        label="결재 대기"
        value={kpi.pending_approval}
        hint="승인 대기 중인 처리"
        tone={LEGACY_COLORS.yellow}
        onClick={() => onCardClick("pending")}
      />
      <KpiCard
        label="오늘 처리"
        value={kpi.processed_today}
        hint="오늘 완료된 처리"
        tone={LEGACY_COLORS.green}
        onClick={() => onCardClick("today")}
      />
    </div>
  );
}
