/**
 * MES 색상 토큰 — `@/lib/mes/color`.
 *
 * Round-5 (R5-7) 신설. 색상 상수 / 부서 색상 진입점 통합.
 *
 * 흡수 대상:
 *   - LEGACY_COLORS (legacyUi.ts) — CSS variable 기반 토큰
 *   - MES_DEPARTMENT_COLORS (mes-department.ts) — 부서 fallback
 *   - getDepartmentFallbackColor (mes-department.ts) — 단일 호출 진입점
 *
 * 새 코드는 `@/lib/mes/color` 또는 `@/lib/mes` barrel 사용.
 */
export {
  MES_DEPARTMENT_COLORS,
  getDepartmentFallbackColor,
  getDepartmentInitial,
  normalizeDepartmentName,
} from "../mes-department";

// LEGACY_COLORS 는 legacyUi.ts 정본 — 호환 위해 re-export.
// 새 코드는 `@/lib/mes/color` 에서 LEGACY_COLORS 참조 가능.
export { LEGACY_COLORS } from "@/app/legacy/_components/legacyUi";
