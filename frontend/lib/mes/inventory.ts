/**
 * MES 재고 (Inventory) 유틸 — `@/lib/mes/inventory`.
 *
 * Round-10D (#6) 신설. legacyUi.ts 의 재고 상태 판정 정본 위치.
 * Round-10E (#3) 추가: legacy 재고 필터 옵션 상수 (FILE_TYPES/PARTS/MODELS) 흡수.
 */

import { LEGACY_COLORS } from "./color";

type InventoryLocationLike = {
  department: string;
  status: string;
  quantity: number;
  pending_quantity?: number;
  available_quantity?: number;
};

type InventoryItemLike = {
  warehouse_qty: number;
  pending_quantity?: number;
  department_pending_quantity?: number;
  warehouse_available_quantity?: number;
  locations?: InventoryLocationLike[];
};

type InventoryLineLike = {
  from_bucket: string;
  from_department?: string | null;
  to_bucket: string;
  to_department?: string | null;
};

function quantityOrZero(value: unknown): number {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? quantity : 0;
}

/** 창고 예약만 계산한다. 부서 승인 예약은 이 값에 포함하지 않는다. */
export function warehousePending(item: Pick<InventoryItemLike, "pending_quantity">): number {
  return Math.max(0, quantityOrZero(item.pending_quantity));
}

/** 창고 출고 한도는 API 정본 가용량을 우선하고, 구버전 응답만 요청 예약으로 계산한다. */
export function warehouseAvailable(item: Pick<
  InventoryItemLike,
  "warehouse_qty" | "pending_quantity" | "warehouse_available_quantity"
>): number {
  const available = Number(item.warehouse_available_quantity);
  if (Number.isFinite(available)) return Math.max(0, available);
  return Math.max(0, quantityOrZero(item.warehouse_qty) - warehousePending(item));
}

/** 부서와 재고 상태가 모두 일치하는 위치를 찾는다. */
export function findInventoryLocation<T extends InventoryLocationLike>(
  item: { locations?: T[] },
  department: string | null | undefined,
  status: "PRODUCTION" | "DEFECTIVE",
): T | undefined {
  if (!department) return undefined;
  return item.locations?.find((location) => location.department === department && location.status === status);
}

/** 위치별 예약 수량은 새 API 필드가 없으면 0으로 처리한다. */
export function locationPending(location: Pick<InventoryLocationLike, "pending_quantity"> | undefined): number {
  return Math.max(0, quantityOrZero(location?.pending_quantity));
}

/** 위치별 출고 한도는 API 가용 수량을 우선하고, 없으면 실재고에서 위치 예약을 뺀다. */
export function locationAvailable(location: InventoryLocationLike | undefined): number {
  if (!location) return 0;
  const available = Number(location.available_quantity);
  if (Number.isFinite(available)) return Math.max(0, available);
  return Math.max(0, quantityOrZero(location.quantity) - locationPending(location));
}

/** 승인 대기는 창고 예약과 부서 승인 예약의 합계다. */
export function totalApprovalPending(item: Pick<InventoryItemLike, "pending_quantity" | "department_pending_quantity">): number {
  return warehousePending(item) + Math.max(0, quantityOrZero(item.department_pending_quantity));
}

/** 입출고 라인의 실제 출발지 기준 출고 한도를 계산한다. */
export function ioLineAvailable(item: InventoryItemLike, line: InventoryLineLike): number | null {
  const fromSource = line.from_bucket !== "none";
  const bucket = fromSource ? line.from_bucket : line.to_bucket;
  const department = fromSource ? line.from_department : line.to_department;

  if (bucket === "warehouse") return warehouseAvailable(item);
  if (bucket === "production") return locationAvailable(findInventoryLocation(item, department, "PRODUCTION"));
  if (bucket === "defective") return locationAvailable(findInventoryLocation(item, department, "DEFECTIVE"));
  return null;
}

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
 *
 * UI 의 select / chip 옵션 메타. "전체" 는 필터 미적용 의미 (DB 값 아님).
 */
export const LEGACY_FILE_TYPES = ["전체"] as const;
export const LEGACY_PARTS = ["전체", "자재창고", "조립출하", "고압파트", "진공파트", "튜닝파트"] as const;
