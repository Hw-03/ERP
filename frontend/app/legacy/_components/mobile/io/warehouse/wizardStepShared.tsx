"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../../tokens";

/**
 * 4 step (Type / Person / Items / Confirm) 의 상단 안내 영역.
 * Round-11A (#1) 추출 — 동일 마크업이 4 곳에서 반복되어 분리.
 */
export function StepHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
        {title}
      </div>
      {hint ? (
        <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
