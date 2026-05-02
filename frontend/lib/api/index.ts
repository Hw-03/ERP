/**
 * API barrel — `@/lib/api/index` 로 import 할 수 있는 진입점.
 *
 * 본 라운드 (Round-3) 에서는 기존 `@/lib/api` 와 동일 export 를 그대로 노출한다.
 * 도메인별 분리 (items/inventory/employees/...) 는 Round-4 에서 진행.
 *
 * 호환:
 *   - 기존 `@/lib/api` import 는 그대로 유효
 *   - 새 코드는 `@/lib/api/index` 또는 `@/lib/api/core` 사용 가능
 */
export * from "../api";
