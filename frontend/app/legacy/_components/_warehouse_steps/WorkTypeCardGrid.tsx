"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { CAUTION_WORK_TYPES, WORK_TYPES, type WorkType } from "./_constants";

/**
 * Round-13 (#16) 추출 — WorkTypeStep 의 작업 유형 grid (3 column 카드).
 */
export function WorkTypeCardGrid({
  workType,
  workTypeConfirmed,
  availableWorkTypes,
  onWorkTypeChange,
}: {
  workType: WorkType;
  workTypeConfirmed: boolean;
  availableWorkTypes: WorkType[];
  onWorkTypeChange: (wt: WorkType) => void;
}) {
  const visibleWorkTypes = WORK_TYPES.filter((entry) => availableWorkTypes.includes(entry.id));
  const n = visibleWorkTypes.length;
  const cols = n <= 3 ? n : n === 4 ? 2 : 3;

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {visibleWorkTypes.map((entry) => {
        const Icon = entry.icon;
        const active = workTypeConfirmed && entry.id === workType;
        const cardTone = CAUTION_WORK_TYPES.includes(entry.id) ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
        return (
          <button
            key={entry.id}
            onClick={() => onWorkTypeChange(entry.id)}
            className="flex flex-col items-start gap-2 rounded-[18px] border p-6 text-left transition-all hover:brightness-110"
            style={{
              background: active ? `color-mix(in srgb, ${cardTone} 14%, transparent)` : LEGACY_COLORS.s2,
              borderColor: active ? cardTone : LEGACY_COLORS.border,
              borderWidth: active ? 2 : 1,
              color: active ? cardTone : LEGACY_COLORS.text,
            }}
          >
            <div className="flex items-center gap-2">
              <Icon className="h-7 w-7 shrink-0" />
              <span className="text-lg font-black leading-tight">{entry.label}</span>
            </div>
            <span
              className="text-sm font-semibold leading-tight"
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
