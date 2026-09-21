"use client";

import { formatQty } from "@/lib/mes/format";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { KpiCard } from "../common/KpiCard";

export type KpiFilter = "ALL" | "NORMAL" | "LOW" | "ZERO";
export type KpiCardData = { label: string; value: number; hint: string; tone: string; key: KpiFilter };

type Props = {
  cards: KpiCardData[];
  activeKey: KpiFilter;
  onChange: (key: KpiFilter) => void;
  loading?: boolean;
};

const LOADING_CARDS: KpiCardData[] = [
  { label: "전체", value: 0, hint: "전체 품목", tone: LEGACY_COLORS.blue, key: "ALL" },
  { label: "정상", value: 0, hint: "운영 가능", tone: LEGACY_COLORS.green, key: "NORMAL" },
  { label: "부족", value: 0, hint: "안전재고 이하", tone: LEGACY_COLORS.yellow, key: "LOW" },
  { label: "품절", value: 0, hint: "즉시 조치 필요", tone: LEGACY_COLORS.red, key: "ZERO" },
];

export function InventoryKpiPanel({ cards, activeKey, onChange, loading = false }: Props) {
  const displayCards = loading && cards.length === 0 ? LOADING_CARDS : cards;

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {displayCards.map((card) => (
        <KpiCard
          key={card.key}
          label={card.label}
          value={formatQty(card.value)}
          loading={loading}
          hint={card.hint}
          tone={card.tone}
          active={activeKey === card.key}
          onClick={() => onChange(card.key)}
        />
      ))}
    </div>
  );
}
