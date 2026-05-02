/**
 * DEXCOWIN MES — API 타입 barrel.
 *
 * Round-4 (R4-2) 분리, Round-10A (#2) 정본 flip:
 *   - 본 파일은 도메인별 타입 모듈을 한 번에 노출하는 barrel.
 *   - 정본은 `frontend/lib/api/types/<domain>.ts` 에 있음.
 *
 * 새 코드는 다음 중 하나로 import:
 *   import type { Item } from "@/lib/api/types/items";          // 권장 (직접)
 *   import type { Item } from "@/lib/api/types";                 // 호환 (barrel)
 *   import type { Item } from "@/lib/api";                       // 호환 (top barrel)
 */

export type * from "./types/shared";
export type * from "./types/items";
export type * from "./types/inventory";
export type * from "./types/employees";
export type * from "./types/departments";
export type * from "./types/catalog";
export type * from "./types/operations";
export type * from "./types/production";
export type * from "./types/queue";
export type * from "./types/stock-requests";
