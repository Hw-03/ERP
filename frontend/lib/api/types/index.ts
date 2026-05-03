/**
 * Types barrel — `@/lib/api/types`.
 *
 * Round-7 (R7-T) 도입. 새 코드는 도메인별 직접 import 권장:
 *   import type { Item } from "@/lib/api/types/items";
 *   import type { Employee } from "@/lib/api/types/employees";
 *
 * 기존 `@/lib/api/types` import 도 그대로 유효 (본 barrel 이 모두 흡수).
 */
export type * from "./shared";
export type * from "./items";
export type * from "./inventory";
export type * from "./employees";
export type * from "./queue";
export type * from "./operations";
export type * from "./catalog";
export type * from "./production";
export type * from "./stock-requests";
export type * from "./departments";
export type * from "./weekly";
