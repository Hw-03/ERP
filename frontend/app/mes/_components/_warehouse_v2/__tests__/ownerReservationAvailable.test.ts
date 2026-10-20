import { describe, expect, it } from "vitest";
import type { IoBatch, IoLine, Item } from "@/lib/api";
import { ownerReservationAvailable } from "../ownerReservationAvailable";

describe("본인 작업 예약 가용량", () => {
  it("위치 요약이 있으면 작업·승인·출하 예약을 각각 한 번 차감한다", () => {
    const item = { item_id: "item", warehouse_qty: 10, pending_quantity: 5, work_reservations: { reservation_by_location: [
      { location: { bucket: "warehouse", department: null }, work_reserved_quantity: 3, approval_reserved_quantity: 2, shipping_reserved_quantity: 4 },
    ] } } as Item;
    expect(ownerReservationAvailable(item, { item_id: "item", from_bucket: "warehouse", to_bucket: "none" } as IoLine)).toBe(1);
  });
  it("저장된 본인 배치의 같은 물리 위치 출고만 재사용하고 미래 입고는 가산하지 않는다", () => {
    const item = { item_id: "item", warehouse_qty: 10, pending_quantity: 7 } as Item;
    const line = { item_id: "item", from_bucket: "warehouse", from_department: null, to_bucket: "none" } as IoLine;
    const batch = { status: "draft", reservation_status: "reserved", effective_plan: { effects: [
      { item_id: "item", kind: "out", quantity: 4, from: { bucket: "warehouse", department: null } },
      { item_id: "item", kind: "in", quantity: 20, from: null },
      { item_id: "item", kind: "out", quantity: 9, from: { bucket: "production", department: "조립" } },
    ] } } as IoBatch;
    expect(ownerReservationAvailable(item, line, batch)).toBe(7);
    expect(ownerReservationAvailable(item, line, { ...batch, reservation_status: "needs_reservation" })).toBe(3);
    expect(ownerReservationAvailable(item, line, { ...batch, status: "cancelled" })).toBe(3);
    expect(ownerReservationAvailable(item, line, { ...batch, status: "submitted" })).toBe(3);
  });
});
