import { describe, expect, it } from "vitest";
import type { WorkReservationIssue } from "@/lib/api/types/work-reservations";
import { reservationIssueMessage } from "./reservation-message";

describe("예약 확인 안내", () => {
  it("부족 안내에는 품목별 부족 수량과 재저장 행동을 포함한다", () => {
    const message = reservationIssueMessage({ code: "stock_shortage", message: "internal", shortages: [
      { item_id: "item", item_name: "예약 자재", mes_code: "MAT", unit: "EA", location: { bucket: "warehouse", department: null }, required_quantity: 5, available_quantity: 3, shortage_quantity: 2 },
    ] });
    expect(message).toContain("예약 자재 2 EA 부족");
    expect(message).toContain("다시 저장");
    expect(message).toContain("확보 가능한 자재만 예약");
  });
  it.each<WorkReservationIssue["code"]>([
    "stock_shortage", "inactive_owner", "unsupported_source", "plan_invalid", "returned_after_rejection",
  ])("%s 사유는 내부 정보 대신 직원의 다음 행동을 안내한다", (code) => {
    const message = reservationIssueMessage({ code, message: "batch 3a48 revision 7 invalid_plan", shortages: [] });
    expect(message).not.toMatch(/batch|revision|invalid_plan|3a48/);
    expect(message).toMatch(/저장|확인|관리자/);
  });
});
