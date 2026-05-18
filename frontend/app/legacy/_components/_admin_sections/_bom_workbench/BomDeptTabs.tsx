"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { DEPT_LETTERS, DEPT_LETTER_TO_NAME, deptColor, type DeptLetter } from "./bomDept";

/**
 * 부서탭 6개 — 튜브/고압/진공/튜닝/조립/출하. 활성탭은 부서 색상으로 채워짐.
 * deptStats 가 전달되면 각 탭에 "부모수 / 미완료수" 카운트를 표기.
 */
interface DeptStat {
  total: number;
  unmatched: number;
}

interface Props {
  value: DeptLetter;
  onChange: (v: DeptLetter) => void;
  deptStats?: Partial<Record<DeptLetter, DeptStat>>;
}

export function BomDeptTabs({ value, onChange, deptStats }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {DEPT_LETTERS.map((letter) => {
        const active = letter === value;
        const color = deptColor(letter);
        const stat = deptStats?.[letter];
        return (
          <button
            key={letter}
            type="button"
            onClick={() => onChange(letter)}
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
            {DEPT_LETTER_TO_NAME[letter]}
            {stat != null && (
              <span
                className="ml-0.5 text-[11px] font-bold tabular-nums"
                style={{
                  color: active
                    ? "rgba(255,255,255,0.75)"
                    : stat.unmatched > 0
                      ? LEGACY_COLORS.red
                      : LEGACY_COLORS.muted2,
                }}
              >
                {stat.total}
                {stat.unmatched > 0 && `·미완${stat.unmatched}`}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
