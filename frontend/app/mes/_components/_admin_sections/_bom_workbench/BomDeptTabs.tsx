"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { DEPT_LETTERS, DEPT_LETTER_TO_NAME, deptColor, type BomDeptFilter } from "./bomDept";

/**
 * 상위 품목의 단계 필터 옆에 놓는 부서 필터. 활성 버튼은 부서 색상으로 채운다.
 * "전체"는 공통 선택 색상을 사용한다.
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
    <div role="group" aria-label="상위 품목 부서 필터" data-testid="bom-department-filters" className="ml-1.5 flex shrink-0 items-center gap-1.5 border-l pl-3" style={{ borderColor: LEGACY_COLORS.border }}>
      {chips.map((chip) => {
        const active = chip.letter === value;
        const isAll = chip.letter === "ALL";
        const color = isAll ? LEGACY_COLORS.blue : deptColor(chip.letter as Exclude<BomDeptFilter, "ALL">);
        return (
          <button
            key={chip.letter}
            type="button"
            onClick={() => onChange(chip.letter)}
            aria-pressed={active}
            className="whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold transition-colors"
            style={{
              background: active ? color : LEGACY_COLORS.s1,
              color: active ? LEGACY_COLORS.white : isAll ? LEGACY_COLORS.text : color,
              borderColor: active ? color : isAll ? LEGACY_COLORS.border : `color-mix(in srgb, ${color} 35%, transparent)`,
            }}
          >
            {chip.name}
          </button>
        );
      })}
    </div>
  );
}
