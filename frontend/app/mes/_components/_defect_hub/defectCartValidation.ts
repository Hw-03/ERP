import { findInventoryLocation, locationAvailable, locationPending, warehouseAvailable, warehousePending } from "@/lib/mes/inventory";
import type { Item } from "../_warehouse_v2/types";
import { itemDepartment } from "../_warehouse_v2/itemPickerShared";

export type DefectSourceKind = "warehouse" | "production";

export interface DefectSourceStock {
  locationLabel: string;
  current: number;
  pending: number;
  available: number;
}

function numeric(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/** 불량 작업이 실제로 차감할 위치의 보유·예약·가용 수량을 계산한다. */
export function defectSourceStock(item: Item, source: DefectSourceKind): DefectSourceStock {
  if (source === "warehouse") {
    return {
      locationLabel: "창고",
      current: Math.max(0, numeric(item.warehouse_qty)),
      pending: warehousePending(item),
      available: warehouseAvailable(item),
    };
  }

  const department = itemDepartment(item);
  const location = findInventoryLocation(item, department, "PRODUCTION");
  return {
    locationLabel: department ?? "부서 미지정",
    current: Math.max(0, numeric(location?.quantity)),
    pending: locationPending(location),
    available: locationAvailable(location),
  };
}

export function hasDefectReason(category: string, memo: string): boolean {
  return category.trim().length > 0 || memo.trim().length > 0;
}

export function defectCartLineErrors({
  item,
  qty,
  source,
  category,
  memo,
}: {
  item: Item;
  qty: string | number;
  source: DefectSourceKind;
  category: string;
  memo: string;
}): string[] {
  const errors: string[] = [];
  const quantity = Number(qty);
  const department = itemDepartment(item);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    errors.push("수량은 1개 이상 입력하세요.");
  }
  if (source === "production" && !department) {
    errors.push("품목 담당 부서를 확인할 수 없습니다.");
  }
  if (Number.isFinite(quantity) && quantity > 0) {
    const stock = defectSourceStock(item, source);
    if (quantity > stock.available) {
      errors.push(`${stock.locationLabel} 가용 ${stock.available}개보다 ${quantity - stock.available}개 많습니다.`);
    }
  }
  if (!hasDefectReason(category, memo)) {
    errors.push("사유 카테고리 또는 메모 중 하나를 입력하세요.");
  }
  return errors;
}
