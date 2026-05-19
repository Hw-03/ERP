"use client";

import { Layers, Sparkles, TrendingUp } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { FilterChip } from "../common";
import { OPERATION_OPTIONS } from "./historyQuery";

// 3차: 유일 필터 패널. 3카드 모두 다중 선택.
// 부서 = 서버 departmentCounts 기반 동적("창고" 포함, 미상은 진짜 unknown만).
// 거래 종류 = 전 16종 고정(공정 R/A/F 카드 폐기). KPI 박스는 표시 전용이라 동기 없음.
type Props = {
  open: boolean;
  /** baseline summary 의 부서별 카운트 — 부서 칩 소스(동적). */
  departmentCounts: Record<string, number>;
  selectedDepts: string[];
  toggleDept: (v: string) => void;
  clearDepts: () => void;
  models: string[];
  selectedModels: string[];
  toggleModel: (v: string) => void;
  clearModels: () => void;
  selectedOps: string[];
  toggleOp: (v: string) => void;
  clearOps: () => void;
};

export function HistoryFilterPanel({
  open,
  departmentCounts,
  selectedDepts,
  toggleDept,
  clearDepts,
  models,
  selectedModels,
  toggleModel,
  clearModels,
  selectedOps,
  toggleOp,
  clearOps,
}: Props) {
  if (!open) return null;
  const deptEntries = Object.entries(departmentCounts)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="grid gap-2.5 xl:grid-cols-3">
      <Card icon={<Sparkles className="h-4 w-4" style={{ color: LEGACY_COLORS.green }} />} title="부서 구분">
        <FilterChip active={selectedDepts.length === 0} label="전체" onClick={clearDepts} tone={LEGACY_COLORS.green} className="w-full" />
        {deptEntries.map(([name, count]) => (
          <FilterChip
            key={name}
            active={selectedDepts.includes(name)}
            label={`${name} ${count.toLocaleString()}`}
            onClick={() => toggleDept(name)}
            tone={LEGACY_COLORS.green}
            className="w-full"
          />
        ))}
      </Card>

      <Card icon={<TrendingUp className="h-4 w-4" style={{ color: LEGACY_COLORS.cyan }} />} title="모델 구분">
        <FilterChip active={selectedModels.length === 0} label="전체" onClick={clearModels} tone={LEGACY_COLORS.cyan} className="w-full" />
        {models.map((m) => (
          <FilterChip
            key={m}
            active={selectedModels.includes(m)}
            label={m}
            onClick={() => toggleModel(m)}
            tone={LEGACY_COLORS.cyan}
            className="w-full"
          />
        ))}
      </Card>

      <Card icon={<Layers className="h-4 w-4" style={{ color: LEGACY_COLORS.yellow }} />} title="거래 종류">
        <FilterChip active={selectedOps.length === 0} label="전체" onClick={clearOps} tone={LEGACY_COLORS.yellow} className="w-full" />
        {OPERATION_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            active={selectedOps.includes(opt.value)}
            label={opt.label}
            onClick={() => toggleOp(opt.value)}
            tone={LEGACY_COLORS.yellow}
            className="w-full"
          />
        ))}
      </Card>
    </div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[16px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
        {icon}
        {title}
      </div>
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </div>
  );
}
