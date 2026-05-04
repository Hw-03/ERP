"use client";

import { formatQty } from "@/lib/mes/format";
import { KpiCard } from "../common/KpiCard";

export type KpiFilter = "ALL" | "NORMAL" | "LOW" | "ZERO";
export type KpiCardData = { label: string; value: number; hint: string; tone: string; key: KpiFilter };

type Props = {
  cards: KpiCardData[];
  activeKey: KpiFilter;
  onChange: (key: KpiFilter) => void;
};

export function InventoryKpiPanel({ cards, activeKey, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {cards.map((card) => (
        <KpiCard
          key={card.key}
          label={card.label}
          value={formatQty(card.value)}
          hint={card.hint}
          tone={card.tone}
          active={activeKey === card.key}
          onClick={() => onChange(card.key)}
        />
      ))}
    </div>
  );
}
