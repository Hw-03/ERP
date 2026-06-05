"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { DEFECT_HUB_CARDS, type DefectHubCardId } from "../../_defect_hub/defectHubCards";

interface Props {
  onSelect: (id: DefectHubCardId) => void;
}

/**
 * 불량 탭 진입 화면 — 3장 카드 선택 (모바일).
 * MobileWorkTypeStep 패턴 복제: 즉시 네비게이션, toggle 없음.
 */
export function MobileDefectEntry({ onSelect }: Props) {
  return (
    <div className="flex flex-col gap-2.5">
      {DEFECT_HUB_CARDS.map((card) => {
        const Icon = card.icon;
        const accent = LEGACY_COLORS[card.accentKey];
        const accentText = `color-mix(in srgb, ${accent} 42%, ${LEGACY_COLORS.text})`;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card.id)}
            className="flex min-h-[72px] items-center gap-4 rounded-[18px] border p-4 text-left transition-[transform] active:scale-[0.99]"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              borderWidth: 1,
              color: LEGACY_COLORS.text,
            }}
          >
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
              style={{ background: `color-mix(in srgb, ${accent} 20%, transparent)` }}
            >
              <Icon className="h-6 w-6" style={{ color: accentText }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-black leading-tight">{card.label}</span>
              <span
                className="block text-sm font-semibold"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                {card.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
