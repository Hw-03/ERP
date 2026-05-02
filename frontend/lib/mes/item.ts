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
 * Item 검색 박스 표시용 라벨 — "ERP코드 / 품목명".
 */
export function buildItemSearchLabel(item: Item): string {
  return `${item.erp_code} / ${item.item_name}`;
}

/**
 * Item 의 legacy_model 필드 → 표시용 모델명. 빈/공백은 "공용".
 */
export function normalizeModel(value?: string | null): string {
  return value && value.trim() ? value : "공용";
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
  if (kpi === "정상") return qty > 0 && !(min != null && qty < min);
  if (kpi === "부족") return qty > 0 && min != null && qty < min;
  if (kpi === "품절") return qty <= 0;
  return true;
}

export interface GroupedItem {
  key: string;
  representative: Item;
  quantity: number;
  count: number;
}

/**
 * Item[] 을 품목명 (대소문자 무시 + trim) 기준으로 그룹화.
 * 각 그룹은 첫 등장 Item 을 representative 로, 수량/개수 합산.
 */
export function groupedItems(items: Item[]): GroupedItem[] {
  const map = new Map<string, GroupedItem>();
  for (const item of items) {
    const key = item.item_name.trim().toLowerCase();
    const current = map.get(key);
    if (current) {
      current.quantity += Number(item.quantity);
      current.count += 1;
    } else {
      map.set(key, {
        key,
        representative: item,
        quantity: Number(item.quantity),
        count: 1,
      });
    }
  }
  return Array.from(map.values());
}
