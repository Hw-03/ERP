/**
 * MES 공정 (Process Stage) 모듈 — `@/lib/mes/process`.
 *
 * Round-10D (#5) 신설. ERP 코드 2번째 segment (TR/TA/TF/HR/...) → 라벨 매핑.
 *
 * 주의: `PROCESS_TO_DEPT` 상수 + `erpCodeDept` 함수는 부서명 정규화 충돌(Round-10E)
 * 검증 후 별도 사이클에서 정본 이전 — 본 모듈에 추가하지 않음.
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
