import { StrictMode, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DailyWorkActivity } from "../DailyWorkActivity";
import { DirtyGuardProvider } from "@/lib/ui/dirty-guard";
import { DesktopTabHomeProvider, useDesktopTabHomeController } from "../../DesktopTabHome";

describe("DailyWorkActivity", () => {
  it("같은 탭 복귀는 재마운트 없이 실제 거래 상세를 닫는다", () => {
    function ReturnButton() {
      const { requestHome } = useDesktopTabHomeController();
      return <button onClick={() => requestHome()}>메뉴 복귀</button>;
    }
    const onDetailOpenChange = vi.fn();
    render(<DirtyGuardProvider><DesktopTabHomeProvider>
      <ReturnButton />
      <DailyWorkActivity activity={{
        work_date: "2026-08-03", employee_id: "employee-1", cancelled_count: 0,
        summary: [{ operation_key: "warehouse", operation_label: "창고", work_count: 1, quantity_by_unit: { EA: 1 } }],
        details: [{ type: "solo", key: "log-1", logs: [] }],
      } as never} onDetailOpenChange={onDetailOpenChange} />
    </DesktopTabHomeProvider></DirtyGuardProvider>);
    const section = screen.getByRole("region", { name: "MES 작업 기록" });
    fireEvent.click(screen.getByRole("button", { name: "창고 거래 상세 펼치기" }));
    expect(screen.getByTestId("daily-work-activity-details")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "메뉴 복귀" }));
    expect(screen.queryByTestId("daily-work-activity-details")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "MES 작업 기록" })).toBe(section);
    expect(onDetailOpenChange).toHaveBeenLastCalledWith(false);
  });
  it("8.20-09 상세 토글은 렌더 도중 부모 상태를 갱신하지 않는다", () => {
    function ActivityHarness() {
      const [isDetailOpen, setIsDetailOpen] = useState(false);
      return (
        <>
          <span data-testid="detail-open-state">{isDetailOpen ? "open" : "closed"}</span>
          <DailyWorkActivity
            activity={{
              work_date: "2026-08-03",
              employee_id: "employee-1",
              cancelled_count: 0,
              summary: [{ operation_key: "warehouse", operation_label: "창고", work_count: 1, quantity_by_unit: { EA: 1 } }],
              details: [{ type: "solo", key: "log-1", logs: [] }],
            } as never}
            onDetailOpenChange={setIsDetailOpen}
          />
        </>
      );
    }

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(<StrictMode><ActivityHarness /></StrictMode>);
      fireEvent.click(screen.getByRole("button", { name: "창고 거래 상세 펼치기" }));

      expect(screen.getByTestId("detail-open-state")).toHaveTextContent("open");
      expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(
        /Cannot update a component.*while rendering a different component/,
      );
    } finally {
      consoleError.mockRestore();
    }
  });

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
                { scope: "warehouse", delta: -1, quantity_before: 4, quantity_after: 3 },
                { scope: "location", department: "조립", status: "PRODUCTION", delta: 1, quantity_before: 3, quantity_after: 4 },
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

    expect(screen.getAllByText("D-910 크래들 TOP 사출")).toHaveLength(1);
    expect(screen.getByText("348-AR-0722")).toBeInTheDocument();
    expect(screen.getByText("요청자")).toBeInTheDocument();
    expect(screen.getByText("김민재")).toBeInTheDocument();
    expect(screen.queryByText("위치 / 이동 경로")).not.toBeInTheDocument();
    const detail = screen.getAllByText("D-910 크래들 TOP 사출")[0].closest("article");
    expect(detail).toHaveAttribute("data-testid", "daily-work-activity-card");
    expect(detail).toHaveClass("lg:grid-cols-[minmax(250px,1fr)_minmax(230px,0.8fr)_minmax(360px,1.6fr)]");
    expect(screen.getByTestId("daily-work-activity-primary")).toHaveClass("items-center");
    expect(screen.getByTestId("daily-work-activity-status")).toHaveClass(
      "h-7",
      "w-16",
      "shrink-0",
      "whitespace-nowrap",
    );
    expect(screen.getByTestId("daily-work-activity-meta")).toHaveTextContent("요청자 김민재");
    expect(screen.getByTestId("daily-work-activity-stock-flow")).toHaveTextContent("창고재고 4 EA → 3 EA1 EA 감소");
    expect(screen.getByTestId("daily-work-activity-stock-flow")).toHaveTextContent("조립재고 3 EA → 4 EA1 EA 증가");
    expect(detail).toHaveTextContent("창고");
    expect(detail).toHaveTextContent("조립");
    expect(screen.queryByText("재고 변화")).not.toBeInTheDocument();
    expect(screen.queryByText("창고 재고")).not.toBeInTheDocument();
    expect(screen.queryByText("조립 재고")).not.toBeInTheDocument();
    expect(screen.getByText("1 EA 감소")).toBeInTheDocument();
    expect(screen.getByText("1 EA 증가")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "창고 거래 상세 접기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "거래 상세 접기" })).not.toBeInTheDocument();
    expect(screen.getByTestId("daily-work-activity-details")).not.toHaveClass("lg:max-h-56", "lg:overflow-y-auto");
  });

  it("위치별 전후 수량이 없으면 증감만 표시하고 수량을 추정하지 않는다", () => {
    render(
      <DailyWorkActivity
        activity={{
          work_date: "2026-08-03",
          employee_id: "employee-1",
          cancelled_count: 0,
          summary: [{ operation_key: "warehouse", operation_label: "창고", work_count: 1, quantity_by_unit: { EA: 1 } }],
          details: [{
            type: "solo",
            key: "log-fallback",
            logs: [{
              log_id: "log-fallback",
              item_id: "item-fallback",
              mes_code: "9-TR-0001",
              item_name: "스냅샷 없는 품목",
              item_process_type_code: null,
              item_unit: "EA",
              transaction_type: "RECEIVE",
              quantity_change: 1,
              quantity_before: null,
              quantity_after: null,
              warehouse_qty_before: null,
              warehouse_qty_after: null,
              transfer_qty: null,
              reference_no: null,
              produced_by: "관리자",
              requester_name: "관리자",
              approver_name: null,
              requested_at: "2026-08-03T01:03:00Z",
              approved_at: "2026-08-03T01:03:00Z",
              department: null,
              notes: null,
              operation_batch_id: null,
              shipping_phase: null,
              created_at: "2026-08-03T01:03:00Z",
              cancelled: false,
              cancel_reason: null,
              cancelled_by: null,
              cancelled_at: null,
              inventory_effect: [{ scope: "warehouse", delta: 1 }],
            }],
          }],
        } as never}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "창고 거래 상세 펼치기" }));

    expect(screen.getByTestId("daily-work-activity-stock-flow")).toHaveTextContent("창고1 EA 증가");
    expect(screen.getByTestId("daily-work-activity-stock-flow")).not.toHaveTextContent("→");
  });

  it("재고 변화가 많아도 모두 두 열에 표시하고 잘린 품명은 호버로 전체 이름을 보여준다", async () => {
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

    const truncatedName = screen.getByText("부품 C");
    Object.defineProperties(truncatedName, {
      clientWidth: { configurable: true, value: 60 },
      scrollWidth: { configurable: true, value: 120 },
      clientHeight: { configurable: true, value: 20 },
      scrollHeight: { configurable: true, value: 20 },
    });
    fireEvent(window, new Event("resize"));

    const tooltipTrigger = truncatedName.parentElement!;
    await waitFor(() => expect(tooltipTrigger).toHaveAttribute("tabindex", "0"));
    fireEvent.mouseEnter(tooltipTrigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("부품 C");
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
