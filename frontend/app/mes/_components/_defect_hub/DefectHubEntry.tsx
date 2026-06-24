"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { DEFECT_HUB_CARDS, type DefectHubCardId } from "./defectHubCards";

interface Props {
  onSelect: (id: DefectHubCardId) => void;
}

/**
 * 불량 탭 진입 화면 — 3장 카드 선택 (데스크톱).
 * IoWorkTypeStep 패턴 복제: 즉시 네비게이션, toggle 없음.
 */
export function DefectHubEntry({ onSelect }: Props) {
  return (
    <div
      className="grid h-full min-h-0 gap-3"
      style={{
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gridTemplateRows: "repeat(1, minmax(0, 1fr))",
      }}
    >
      {DEFECT_HUB_CARDS.map((card) => {
        const Icon = card.icon;
        const accent = LEGACY_COLORS[card.accentKey];
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card.id)}
            className="flex h-full min-h-0 flex-col items-start justify-between gap-6 rounded-[22px] border p-10 text-left transition-all hover:brightness-110"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              borderWidth: 1,
              color: LEGACY_COLORS.text,
            }}
          >
            <div className="flex items-center gap-5">
              <Icon
                className="h-10 w-10 shrink-0"
                style={{ color: accent }}
              />
              <span className="text-4xl font-black leading-tight">{card.label}</span>
            </div>
            <span
              className="text-xl font-bold leading-tight"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {card.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
