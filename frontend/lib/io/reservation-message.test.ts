import { describe, expect, it } from "vitest";
import type { WorkReservationIssue } from "@/lib/api/types/work-reservations";
import { reservationIssueMessage } from "./reservation-message";

describe("예약 확인 안내", () => {
  it.each<WorkReservationIssue["code"]>([
    "legacy_unprocessed", "stock_shortage", "inactive_owner", "unsupported_source", "plan_invalid", "returned_after_rejection",
  ])("%s 사유는 내부 정보 대신 직원의 다음 행동을 안내한다", (code) => {
    const message = reservationIssueMessage({ code, message: "batch 3a48 revision 7 invalid_plan", shortages: [] });
    expect(message).not.toMatch(/batch|revision|invalid_plan|3a48/);
    expect(message).toMatch(/저장|확인|관리자/);
  });
});
