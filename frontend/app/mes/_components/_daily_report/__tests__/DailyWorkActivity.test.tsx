import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DailyWorkActivity } from "../DailyWorkActivity";

describe("DailyWorkActivity", () => {
  it("작업 종류별 수량을 먼저 보이고 상세는 요청 시 펼친다", () => {
    render(
      <DailyWorkActivity
        activity={{
          work_date: "2026-07-28",
          employee_id: "employee-1",
          cancelled_count: 1,
          summary: [{ operation_key: "process", operation_label: "공정", work_count: 2, quantity_by_unit: { EA: 8 } }],
          details: [{ type: "solo", key: "log-1", logs: [{ log_id: "log-1", item_name: "테스트 품목" }] }],
        } as never}
      />,
    );

    expect(screen.getByText("MES 거래 요약")).toBeInTheDocument();
    expect(screen.getByText("공정")).toBeInTheDocument();
    expect(screen.getByText("8 EA")).toBeInTheDocument();
    expect(screen.queryByText("테스트 품목")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "공정 거래 상세 펼치기" }));

    expect(screen.getByText("테스트 품목")).toBeInTheDocument();
  });
});
