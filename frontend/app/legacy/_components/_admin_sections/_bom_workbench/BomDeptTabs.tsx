"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { DEPT_LETTERS, DEPT_LETTER_TO_NAME, deptColor, type BomDeptFilter } from "./bomDept";

/**
 * 부서탭 7개 — 전체 + 튜브/고압/진공/튜닝/조립/출하. 활성탭은 부서 색상으로 채워짐.
 * "전체"는 muted2 색상 사용.
 */
interface Props {
  value: BomDeptFilter;
  onChange: (v: BomDeptFilter) => void;
}

export function BomDeptTabs({ value, onChange }: Props) {
  const chips: Array<{ letter: BomDeptFilter; name: string }> = [
    { letter: "ALL", name: "전체" },
    ...DEPT_LETTERS.map((l) => ({ letter: l, name: DEPT_LETTER_TO_NAME[l] })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const active = chip.letter === value;
        const isAll = chip.letter === "ALL";
        const color = isAll ? LEGACY_COLORS.muted2 : deptColor(chip.letter as Exclude<BomDeptFilter, "ALL">);
        return (
          <button
            key={chip.letter}
            type="button"
            onClick={() => onChange(chip.letter)}
            aria-pressed={active}
            className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors"
            style={{
              background: active ? color : LEGACY_COLORS.s1,
              color: active ? LEGACY_COLORS.white : LEGACY_COLORS.text,
              borderColor: active ? color : LEGACY_COLORS.border,
            }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: active ? LEGACY_COLORS.white : color, opacity: active ? 0.8 : 1 }}
            />
            {chip.name}
          </button>
        );
      })}
    </div>
  );
}
