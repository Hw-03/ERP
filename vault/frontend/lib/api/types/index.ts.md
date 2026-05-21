---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/types/index.ts
tags: [vault, code-note, auto-generated, stub]
---

# index.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/api/types/index.ts]]

## 원본 첫 줄

```
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
export type * from "./catalog";
export type * from "./production";
export type * from "./stock-requests";
export type * from "./departments";
export type * from "./weekly";
export type * from "./dept-adjustment";
export type * from "./io";
```
