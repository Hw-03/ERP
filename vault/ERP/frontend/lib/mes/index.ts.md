---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/index.ts
tags: [vault, code-note, auto-generated, stub]
---

# index.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/mes/index.ts]]

## 원본 첫 줄

```
/**
 * MES 디자인 시스템 barrel — `@/lib/mes`.
 *
 * Round-3 도입. 새 코드는 본 진입점 사용 권장:
 *   import { formatQty, getDepartmentFallbackColor, MesTone } from "@/lib/mes";
 *
 * 호환:
 *   - 기존 `@/lib/mes-format`, `@/lib/mes-department`, `@/lib/mes-status` 그대로 유효
 *   - 본 barrel 은 위 3개 모듈을 동일 export 로 노출
 *
 * 향후 (Round-4+):
 *   - transaction.ts (TRANSACTION_META 기반 라벨/색 단일화)
 *   - color.ts (LEGACY_COLORS 정합화)
 *   - 본 barrel 이 mes-* 의 정본을 흡수
 */
export * from "./format";
export * from "./department";
export * from "./status";
export * from "./transaction";
export * from "./color";
export * from "./colorUtils";
```
