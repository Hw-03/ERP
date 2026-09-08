"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { DesktopWorkHubCard } from "../common/DesktopWorkHubCard";
import { DEFECT_HUB_CARDS, type DefectHubCardId } from "./defectHubCards";

interface Props {
  onSelect: (id: DefectHubCardId) => void;
}

/**
 * 불량 탭 진입 화면 — 2×2 작업 카드 선택 (데스크톱).
 * IoWorkTypeStep 패턴 복제: 즉시 네비게이션, toggle 없음.
 */
export function DefectHubEntry({ onSelect }: Props) {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 md:grid-cols-2 md:grid-rows-2">
      {DEFECT_HUB_CARDS.map((card) => {
        const Icon = card.icon;
        const accent = LEGACY_COLORS[card.accentKey];
        return (
          <DesktopWorkHubCard
            key={card.id}
            onClick={() => onSelect(card.id)}
            icon={Icon}
            title={card.label}
            description={card.description}
            tone={accent}
            className="p-10"
            size="large"
          />
        );
      })}
    </div>
  );
}
