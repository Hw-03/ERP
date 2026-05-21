---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_sections/transactionTaxonomy.ts
tags: [vault, code-note, auto-generated, stub]
---

# transactionTaxonomy.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_history_sections/transactionTaxonomy.ts]]

## 원본 첫 줄

```
/**
 * transactionTaxonomy.ts — 거래 타입 분류 상수·술어·scope 모델.
 * C3: historyShared.ts 에서 추출. 소비자는 historyShared 재export 또는 직접 import.
 */
import type { TransactionType } from "@/lib/api/types/shared";
import type { IoBatch } from "@/lib/api/types/io";

// ──────────────────────────────────────────────────────────────────
// Scope 모델
// ──────────────────────────────────────────────────────────────────

export type HistoryScope = "ALL" | "WAREHOUSE_INVOLVED" | "DEPT_INTERNAL";

export const SCOPE_LABELS: Record<HistoryScope, string> = {
  ALL: "전체",
  WAREHOUSE_INVOLVED: "창고",
  DEPT_INTERNAL: "부서",
};

/**
 * 사용자별 입출고 내역 기본 scope.
 * warehouse_role 이 "primary" 또는 "deputy" 이면 창고 담당 → WAREHOUSE_INVOLVED.
 * 그 외(none 포함) → DEPT_INTERNAL.
 */
export function getDefaultHistoryScopeForOperator(
  operator: { warehouse_role?: string | null } | null,
): HistoryScope {
  const role = operator?.warehouse_role?.toLowerCase();
  if (role === "primary" || role === "deputy") return "WAREHOUSE_INVOLVED";
  return "DEPT_INTERNAL";
```
