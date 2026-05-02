/**
 * DEXCOWIN MES 부서 디자인 시스템
 *
 * 우선순위 원칙 (절대 위반 금지):
 *   1. DB 의 `departments.color_hex` 가 있으면 **그것을 우선** 사용한다.
 *   2. color_hex 가 null/undefined/공백일 때만 본 모듈의 fallback 을 사용한다.
 *   3. 본 모듈은 부서 이름만 가지고 색을 결정한다 — DB 호출이나 캐시 없음.
 *
 * Round-10F (#1) 정책 통일:
 *   - DB DepartmentEnum.value 와 화면 표기 모두 "연구" 단일.
 *     기존 legacyUi.DEPARTMENT_LABELS["연구"]="연구소" 는 본 라운드에서 폐기.
 *   - DEPARTMENT_LABELS / DEPARTMENT_ICONS 정본을 본 모듈에 흡수.
 *   - normalizeDepartment (legacyUi 호환) 는 본 모듈에서 제공.
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

/**
 * 화면 표기용 부서 라벨 — DB DepartmentEnum.value 그대로 사용.
 *
 * Round-10F (#1) 정책 통일:
 *   - 기존 legacyUi.DEPARTMENT_LABELS 의 "연구"→"연구소" 매핑은 폐기. DB 표기 단일화.
 *   - 모든 키가 identity 이지만, 향후 부서 추가/별칭 위해 객체 형태 유지.
 */
export const DEPARTMENT_LABELS: Record<string, string> = {
  "조립": "조립",
  "고압": "고압",
  "진공": "진공",
  "튜닝": "튜닝",
  "튜브": "튜브",
  "AS": "AS",
  "연구": "연구",
  "영업": "영업",
  "출하": "출하",
  "기타": "기타",
};

/**
 * 부서 한 글자 아이콘 (legacyUi.DEPARTMENT_ICONS 정본 이전).
 * `MES_DEPARTMENT_INITIALS` 와 다른 점: "서비스" 키 부재 (legacyUi 호환).
 */
export const DEPARTMENT_ICONS: Record<string, string> = {
  "조립": "조",
  "고압": "고",
  "진공": "진",
  "튜닝": "튜",
  "튜브": "튜",
  "AS": "A",
  "연구": "연",
  "영업": "영",
  "출하": "출",
  "기타": "기",
};

/**
 * 부서 이름 → 화면 표기 라벨. legacyUi.normalizeDepartment 호환.
 *   - null/undefined/empty → "기타"
 *   - DEPARTMENT_LABELS 에 키가 있으면 라벨 반환 (정책 (A) "연구" 통일)
 *   - 미등록 키는 입력 그대로
 */
export function normalizeDepartment(value?: string | null): string {
  if (!value) return "기타";
  return DEPARTMENT_LABELS[value] ?? value;
}
