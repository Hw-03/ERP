/**
 * MES 공정 (Process Stage) 모듈 — `@/lib/mes/process`.
 *
 * Round-10D (#5) 신설. ERP 코드 2번째 segment (TR/TA/TF/HR/...) → 라벨 매핑.
 * Round-10E (#1) 추가: `PROCESS_TO_DEPT` + `erpCodeDept` + `erpCodeDeptBadge`
 * — 부서명 매핑은 ERP 코드 static 매핑이라 부서 정규화 충돌과 무관.
 */

/**
 * ERP 코드 process stage 코드 → 한국어 라벨.
 *   - 첫 글자: 부서 (T=튜브, H=고압, V=진공, N=튜닝, A=조립, P=출하)
 *   - 두 번째 글자: 단계 (R=Raw, A=Assembly, F=Final)
 */
export const PROCESS_LABEL: Record<string, string> = {
  TR: "Tube Raw",
  TA: "Tube Ass'y",
  TF: "Tube Final",
  HR: "High-v Raw",
  HA: "High-v Ass'y",
  HF: "High-v Final",
  VR: "Vacuum Raw",
  VA: "Vacuum Ass'y",
  VF: "Vacuum Final",
  NR: "Neck Raw",
  NA: "Neck Ass'y",
  NF: "Neck Final",
  AR: "Assembly Raw",
  AA: "Assembly",
  AF: "Assembly Final",
  PR: "Pack Raw",
  PA: "Packaging",
  PF: "Pack Final",
};

/**
 * stage 코드 → 라벨 반환. 빈 입력은 "-", 미매핑 코드는 입력 그대로.
 */
export function processStageLabel(code?: string | null): string {
  if (!code) return "-";
  return PROCESS_LABEL[code] ?? code;
}

/**
 * ERP 코드 process stage 코드 → 부서명 매핑.
 * 첫 글자 (T/H/V/N/A/P) 가 부서를 결정.
 */
export const PROCESS_TO_DEPT: Record<string, string> = {
  TR: "튜브", TA: "튜브", TF: "튜브",
  HR: "고압", HA: "고압", HF: "고압",
  VR: "진공", VA: "진공", VF: "진공",
  NR: "튜닝", NA: "튜닝", NF: "튜닝",
  AR: "조립", AA: "조립", AF: "조립",
  PR: "출하", PA: "출하", PF: "출하",
};

/**
 * ERP 코드 (예: "ITM-TR-00123") → 부서명. 형식 어긋나거나 stage 미매핑이면 null.
 */
export function erpCodeDept(erp_code?: string | null): string | null {
  if (!erp_code) return null;
  const parts = erp_code.split("-");
  if (parts.length < 2) return null;
  return PROCESS_TO_DEPT[parts[1]] ?? null;
}

/**
 * ERP 코드 + 색상 lookup 함수 → 부서 배지 메타 (label/color/bg).
 * `getColor` 는 require parameter — 호출처가 항상 `useDeptColorLookup()` 결과를 전달.
 */
export function erpCodeDeptBadge(
  erp_code: string | null | undefined,
  getColor: (name?: string | null) => string,
): { label: string; color: string; bg: string } | null {
  const dept = erpCodeDept(erp_code);
  if (!dept) return null;
  const color = getColor(dept);
  return { label: dept, color, bg: `color-mix(in srgb, ${color} 12%, transparent)` };
}

/**
 * legacy_part 필드 → 표시용 라벨. 빈 입력은 "-", 미매핑은 입력 그대로.
 *
 * Round-10E (#2) 정본 이전. 현재 매핑 6항목은 모두 identity 변환이지만,
 * 향후 별칭 (예: "조립" → "조립부") 추가 가능성 위해 분리 유지.
 */
export const LEGACY_PART_LABELS: Record<string, string> = {
  "자재창고": "자재창고",
  "조립출하": "조립출하",
  "고압파트": "고압파트",
  "진공파트": "진공파트",
  "튜닝파트": "튜닝파트",
  "출하": "출하",
};

export function displayPart(value?: string | null): string {
  if (!value) return "-";
  return LEGACY_PART_LABELS[value] ?? value;
}
