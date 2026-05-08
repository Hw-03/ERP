"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";

/**
 * 통계카드 3장 — 전체 / 매칭완료(BOM 있음) / 미매칭(BOM 없음).
 *
 * 좌측 상단의 부서 컨텍스트 안에서 부모 후보(R 단계 제외)의 매칭 비율을 표시.
 */
interface Props {
  total: number;
  matched: number;
  unmatched: number;
}

const CARDS = [
  { id: "total", label: "전체", color: LEGACY_COLORS.blue },
  { id: "matched", label: "매칭완료", color: LEGACY_COLORS.green },
  { id: "unmatched", label: "미매칭", color: LEGACY_COLORS.yellow },
] as const;

export function BomStatsRow({ total, matched, unmatched }: Props) {
  const values: Record<(typeof CARDS)[number]["id"], number> = { total, matched, unmatched };

  return (
    <div className="grid grid-cols-3 gap-2">
      {CARDS.map((c) => (
        <div
          key={c.id}
          className="rounded-xl border px-3 py-2"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: LEGACY_COLORS.muted2 }}>
            {c.label}
          </div>
          <div className="mt-0.5 text-xl font-bold leading-tight" style={{ color: c.color }}>
            {values[c.id]}
            <span className="ml-0.5 text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>
              건
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
