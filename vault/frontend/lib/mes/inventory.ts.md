---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/inventory.ts
tags: [vault, code-note, auto-generated, stub]
---

# inventory.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/mes/inventory.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
/**
 * MES 재고 (Inventory) 유틸 — `@/lib/mes/inventory`.
 *
 * Round-10D (#6) 신설. legacyUi.ts 의 재고 상태 판정 정본 위치.
 * Round-10E (#3) 추가: legacy 재고 필터 옵션 상수 (FILE_TYPES/PARTS/MODELS) 흡수.
 */

import { LEGACY_COLORS } from "./color";

export interface StockState {
  label: "정상" | "부족" | "품절";
  color: string;
}

/**
 * 재고 수량 + 최소재고 → 상태 라벨/색상.
 *   - quantity <= 0: 품절 (red)
 *   - 0 < quantity < minStock: 부족 (yellow)
 *   - else: 정상 (green)
 *   - minStock null/undefined: 정상 판정 (부족 분기 미적용)
 */
export function getStockState(quantity: number, minStock?: number | null): StockState {
  if (quantity <= 0) {
    return { label: "품절", color: LEGACY_COLORS.red };
  }
  if (minStock != null && quantity < minStock) {
    return { label: "부족", color: LEGACY_COLORS.yellow };
  }
  return { label: "정상", color: LEGACY_COLORS.green };
}
```
