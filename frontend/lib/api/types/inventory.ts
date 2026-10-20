/**
 * Inventory 도메인 타입 — `@/lib/api/types/inventory`.
 * Round-10A (#2) 본문 이전.
 */

import type { ProcessTypeSummary } from "./shared";
import type { WorkStockLocation } from "./work-reservations";

/** 예약은 정상 재고에 대한 값. 예정은 물리 증감이며 가용량에 더하지 않는다. */
export interface InventoryReservationQuantities {
  work_reserved_quantity: number;
  approval_reserved_quantity: number;
  shipping_reserved_quantity: number;
}

export interface InventoryForecastQuantities {
  /** 이동을 제외한 입고/생산 및 소비/출고 예정. 불량 목적지는 해당 셀에 표시한다. */
  expected_in_quantity: number;
  expected_out_quantity: number;
  transfer_in_quantity: number;
  transfer_out_quantity: number;
}

export interface InventoryLocationReservation extends InventoryReservationQuantities {
  location: WorkStockLocation;
}

export interface InventoryLocationForecast extends InventoryForecastQuantities {
  location: WorkStockLocation;
}

/** 정상 재고 전체 예약과 전체 물리 증감 예정. locations의 가짜 실재고 행을 만들지 않는다. */
export interface InventoryReservationSummary extends InventoryReservationQuantities, InventoryForecastQuantities {
  /** 과거 승인 효과 연결이 불완전하면 false. 확인 가능한 예정량만 포함한다. */
  forecast_complete: boolean;
  reservation_by_location: InventoryLocationReservation[];
  forecast_by_location: InventoryLocationForecast[];
}

export interface InventorySummary {
  process_types: ProcessTypeSummary[];
  total_items: number;
  total_quantity: number;
}

