---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/item.ts
tags: [vault, code-note, auto-generated, stub]
---

# item.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/mes/item.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
/**
 * MES Item 도메인 유틸 — `@/lib/mes/item`.
 *
 * Round-10E (#6/7/8) 신설. legacyUi.ts 의 Item 도메인 4 함수 정본 위치.
 *
 * 본 모듈의 모든 함수는 메모리상 Item 객체를 입력으로 받아 가공만 한다 —
 * 네트워크 호출/스키마 변경/DB 의존 없음. lib/api/items.ts 와는 책임 분리:
 *   - `lib/api/items.ts` — CRUD / fetch
 *   - `lib/mes/item.ts` — 표시/판정/그룹핑 utility
 */

import type { Item } from "@/lib/api";

/**
 * Item 검색 박스 표시용 라벨 — "품목코드 / 품목명".
 */
export function buildItemSearchLabel(item: Item): string {
  return `${item.item_code} / ${item.item_name}`;
}

/**
 * Item 이 KPI 라벨 ("정상" / "부족" / "품절") 에 해당하는지 판정.
 *   - 정상: quantity > 0 && (min_stock 무 || quantity >= min_stock)
 *   - 부족: quantity > 0 && min_stock != null && quantity < min_stock
 *   - 품절: quantity <= 0
 *   - 그 외 (전체 등): true
 */
export function itemMatchesKpi(item: Item, kpi: string): boolean {
  const qty = Number(item.quantity);
  const min = item.min_stock == null ? null : Number(item.min_stock);
```
