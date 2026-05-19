"use client";

import { Layers, Sparkles, TrendingUp } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { FilterChip } from "../common";

// 자재목록(대시보드) InventoryFilters 와 같은 3카드 패턴을 입출고 내역에 이식 (#6).
// 부서 = 단일선택(KPI 부서 박스와 동기, 백엔드 department 단일). 모델/공정 = 다중선택.
const PROCESS_STEPS: { value: string; label: string }[] = [
  { value: "R", label: "원자재" },
  { value: "A", label: "중간공정" },
  { value: "F", label: "공정완료" },
];

type Props = {
  open: boolean;
  /** baseline summary 의 부서별 카운트 — 부서 칩 소스(동적). */
  departmentCounts: Record<string, number>;
  activeDept: string | null;
  onPickDept: (name: string) => void;
  onClearDept: () => void;
  models: string[];
  selectedModels: string[];
  toggleModel: (v: string) => void;
  clearModels: () => void;
  selectedSteps: string[];
  toggleStep: (v: string) => void;
  clearSteps: () => void;
};

export function HistoryFilterPanel({
  open,
  departmentCounts,
  activeDept,
  onPickDept,
  onClearDept,
  models,
  selectedModels,
  toggleModel,
  clearModels,
  selectedSteps,
  toggleStep,
  clearSteps,
}: Props) {
  if (!open) return null;
  const deptNames = Object.entries(departmentCounts)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([n]) => n);

  return (
    <div className="grid gap-2.5 xl:grid-cols-3">
      <Card icon={<Sparkles className="h-4 w-4" style={{ color: LEGACY_COLORS.green }} />} title="부서 구분">
        <FilterChip active={!activeDept} label="전체" onClick={onClearDept} tone={LEGACY_COLORS.green} className="w-full" />
        {deptNames.map((name) => (
          <FilterChip
            key={name}
            active={activeDept === name}
            label={name}
            onClick={() => onPickDept(name)}
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

      <Card icon={<Layers className="h-4 w-4" style={{ color: LEGACY_COLORS.yellow }} />} title="공정 구분">
        <FilterChip active={selectedSteps.length === 0} label="전체" onClick={clearSteps} tone={LEGACY_COLORS.yellow} className="w-full" />
        {PROCESS_STEPS.map((s) => (
          <FilterChip
            key={s.value}
            active={selectedSteps.includes(s.value)}
            label={s.label}
            onClick={() => toggleStep(s.value)}
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
