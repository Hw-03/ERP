/**
 * MES 색상 토큰 — `@/lib/mes/color`.
 *
 * Round-5 (R5-7) 신설. 색상 상수 / 부서 색상 진입점 통합.
 * Round-10A (#3) 정본 flip — LEGACY_COLORS 본문이 본 파일로 이전됐다.
 * legacyUi.ts 는 이제 본 파일에서 re-export.
 *
 * 새 코드는 `@/lib/mes/color` 또는 `@/lib/mes` barrel 사용.
 */
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
} as const;
