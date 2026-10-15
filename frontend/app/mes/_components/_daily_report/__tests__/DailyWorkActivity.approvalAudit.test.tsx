import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DailyWorkActivity as DailyWorkActivityData } from "@/lib/api/types/daily-work-reports";
import { DailyWorkActivity } from "../DailyWorkActivity";

const activity = {
  work_date: "2026-10-08", employee_id: "requester-id", cancelled_count: 0,
  summary: [{ operation_key: "process", operation_label: "공정", work_count: 1, quantity_by_unit: { EA: 1 } }],
  details: [{ type: "solo", key: "department-receipt", logs: [{
    log_id: "receipt-log", item_id: "item-id", item_name: "부서 승인 입고품", mes_code: "3-TR-9001", item_unit: "EA",
    transaction_type: "ADJUST", quantity_change: 1, created_at: "2026-10-08T01:05:00Z",
    requested_at: "2026-10-08T01:00:00Z", approved_at: "2026-10-08T01:05:00Z",
    requester_name: "서로 다른 요청자", approver_name: "서로 다른 승인자", executor_name: "서로 다른 승인자",
    notes: "품명과 다른 실제 입고 메모", department: "튜브",
    history_batch: { work_type: "process", sub_type: "adjust_in" },
    inventory_effect: [{ scope: "location", department: "튜브", status: "PRODUCTION", delta: 1, quantity_before: 7, quantity_after: 8 }],
  }] }],
} as DailyWorkActivityData;

describe("8.2-08 DailyWorkActivity approval audit", () => {
  for (const mobile of [false, true]) {
    it.each(["operation", "approval", "memo"] as const)("같은 부서 거래의 %s를 표시한다 mobile=" + mobile, (field) => {
      render(<DailyWorkActivity activity={activity} mobile={mobile} />);
      if (mobile) fireEvent.click(screen.getByRole("button", { name: "MES 작업 기록 1건 펼치기" }));
      fireEvent.click(screen.getByRole("button", { name: "공정 거래 상세 펼치기" }));
      const card = screen.getByTestId("daily-work-activity-card");
      expect(card).toHaveTextContent("서로 다른 요청자");
      if (field === "operation") expect(card).toHaveTextContent("부서 입출고");
      else if (field === "approval") expect(screen.getByTestId("daily-work-activity-meta")).toHaveTextContent("승인자 서로 다른 승인자");
      else expect(card).toHaveTextContent("품명과 다른 실제 입고 메모");
    });
  }
});
