"use client";

import { formatQty } from "@/lib/mes/format";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { KpiCard } from "../common/KpiCard";
import { SkeletonBlock, dataRevealClassName } from "../common/LoadingSkeleton";

export type KpiFilter = "ALL" | "NORMAL" | "LOW" | "ZERO";
export type KpiCardData = { label: string; value: number; hint: string; tone: string; key: KpiFilter };

type Props = {
  cards: KpiCardData[];
  activeKey: KpiFilter;
  onChange: (key: KpiFilter) => void;
  loading?: boolean;
  mobile?: boolean;
};

const LOADING_CARDS: KpiCardData[] = [
  { label: "전체", value: 0, hint: "전체 품목", tone: LEGACY_COLORS.blue, key: "ALL" },
  { label: "정상", value: 0, hint: "운영 가능", tone: LEGACY_COLORS.green, key: "NORMAL" },
  { label: "부족", value: 0, hint: "안전재고 이하", tone: LEGACY_COLORS.yellow, key: "LOW" },
  { label: "품절", value: 0, hint: "즉시 조치 필요", tone: LEGACY_COLORS.red, key: "ZERO" },
];

export function InventoryKpiPanel({ cards, activeKey, onChange, loading = false, mobile = false }: Props) {
  const displayCards = loading && cards.length === 0 ? LOADING_CARDS : cards;

  if (mobile) {
    return (
      <div>
      <div className="grid grid-cols-4 overflow-hidden rounded-[20px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        {displayCards.map((card) => (
          <button
            key={card.key}
            type="button"
            aria-pressed={activeKey === card.key}
            onClick={() => onChange(card.key)}
            className="no-btn-inset flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 border-b-2 px-1 py-2 transition-colors"
            style={{ borderColor: activeKey === card.key ? card.tone : "transparent", background: `color-mix(in srgb, ${card.tone} ${activeKey === card.key ? 16 : 6}%, transparent)` }}
          >
            <span className="text-xs font-medium" style={{ color: card.tone }}>{card.label}</span>
            <span role={loading ? "status" : undefined} aria-busy={loading || undefined} aria-label={loading ? "집계 중" : undefined} className={`flex h-7 items-center text-lg font-semibold tabular-nums ${loading ? "" : dataRevealClassName}`} style={{ color: card.tone }}>
              {loading ? <SkeletonBlock className="h-6 w-9" /> : formatQty(card.value)}
            </span>
            <span className="sr-only">{card.hint}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>집계와 자재 목록은 PA·PF 품목을 제외합니다.</p>
      </div>
    );
  }

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
