"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { AdminKpiBar } from "../_admin_primitives";
import type { BomStatus } from "./bomDept";

/**
 * 통계카드 4장 — 전체 / 완료 / 작업중 / 미착수.
 *
 * KPI 가 곧 부모 리스트 상태 필터 컨트롤. 카드 클릭 시 onChange 로 필터 전환.
 * 같은 카드를 다시 누르면(또는 "전체") ALL 로 해제.
 *
 * 다른 admin 화면(부서/직원/모델 등) 과 동일하게 AdminKpiBar → KpiCard(compact) 경로를 사용해
 * 톤·크기 일관성을 유지한다.
 */
export type StatusFilter = "ALL" | BomStatus;

interface Props {
  total: number;
  done: number;
  wip: number;
  todo: number;
  active: StatusFilter;
  onChange: (next: StatusFilter) => void;
  placement?: "block" | "header";
}

const CARDS: { id: StatusFilter; label: string; hint: string; tone: string }[] = [
  { id: "ALL", label: "전체", hint: "전체 부모 품목", tone: LEGACY_COLORS.muted },
  { id: "done", label: "완료", hint: "BOM 채움 완료", tone: LEGACY_COLORS.green },
  { id: "wip", label: "작업중", hint: "자식 일부 입력", tone: LEGACY_COLORS.blue },
  { id: "todo", label: "미착수", hint: "자식 없음", tone: LEGACY_COLORS.yellow },
];

export function BomStatsRow({ total, done, wip, todo, active, onChange, placement = "block" }: Props) {
  const values: Record<StatusFilter, number> = { ALL: total, done, wip, todo };

  return (
    <AdminKpiBar
      placement={placement}
      items={CARDS.map((c) => {
        const isActive = active === c.id;
        return {
          key: c.id,
          label: c.label,
          value: values[c.id],
          hint: c.hint,
          tone: c.tone,
          active: isActive,
          onClick: () => onChange(isActive && c.id !== "ALL" ? "ALL" : c.id),
        };
      })}
    />
  );
}
