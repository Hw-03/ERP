"use client";

import { useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
export type KpiFilter = "ALL" | "NORMAL" | "LOW" | "ZERO";
export type KpiCard = { label: string; value: number; hint: string; tone: string; key: KpiFilter };

type Props = {
  cards: KpiCard[];
  activeKey: KpiFilter;
  onChange: (key: KpiFilter) => void;
};

export function InventoryKpiPanel({ cards, activeKey, onChange }: Props) {
  const [hovered, setHovered] = useState<KpiFilter | null>(null);
  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {cards.map((card) => {
        const isActive = activeKey === card.key;
        const isHover = hovered === card.key;
        return (
          <button
            key={card.key}
            onClick={() => onChange(card.key)}
            onMouseEnter={() => setHovered(card.key)}
            onMouseLeave={() => setHovered(null)}
            className="rounded-[16px] border px-5 py-5 text-left transition-colors hover:brightness-110"
            style={{
              background: isActive
                ? `color-mix(in srgb, ${card.tone} 22%, transparent)`
                : isHover
                ? `color-mix(in srgb, ${card.tone} 16%, transparent)`
                : `color-mix(in srgb, ${card.tone} 8%, transparent)`,
              borderColor: isActive || isHover
                ? card.tone
                : `color-mix(in srgb, ${card.tone} 35%, transparent)`,
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[22px] font-black tracking-[-0.02em]" style={{ color: card.tone }}>
                {card.label}
              </div>
              <div className="text-[32px] font-black leading-none" style={{ color: card.tone }}>
                {formatQty(card.value)}
              </div>
            </div>
            <div className="mt-2 text-[12px] font-semibold" style={{ color: card.tone, opacity: 0.7 }}>
              {card.hint}
            </div>
          </button>
        );
      })}
    </div>
  );
}
