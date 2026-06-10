"use client";

import clsx from "clsx";
import { LEGACY_COLORS, getDepartmentFallbackColor } from "@/lib/mes/color";
import type { WeeklyProductionModelRow } from "@/lib/api/types/weekly";
import { TYPO } from "../tokens";

/**
 * 주간 생산 매트릭스 — 모바일 카드 버전.
 * 데스크톱 WeeklyProductionMatrix(가로 스크롤 와이드 테이블)는 393px 에 안 맞아
 * 모델별 세로 카드 + 6공정 칩 그리드로 다시 그린다. 표시 규칙(0→"—", 부서색)은
 * frozen 매트릭스와 동일하게 재구현(의도적 분리 — frozen import 아님).
 */
const COLS: { key: keyof WeeklyProductionModelRow; dept: string }[] = [
  { key: "tf_qty", dept: "튜브" },
  { key: "hf_qty", dept: "고압" },
  { key: "vf_qty", dept: "진공" },
  { key: "nf_qty", dept: "튜닝" },
  { key: "af_qty", dept: "조립" },
  { key: "pf_qty", dept: "출하" },
];

function fmt(n: number): string {
  return n === 0 ? "—" : Math.round(n).toLocaleString();
}

export function MobileProductionMatrixCards({ rows }: { rows: WeeklyProductionModelRow[] }) {
  // 주차 전환 시 순서 흔들림 방지 — model_key 사전 순. 실적 0 모델은 숨겨 과밀 방지.
  const shown = [...rows]
    .sort((a, b) => a.model_key.localeCompare(b.model_key))
    .filter((r) => r.total_qty > 0);

  if (shown.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {shown.map((row) => (
        <div
          key={row.model_key}
          className="rounded-[16px] border px-3 py-2.5"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className={clsx(TYPO.title, "truncate")} style={{ color: LEGACY_COLORS.text }}>
              {row.model_label}
            </div>
            <span
              className={clsx(TYPO.caption, "shrink-0 rounded-full px-2 py-[2px] font-black tabular-nums")}
              style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
            >
              {row.total_qty.toLocaleString()}개
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {COLS.map((c) => {
              const val = row[c.key] as number;
              const hasVal = val > 0;
              const deptColor = getDepartmentFallbackColor(c.dept);
              return (
                <div
                  key={c.dept}
                  className="flex items-center justify-between gap-1 rounded-[10px] px-2 py-1"
                  style={{
                    background: hasVal
                      ? `color-mix(in srgb, ${deptColor} 12%, transparent)`
                      : LEGACY_COLORS.s3,
                  }}
                >
                  <span
                    className={clsx(TYPO.caption, "font-bold")}
                    style={{
                      color: hasVal
                        ? `color-mix(in srgb, ${deptColor} 45%, ${LEGACY_COLORS.text})`
                        : LEGACY_COLORS.muted2,
                    }}
                  >
                    {c.dept}
                  </span>
                  <span
                    className={clsx(TYPO.caption, "tabular-nums", hasVal ? "font-black" : "font-medium")}
                    style={{ color: hasVal ? LEGACY_COLORS.text : LEGACY_COLORS.muted2 }}
                  >
                    {fmt(val)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
