/**
 * MES 재고 (Inventory) 유틸 — `@/lib/mes/inventory`.
 *
 * Round-10D (#6) 신설. legacyUi.ts 의 재고 상태 판정 정본 위치.
 *
 * 주의: groupedItems / itemMatchesKpi / normalizeModel / buildItemSearchLabel 등
 * Item 도메인 의존 함수는 Round-10E 별도 사이클에서 정본 이전 (Item 도메인 모듈
 * 신설 vs lib/api/items.ts 통합 결정 후).
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
