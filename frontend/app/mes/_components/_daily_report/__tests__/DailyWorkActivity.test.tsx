import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DailyWorkActivity } from "../DailyWorkActivity";

describe("DailyWorkActivity", () => {
  it("작업 기록 칩 하나로 수량을 보이고 상세를 펼치고 접는다", () => {
    render(
      <DailyWorkActivity
        activity={{
          work_date: "2026-07-28",
          employee_id: "employee-1",
          cancelled_count: 1,
          summary: [{ operation_key: "warehouse", operation_label: "창고", work_count: 1, quantity_by_unit: { EA: 1 } }],
          details: [{
            type: "solo",
            key: "log-1",
            logs: [{
              log_id: "log-1",
              item_id: "item-1",
              mes_code: "348-AR-0722",
              item_name: "D-910 크래들 TOP 사출",
              item_process_type_code: null,
              item_unit: "EA",
              transaction_type: "TRANSFER_TO_PROD",
              quantity_change: -1,
              quantity_before: 1,
              quantity_after: 0,
              warehouse_qty_before: 1,
              warehouse_qty_after: 0,
              transfer_qty: 1,
              reference_no: "DEV-DAILY-20260803",
              produced_by: null,
              requester_name: "김민재",
              approver_name: null,
              requested_at: "2026-08-03T01:03:00Z",
              approved_at: "2026-08-03T01:03:00Z",
              department: "조립",
              notes: null,
              reason_category: null,
              reason_memo: null,
              operation_batch_id: null,
              shipping_phase: null,
              created_at: "2026-08-03T01:03:00Z",
              edit_count: 0,
              cancelled: false,
              cancel_reason: null,
              cancelled_by: null,
              cancelled_at: null,
              inventory_effect: [
                { scope: "warehouse", delta: -1 },
                { scope: "location", department: "조립", status: "PRODUCTION", delta: 1 },
              ],
            }],
          }],
        } as never}
      />,
    );

    expect(screen.getByRole("heading", { name: "MES 작업 기록" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "MES 작업 기록" })).toHaveClass("lg:shrink-0");
    expect(screen.getByText("창고")).toBeInTheDocument();
    expect(screen.getByText("1 EA")).toBeInTheDocument();
    expect(screen.queryByText("D-910 크래들 TOP 사출")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "거래 상세 접기" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "창고 거래 상세 펼치기" }));

    expect(screen.getAllByText("D-910 크래들 TOP 사출")).toHaveLength(3);
    expect(screen.getByText("348-AR-0722")).toBeInTheDocument();
    expect(screen.getByText("요청자")).toBeInTheDocument();
    expect(screen.getByText("김민재")).toBeInTheDocument();
    expect(screen.queryByText("위치 / 이동 경로")).not.toBeInTheDocument();
    const detail = screen.getAllByText("D-910 크래들 TOP 사출")[0].closest("article");
    expect(detail).toHaveTextContent("창고");
    expect(detail).toHaveTextContent("조립");
    expect(screen.getByText("창고 재고")).toBeInTheDocument();
    expect(screen.getByText("조립 재고")).toBeInTheDocument();
    expect(screen.getByText("-1 EA")).toBeInTheDocument();
    expect(screen.getByText("+1 EA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "창고 거래 상세 접기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "거래 상세 접기" })).not.toBeInTheDocument();
    expect(screen.getByTestId("daily-work-activity-details")).not.toHaveClass("lg:max-h-56", "lg:overflow-y-auto");
  });

  it("재고 변화가 많아도 모두 두 열에 표시하고 추가 펼치기를 만들지 않는다", () => {
    const baseLog = {
      log_id: "log-1",
      item_id: "item-finished",
      mes_code: "PF-001",
      item_name: "완제품 A",
      item_process_type_code: null,
      item_unit: "EA",
      transaction_type: "PRODUCE",
      quantity_change: 1,
      quantity_before: 0,
      quantity_after: 1,
      warehouse_qty_before: 0,
      warehouse_qty_after: 0,
      transfer_qty: null,
      reference_no: "batch-1",
      produced_by: null,
      requester_name: "김현우",
      approver_name: null,
      requested_at: "2026-08-03T05:17:00Z",
      approved_at: "2026-08-03T05:17:00Z",
      department: "조립",
      notes: null,
      reason_category: null,
      reason_memo: null,
      operation_batch_id: "batch-1",
      shipping_phase: null,
      created_at: "2026-08-03T05:17:00Z",
      edit_count: 0,
      cancelled: false,
      cancel_reason: null,
      cancelled_by: null,
      cancelled_at: null,
    };

    render(
      <DailyWorkActivity
        activity={{
          work_date: "2026-08-03",
          employee_id: "employee-1",
          cancelled_count: 0,
          summary: [{ operation_key: "process", operation_label: "공정", work_count: 1, quantity_by_unit: { EA: 1 } }],
          details: [{
            type: "batch",
            key: "batch-1",
            logs: [
              { ...baseLog, inventory_effect: [{ scope: "location", department: "조립", status: "PRODUCTION", delta: 1 }] },
              { ...baseLog, log_id: "log-2", item_id: "item-a", item_name: "부품 A", inventory_effect: [{ scope: "location", department: "조립", status: "PRODUCTION", delta: -1 }] },
              { ...baseLog, log_id: "log-3", item_id: "item-b", item_name: "부품 B", inventory_effect: [{ scope: "location", department: "조립", status: "PRODUCTION", delta: -1 }] },
              { ...baseLog, log_id: "log-4", item_id: "item-c", item_name: "부품 C", inventory_effect: [{ scope: "location", department: "조립", status: "PRODUCTION", delta: -1 }] },
            ],
          }],
        } as never}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "공정 거래 상세 펼치기" }));

    expect(screen.getAllByText("완제품 A")).not.toHaveLength(0);
    expect(screen.getByText("부품 A")).toBeInTheDocument();
    expect(screen.getByText("부품 C")).toBeInTheDocument();
    expect(screen.getByTestId("daily-work-activity-impacts")).toHaveClass("lg:grid-cols-2");
    expect(screen.queryByRole("button", { name: /재고 변화.*더 보기/ })).not.toBeInTheDocument();
    expect(screen.queryByText("위치 / 이동 경로")).not.toBeInTheDocument();
    expect(screen.getByText("생산 입고")).toBeInTheDocument();
  });

  it("읽기 전용 일보의 펼친 상세는 카드 내부 높이를 제한하지 않는다", () => {
    render(
      <DailyWorkActivity
        activity={{
          work_date: "2026-08-03",
          employee_id: "employee-2",
          cancelled_count: 0,
          summary: [{ operation_key: "warehouse", operation_label: "창고", work_count: 1, quantity_by_unit: { EA: 1 } }],
          details: [{ type: "solo", key: "log-1", logs: [] }],
        } as never}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "창고 거래 상세 펼치기" }));
    expect(screen.getByTestId("daily-work-activity-details")).not.toHaveClass("lg:max-h-56", "lg:overflow-y-auto");
  });
});
