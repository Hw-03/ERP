"use client";

import { ArrowLeft, Clock, type LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../../tokens";
import { EmptyState, IconButton } from "../../primitives";

export function PlaceholderScreen({
  title,
  subtitle,
  icon,
  phaseLabel,
  description,
  onBack,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  phaseLabel: string;
  description?: string;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: `1px solid ${LEGACY_COLORS.border as string}` }}
      >
        <IconButton icon={ArrowLeft} label="뒤로" size="md" onClick={onBack} />
        <div className="min-w-0">
          {subtitle ? (
            <div
              className={`${TYPO.overline} font-bold uppercase tracking-[2px]`}
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {subtitle}
            </div>
          ) : null}
          <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
            {title}
          </div>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <EmptyState
          icon={icon ?? Clock}
          title={`${phaseLabel} 예정`}
          description={
            description ??
            "현재는 데스크탑에서 사용해 주세요. 다음 단계에서 모바일에 추가됩니다."
          }
        />
      </div>
    </div>
  );
}
