"use client";

import { KpiCard } from "../../common/KpiCard";

export interface AdminKpiItem {
  key: string;
  label: string;
  value: string | number;
  hint?: string;
  tone: string;
  active?: boolean;
  onClick?: () => void;
}

export interface AdminKpiBarProps {
  items: AdminKpiItem[];
}

export function AdminKpiBar({ items }: AdminKpiBarProps) {
  if (items.length === 0) return null;
  return (
    <div
      className="mb-2 grid shrink-0 gap-2"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((kpi) => (
        <KpiCard
          key={kpi.key}
          label={kpi.label}
          value={kpi.value}
          hint={kpi.hint}
          tone={kpi.tone}
          active={kpi.active}
          onClick={kpi.onClick}
          compact
        />
      ))}
    </div>
  );
}
