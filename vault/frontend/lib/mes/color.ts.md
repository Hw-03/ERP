---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/color.ts
tags: [vault, code-note, auto-generated, stub]
---

# color.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/mes/color.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
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
```
