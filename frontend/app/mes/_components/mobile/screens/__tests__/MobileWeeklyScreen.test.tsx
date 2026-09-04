import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileWeeklyScreen } from "../MobileWeeklyScreen";

const state = vi.hoisted(() => ({
  getWeeklyReport: vi.fn(() => new Promise(() => {})),
}));

const selectedItem = {
  item_id: "item-bom-1",
  mes_code: "8-TF-0001",
  item_name: "DXDR-70 튜브",
  prev_qty: 0,
  produce_qty: 0,
  receive_qty: 0,
  out_qty: 0,
  current_qty: 0,
  delta: 0,
};

vi.mock("@/lib/api", () => ({
  api: {
    getWeeklyReport: state.getWeeklyReport,
  },
}));

vi.mock("../../../_weekly_sections/WeeklyDetailTable", () => ({
  WeeklyDetailTable: ({ stockBasis, onItemSelect }: { stockBasis: string; onItemSelect?: (item: typeof selectedItem) => void }) => (
    <div data-testid="mobile-weekly-detail" data-stock-basis={stockBasis}>
      <button type="button" onClick={() => onItemSelect?.(selectedItem)}>BOM 열기</button>
    </div>
  ),
}));

vi.mock("@/lib/ui/BottomSheet", () => ({
  BottomSheet: ({ open, title, onClose, children }: { open: boolean; title?: string; onClose: () => void; children: React.ReactNode }) => open ? (
    <div role="dialog" aria-label={title}>
      <button type="button" onClick={onClose}>닫기</button>
      {children}
    </div>
  ) : null,
}));

vi.mock("../../../_warehouse_v2/BomSubExpander", () => ({
  BomSubExpander: ({ itemId, mobileDetail }: { itemId: string; mobileDetail?: boolean }) => (
    <div data-testid="mobile-weekly-bom-tree" data-item-id={itemId} data-mobile-detail={String(mobileDetail)} />
  ),
}));

vi.mock("../../../DepartmentsContext", () => ({
  useDeptColorLookup: () => () => "#3b82f6",
}));

describe("MobileWeeklyScreen", () => {
  beforeEach(() => {
    state.getWeeklyReport.mockReset();
    state.getWeeklyReport.mockReturnValue(new Promise(() => {}));
  });

  it("centers the week picker and returns to the More menu", () => {
    const onExit = vi.fn();

    render(
      <MobileWeeklyScreen
        weekMon={new Date("2026-07-20T00:00:00")}
        onWeekChange={() => {}}
        onExit={onExit}
      />,
    );

    expect(screen.getByTestId("mobile-weekly-header")).toHaveClass("justify-center");

    fireEvent.click(screen.getByRole("button", { name: "더보기 메뉴로 돌아가기" }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("requests the selected KST Monday through Sunday", () => {
    render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00+09:00")} />);

    expect(state.getWeeklyReport).toHaveBeenLastCalledWith({
      week_start: "2026-08-31",
      week_end: "2026-09-06",
    });
  });

  it("passes the normal-stock basis to verified weekly details", async () => {
    state.getWeeklyReport.mockResolvedValue({
      groups: [],
      production_matrix: [],
      report_status: "verified",
      basis_version: 2,
    });

    render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00")} />);

    expect(await screen.findByTestId("mobile-weekly-detail")).toHaveAttribute(
      "data-stock-basis",
      "normal",
    );
  });

  it("opens the selected item BOM in a mobile sheet", async () => {
    state.getWeeklyReport.mockResolvedValue({
      groups: [{
        process_code: "TF",
        dept_name: "튜브",
        label: "튜브",
        item_count: 1,
        prev_qty: 0,
        increase_qty: 0,
        decrease_qty: 0,
        produce_qty: 0,
        receive_qty: 0,
        out_qty: 0,
        current_qty: 0,
        delta: 0,
        items: [selectedItem],
      }],
      production_matrix: [],
    });

    render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00")} />);
    fireEvent.click(await screen.findByRole("button", { name: "BOM 열기" }));

    expect(screen.getByRole("dialog", { name: "BOM 구성 보기" })).toBeInTheDocument();
    expect(screen.getByTestId("mobile-weekly-bom-tree")).toHaveAttribute("data-item-id", selectedItem.item_id);
    expect(screen.getByTestId("mobile-weekly-bom-tree")).toHaveAttribute("data-mobile-detail", "true");

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog", { name: "BOM 구성 보기" })).not.toBeInTheDocument();
  });
});
