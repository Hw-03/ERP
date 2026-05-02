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

/**
 * legacy 재고 필터 옵션 상수.
 *   - LEGACY_FILE_TYPES — 자료 종류 필터 (현재 "전체" 단일)
 *   - LEGACY_PARTS — 파트 (자재창고/조립출하/부서별 파트)
 *   - LEGACY_MODELS — 제품 모델 (X-Ray 장비 모델명)
 *
 * UI 의 select / chip 옵션 메타. Item 자체의 legacy_part / legacy_model 필드 값과
 * 매핑되며, "전체" 는 필터 미적용 의미 (DB 값 아님).
 */
export const LEGACY_FILE_TYPES = ["전체"] as const;
export const LEGACY_PARTS = ["전체", "자재창고", "조립출하", "고압파트", "진공파트", "튜닝파트"] as const;
export const LEGACY_MODELS = ["전체", "DX3000", "ADX4000W", "ADX6000", "COCOON", "SOLO"] as const;
