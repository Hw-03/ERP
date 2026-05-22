---
type: file-explanation
source_path: "frontend/lib/mes/color.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# color.ts — color.ts 설명

## 이 파일은 무엇을 책임지나

`color.ts`는 MES 화면에서 반복해서 쓰는 표시 규칙, 색상, 포맷, 상태값을 정리한 공용 파일입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `optionColor`
- `employeeColor`
- `LEGACY_COLORS`
- `OPTION_COLOR`

## 연결되는 파일

- [[ERP/frontend/lib/mes/📁_mes]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
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
```
