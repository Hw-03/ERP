"use client";

import { memo, useMemo, useState } from "react";
import { LEGACY_COLORS, employeeColor } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import type { WeeklyGroupReport } from "@/lib/api/types/weekly";

// 0/무변동 값 de-emphasis — 단 WCAG AA 충족 필요(투명 30% 는 미달) → 솔리드 muted2(5.55:1).
const ZERO_FADE = LEGACY_COLORS.muted2;

const PROCESS_ORDER: Record<string, number> = { TF: 0, HF: 1, VF: 2, NF: 3, AF: 4, PF: 5 };

interface Props {
  groups: WeeklyGroupReport[];
  selected: string;
  onSelect: (code: string) => void;
  cols?: 1;
}

function WeeklyGroupCardsImpl({ groups, selected, onSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  // 튜브→고압→진공→튜닝→조립→출하 순 고정 (주차마다 순서 흔들림 방지)
  const sortedGroups = useMemo(
    () =>
      [...groups].sort(
        (a, b) =>
          (PROCESS_ORDER[a.process_code] ?? 99) - (PROCESS_ORDER[b.process_code] ?? 99),
      ),
    [groups],
  );

  return (
    <div className="flex h-full flex-col gap-1">
      {sortedGroups.map((g) => {
        const isActive = g.process_code === selected;
        const isHover = hovered === g.process_code;
        const isDecreasing = g.delta < 0;
        const isQuiet = g.delta === 0 && !isActive;
        const accentColor = employeeColor(g.dept_name);
        const tone = isDecreasing ? LEGACY_COLORS.red : accentColor;
        const deltaColor =
          g.delta > 0 ? LEGACY_COLORS.green
          : g.delta < 0 ? LEGACY_COLORS.red
          : ZERO_FADE;

        return (
          <button
            key={g.process_code}
            type="button"
            onClick={() => onSelect(g.process_code)}
            onMouseEnter={() => setHovered(g.process_code)}
            onMouseLeave={() => setHovered(null)}
            aria-pressed={isActive}
            className="relative flex min-h-0 flex-1 flex-col justify-center overflow-hidden rounded-[12px] border text-left transition-colors hover:brightness-110"
            style={{
              background: isActive
                ? tint(tone, 8, LEGACY_COLORS.s2)
                : isHover
                ? LEGACY_COLORS.s2
                : LEGACY_COLORS.s1,
              borderColor: isActive
                ? tone
                : isDecreasing
                ? tint(LEGACY_COLORS.red, 30, LEGACY_COLORS.border)
                : isQuiet
                ? tint(LEGACY_COLORS.border, 60, "transparent")
                : LEGACY_COLORS.border,
              boxShadow: isActive
                ? `0 0 0 1px ${tint(tone, 20)}, var(--c-card-shadow)`
                : undefined,
            }}
          >
            {/* Left accent bar */}
            <div
              className="absolute bottom-0 left-0 top-0 w-[3px]"
              style={{
                background: isActive || isDecreasing
                  ? tone
                  : isQuiet
                  ? tint(accentColor, 15)
                  : tint(accentColor, 35),
              }}
            />
            {/* 상단 행 한 줄: 부서명 · 공정코드 · 증감 */}
            <div className="flex items-center gap-2 py-1 pl-2.5 pr-2">
              <span
                className="text-[14px] font-black tracking-[-0.01em] leading-none"
                style={{ color: isQuiet ? LEGACY_COLORS.muted2 : LEGACY_COLORS.text }}
              >
                {g.dept_name}
              </span>
              <span
                className="inline-flex shrink-0 items-center rounded-[5px] px-1.5 py-0.5 text-[10px] font-black leading-none"
                style={{
                  background: isQuiet
                    ? tint(LEGACY_COLORS.muted2, 10, LEGACY_COLORS.s2)
                    : tint(tone, 16, LEGACY_COLORS.s2),
                  color: isQuiet
                    ? LEGACY_COLORS.muted2
                    : `color-mix(in srgb, ${tone} 42%, ${LEGACY_COLORS.text})`,
                }}
              >
                {g.process_code}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                {g.delta !== 0 ? (
                  <span
                    className="text-[17px] font-black leading-none tabular-nums"
                    style={{ color: deltaColor }}
                  >
                    {g.delta > 0 ? `+${formatQty(g.delta)}` : formatQty(g.delta)}
                  </span>
                ) : (
                  <>
                    <span
                      className="text-[15px] font-semibold leading-none"
                      style={{ color: ZERO_FADE }}
                    >
                      ±0
                    </span>
                    <span
                      className="rounded-[4px] px-1 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: tint(LEGACY_COLORS.muted2, 6, LEGACY_COLORS.s2),
                        color: ZERO_FADE,
                      }}
                    >
                      변동 없음
                    </span>
                  </>
                )}
              </div>
            </div>
            {/* 하단 행 한 줄: 입고 · 출고 · 현재.
                grid grid-cols-3 으로 셀 위치를 1/3 등분 고정 — justify-between 은 좌·우
                child 너비에 따라 가운데 child 위치가 흔들려 카드 간 정렬이 깨짐(예: 출하 전부 0
                vs 조립 현재 25,200). 각 셀 안에서 left/center/right 정렬로 컬럼처럼 줄세움. */}
            <div
              className="grid grid-cols-3 items-center border-t px-2.5 py-1 text-[11px] leading-none tabular-nums"
              style={{ borderColor: tint(LEGACY_COLORS.border, 60, "transparent") }}
            >
              <span
                className={`text-left ${g.produce_qty > 0 ? "font-semibold" : "font-medium"}`}
                style={{
                  color:
                    g.produce_qty > 0
                      ? `color-mix(in srgb, ${LEGACY_COLORS.green} 55%, ${LEGACY_COLORS.text})`
                      : ZERO_FADE,
                }}
              >
                생산 {formatQty(g.produce_qty)}
              </span>
              <span
                className={`text-center ${g.out_qty > 0 ? "font-semibold" : "font-medium"}`}
                style={{
                  color:
                    g.out_qty > 0
                      ? `color-mix(in srgb, ${LEGACY_COLORS.red} 55%, ${LEGACY_COLORS.text})`
                      : ZERO_FADE,
                }}
              >
                출고 {formatQty(g.out_qty)}
              </span>
              <span
                className={`text-right ${g.current_qty > 0 ? "font-semibold" : "font-medium"}`}
                style={{
                  color: g.current_qty > 0 ? LEGACY_COLORS.muted2 : ZERO_FADE,
                }}
              >
                현재 {formatQty(g.current_qty)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export const WeeklyGroupCards = memo(WeeklyGroupCardsImpl);
