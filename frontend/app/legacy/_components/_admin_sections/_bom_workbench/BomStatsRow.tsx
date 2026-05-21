"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import type { BomStatus } from "./bomDept";

/**
 * 통계카드 4장 — 전체 / 완료 / 작업중 / 미착수.
 *
 * KPI 가 곧 부모 리스트 상태 필터 컨트롤. 카드 클릭 시 onChange 로 필터 전환.
 * 같은 카드를 다시 누르면(또는 "전체") ALL 로 해제.
 */
export type StatusFilter = "ALL" | BomStatus;

interface Props {
  total: number;
  done: number;
  wip: number;
  todo: number;
  active: StatusFilter;
  onChange: (next: StatusFilter) => void;
}

const CARDS: { id: StatusFilter; label: string; color: string }[] = [
  { id: "ALL", label: "전체", color: LEGACY_COLORS.muted },
  { id: "done", label: "완료", color: LEGACY_COLORS.green },
  { id: "wip", label: "작업중", color: LEGACY_COLORS.blue },
  { id: "todo", label: "미착수", color: LEGACY_COLORS.yellow },
];

export function BomStatsRow({ total, done, wip, todo, active, onChange }: Props) {
  const values: Record<StatusFilter, number> = { ALL: total, done, wip, todo };

  return (
    <div className="grid grid-cols-4 gap-2">
      {CARDS.map((c) => {
        const isActive = active === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(isActive && c.id !== "ALL" ? "ALL" : c.id)}
            className="rounded-xl border px-3 py-2 text-left transition-colors hover:brightness-105"
            style={{
              background: isActive
                ? `color-mix(in srgb, ${c.color} 14%, transparent)`
                : LEGACY_COLORS.s1,
              borderColor: isActive ? c.color : LEGACY_COLORS.border,
            }}
            title={c.id === "ALL" ? "전체 보기" : `${c.label}만 보기`}
          >
            <div
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {c.label}
            </div>
            <div className="mt-0.5 text-xl font-bold leading-tight" style={{ color: c.color }}>
              {values[c.id]}
              <span className="ml-0.5 text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>
                건
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
