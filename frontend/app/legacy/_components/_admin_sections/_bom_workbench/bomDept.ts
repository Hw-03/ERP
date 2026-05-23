/**
 * BOM Workbench 부서/단계 유틸 — process_type_code 기반.
 *
 * process_type_code 형식: 두 글자 (예: "TR", "HA", "AF").
 *   - 첫 글자  = 부서 (T/H/V/N/A/P)
 *   - 두 번째 = 단계 (R=원자재, A=중간공정, F=공정완료)
 *
 * 색상은 `@/lib/mes-department` 의 fallback 시스템을 사용 — DB color_hex 가
 * 우선이지만 본 도구는 정적 매핑(부서명 → fallback)만으로 충분.
 */
import { getDepartmentFallbackColor } from "@/lib/mes-department";
import { LEGACY_COLORS } from "@/lib/mes/color";

export const DEPT_LETTERS = ["T", "H", "V", "N", "A", "P"] as const;
export type DeptLetter = (typeof DEPT_LETTERS)[number];
export type BomDeptFilter = DeptLetter | "ALL";

export const DEPT_LETTER_TO_NAME: Record<DeptLetter, string> = {
  T: "튜브",
  H: "고압",
  V: "진공",
  N: "튜닝",
  A: "조립",
  P: "출하",
};

export type StageLetter = "R" | "A" | "F";

export const STAGE_LABEL: Record<StageLetter, string> = {
  R: "원자재",
  A: "중간공정",
  F: "공정완료",
};

/** process_type_code → 부서 letter (첫 글자). 매핑되지 않으면 null. */
export function deptOf(pt: string | null | undefined): DeptLetter | null {
  const c = pt?.[0];
  return c && (DEPT_LETTERS as readonly string[]).includes(c) ? (c as DeptLetter) : null;
}

/** process_type_code → 단계 letter (두 번째 글자). */
export function stageOf(pt: string | null | undefined): StageLetter | null {
  const c = pt?.[1];
  if (c === "R" || c === "A" || c === "F") return c;
  return null;
}

/** 부서 letter → 색상 (DB color_hex 없을 때의 fallback). */
export function deptColor(letter: DeptLetter): string {
  return getDepartmentFallbackColor(DEPT_LETTER_TO_NAME[letter]);
}

/** 부서 letter → 한글 라벨. */
export function deptLabel(letter: DeptLetter): string {
  return DEPT_LETTER_TO_NAME[letter];
}

/** 색상 + 12% 투명 배경 (배지용). CSS color-mix 사용. */
export function deptBadgeBg(letter: DeptLetter): string {
  return `color-mix(in srgb, ${deptColor(letter)} 12%, transparent)`;
}

/**
 * BOM 완료 워크플로우 상태.
 *   - done : bom_completed_at 있음 (사용자가 명시적으로 완료 표시)
 *   - wip  : 미완료 + BOM 자식 1개 이상
 *   - todo : 미완료 + BOM 자식 0개
 */
export type BomStatus = "done" | "wip" | "todo";

export function bomStatusOf(
  itemId: string,
  completedSet: Set<string>,
  childCountMap: Map<string, number>,
): BomStatus {
  if (completedSet.has(itemId)) return "done";
  return (childCountMap.get(itemId) ?? 0) > 0 ? "wip" : "todo";
}

export const BOM_STATUS_META: Record<BomStatus, { label: string; color: string }> = {
  done: { label: "완료", color: LEGACY_COLORS.green },
  wip: { label: "작업중", color: LEGACY_COLORS.blue },
  todo: { label: "미착수", color: LEGACY_COLORS.muted2 },
};
