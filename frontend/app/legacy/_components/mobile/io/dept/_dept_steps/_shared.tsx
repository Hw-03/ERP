"use client";

import { LEGACY_COLORS } from "../../../../legacyUi";
import { TYPO } from "../../../tokens";

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

export const ITEM_CATEGORIES = [
  { id: "ALL", label: "전체" },
  { id: "R", label: "원자재" },
  { id: "A", label: "조립체" },
  { id: "F", label: "F타입" },
] as const;

export type ItemCategoryId = (typeof ITEM_CATEGORIES)[number]["id"];
