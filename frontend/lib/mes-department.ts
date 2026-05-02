/**
 * DEXCOWIN MES 부서 디자인 시스템
 *
 * 우선순위 원칙 (절대 위반 금지):
 *   1. DB 의 `departments.color_hex` 가 있으면 **그것을 우선** 사용한다.
 *   2. color_hex 가 null/undefined/공백일 때만 본 모듈의 fallback 을 사용한다.
 *   3. 본 모듈은 부서 이름만 가지고 색을 결정한다 — DB 호출이나 캐시 없음.
 *
 * 호환:
 *   - 기존 frontend/app/legacy/_components/legacyUi.ts::employeeColor 와
 *     동일한 hex 를 그대로 쓴다 (값 일치 — 점진 마이그레이션 시 시각 변화 0).
 *   - 본 모듈은 employeeColor 를 import 하지 않는다 (순환 방지 + 단일 소스).
 *   - employeeColor 자체는 호출처 5곳 영향이 있어 이번 PR 에선 유지한다.
 *     다음 단계에서 employeeColor 본문을 본 모듈로 위임하는 wrapper 형태로 정리 예정.
 *
 * 부서 이름 정규화:
 *   - DB / API 가 반환하는 enum value (예: "조립", "고압") 를 입력으로 받는다.
 *   - 빈 값 / 공백 / 별칭 ("연구소" → "연구") 은 normalizeDepartmentName 으로 흡수한다.
 */

const FALLBACK_COLOR = "#475569"; // slate-600 — 미정의 부서 기본
const FALLBACK_INITIAL = "기"; // "기타"

const DEPARTMENT_ALIAS: Record<string, string> = {
  "연구소": "연구",
  "AS팀": "AS",
  "출하팀": "출하",
};

/**
 * 부서별 fallback 색상 (DB color_hex 부재 시에만 사용).
 * 키는 정규화된 부서 이름.
 */
export const MES_DEPARTMENT_COLORS: Record<string, string> = {
  "조립": "#1d4ed8", // blue-700
  "고압": "#c2410c", // orange-700
  "진공": "#6d28d9", // violet-700
  "튜닝": "#0e7490", // cyan-700
  "튜브": "#4d7c0f", // lime-700
  "서비스": "#047857", // emerald-700
  "AS": "#be185d", // pink-700
  "연구": "#b45309", // amber-700
  "영업": "#b91c1c", // red-700
  "출하": "#0f766e", // teal-700
  "기타": FALLBACK_COLOR,
};

/**
 * 부서 이니셜 (한 글자, 카드/배지에 사용).
 */
const MES_DEPARTMENT_INITIALS: Record<string, string> = {
  "조립": "조",
  "고압": "고",
  "진공": "진",
  "튜닝": "튜",
  "튜브": "튜",
  "서비스": "서",
  "AS": "A",
  "연구": "연",
  "영업": "영",
  "출하": "출",
  "기타": "기",
};

/**
 * 부서 이름 정규화.
 *   - null/undefined/공백 → "기타"
 *   - 별칭 ("연구소") → 표준 키 ("연구")
 *   - 그 외에는 입력값 trim 후 그대로 반환
 *
 * **주의:** 이 함수는 화면 표시용 라벨이 아니다.
 *   화면 라벨은 DB 의 `departments.name` 이나 legacyUi.DEPARTMENT_LABELS 사용.
 */
export function normalizeDepartmentName(value: string | null | undefined): string {
  if (value === null || value === undefined) return "기타";
  const trimmed = value.trim();
  if (trimmed === "") return "기타";
  return DEPARTMENT_ALIAS[trimmed] ?? trimmed;
}

/**
 * DB color_hex 가 없을 때 사용할 fallback 색상.
 *
 * **호출 측 의무:** 반드시 `dept.color_hex ?? getDepartmentFallbackColor(dept.name)` 형태로
 * DB 우선순위를 지킨다. 본 함수만 단독 사용하면 DB 가 가진 사용자 지정 색을 덮는다.
 */
export function getDepartmentFallbackColor(departmentName: string): string {
  const key = normalizeDepartmentName(departmentName);
  return MES_DEPARTMENT_COLORS[key] ?? FALLBACK_COLOR;
}

/**
 * 부서 이니셜 한 글자.
 */
export function getDepartmentInitial(departmentName: string): string {
  const key = normalizeDepartmentName(departmentName);
  return MES_DEPARTMENT_INITIALS[key] ?? FALLBACK_INITIAL;
}
