"use client";

import { ArrowLeft } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";
import { IconButton } from "./IconButton";

/**
 * 모바일 sub-screen sticky 헤더 — 뒤로가기 + 제목/부제 + 우측 옵션.
 * WeeklyReportScreen · PlaceholderScreen 공통.
 */
export function SubScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-2 border-b px-3 py-3"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <IconButton icon={ArrowLeft} label="뒤로" size="md" onClick={onBack} />
      <div className="min-w-0 flex-1">
        {subtitle ? (
          <div
            className={`${TYPO.overline} font-bold uppercase tracking-[2px]`}
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {subtitle}
          </div>
        ) : null}
        <div
          className={`${TYPO.title} truncate font-black`}
          style={{ color: LEGACY_COLORS.text }}
        >
          {title}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
