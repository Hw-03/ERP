"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { CAUTION_WORK_TYPES, WORK_TYPES, type WorkType } from "./_constants";

/**
 * Round-13 (#16) 추출 — WorkTypeStep 의 작업 유형 grid (3 column 카드).
 */
export function WorkTypeCardGrid({
  workType,
  availableWorkTypes,
  onWorkTypeChange,
}: {
  workType: WorkType;
  availableWorkTypes: WorkType[];
  onWorkTypeChange: (wt: WorkType) => void;
}) {
  const visibleWorkTypes = WORK_TYPES.filter((entry) => availableWorkTypes.includes(entry.id));

  return (
    <div className="grid grid-cols-3 gap-2">
      {visibleWorkTypes.map((entry) => {
        const Icon = entry.icon;
        const active = entry.id === workType;
        const cardTone = CAUTION_WORK_TYPES.includes(entry.id) ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
        return (
          <button
            key={entry.id}
            onClick={() => onWorkTypeChange(entry.id)}
            className="flex flex-col items-start gap-1 rounded-[14px] border p-3 text-left transition-all hover:brightness-110"
            style={{
              background: active ? `color-mix(in srgb, ${cardTone} 14%, transparent)` : LEGACY_COLORS.s2,
              borderColor: active ? cardTone : LEGACY_COLORS.border,
              borderWidth: active ? 2 : 1,
              color: active ? cardTone : LEGACY_COLORS.text,
            }}
          >
            <div className="flex items-center gap-1.5">
              <Icon className="h-4 w-4 shrink-0" />
              <span className="text-sm font-black leading-tight">{entry.label}</span>
            </div>
            <span
              className="text-[10px] font-semibold leading-tight"
              style={{ color: active ? cardTone : LEGACY_COLORS.muted2 }}
            >
              {entry.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
