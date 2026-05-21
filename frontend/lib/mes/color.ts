/**
 * MES 색상 토큰 — `@/lib/mes/color`.
 *
 * Round-5 (R5-7) 신설. 색상 상수 / 부서 색상 진입점 통합.
 * Round-10A (#3) 정본 flip — LEGACY_COLORS 본문이 본 파일로 이전됐다.
 * Round-10D (#3) — OPTION_COLOR/optionColor 정본 이전.
 * Round-10F (#2) — employeeColor 정본 이전 (정책 (A) 적용 후 mes-department 와 통합).
 *
 * 새 코드는 `@/lib/mes/color` 또는 `@/lib/mes` barrel 사용.
 */
import { getDepartmentFallbackColor } from "../mes-department";
export {
  MES_DEPARTMENT_COLORS,
  getDepartmentFallbackColor,
  getDepartmentInitial,
  normalizeDepartmentName,
} from "../mes-department";

/**
 * 디자인시스템 CSS 변수 토큰 17종 — light/dark 테마에서 자동 전환.
 * 컴포넌트는 inline `style={{ background: LEGACY_COLORS.s1 }}` 형태로 참조.
 */
export const LEGACY_COLORS = {
  bg: "var(--c-bg)",
  s1: "var(--c-s1)",
  s2: "var(--c-s2)",
  s3: "var(--c-s3)",
  s4: "var(--c-s4)",
  border: "var(--c-border)",
  borderStrong: "var(--c-border-strong)",
  blue: "var(--c-blue)",
  green: "var(--c-green)",
  red: "var(--c-red)",
  yellow: "var(--c-yellow)",
  purple: "var(--c-purple)",
  cyan: "var(--c-cyan)",
  text: "var(--c-text)",
  muted: "var(--c-muted)",
  muted2: "var(--c-muted2)",
  panelGlow: "var(--c-panel-glow)",
  // Round-16 #3: 흰색 (accent foreground 용 — 테마 무관 상수)
  white: "#ffffff",
} as const;

/**
 * 옵션 코드 (BG/WM/SV) → 색상 매핑.
 */
export const OPTION_COLOR: Record<string, string> = {
  BG: "#60a5fa",
  WM: "#f97316",
  SV: "#a3a3a3",
};

/**
 * 옵션 코드의 색상 반환. 미매핑 또는 빈 입력 시 muted 색상 fallback.
 */
export function optionColor(code?: string | null): string {
  if (!code) return LEGACY_COLORS.muted2;
  return OPTION_COLOR[code] ?? LEGACY_COLORS.muted2;
}

/**
 * 부서명 → 직원 / 부서 색상.
 *
 * Round-10F (#2) 정본 이전 — `getDepartmentFallbackColor` 위임.
 *   - 정책 (A) 적용 후 동작 동일성 검증 완료: legacyUi.employeeColor 의 hex 값과
 *     `MES_DEPARTMENT_COLORS` 값 완전 일치 (조립/고압/진공/튜닝/튜브/서비스/AS/연구/영업/출하/기타).
 *   - 빈 / null / undefined → "기타" 의 fallback (#475569 slate-600).
 *   - "연구소" 같은 alias 도 `normalizeDepartmentName` 이 흡수 (Round-10F 통일 정책).
 */
export function employeeColor(value?: string | null): string {
  return getDepartmentFallbackColor(value ?? "");
}
