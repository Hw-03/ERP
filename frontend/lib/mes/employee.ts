/**
 * MES 직원 (Employee) 유틸 — `@/lib/mes/employee`.
 *
 * Round-10D (#1) 신설. legacyUi.ts 의 직원 관련 순수 함수 정본 위치.
 */

/**
 * 직원 이름의 첫 글자 추출 (avatar 표기용).
 * 빈 문자열 / null / undefined 입력 시 "?" 반환.
 */
export function firstEmployeeLetter(name?: string | null): string {
  if (!name) return "?";
  return name.trim().slice(0, 1);
}
