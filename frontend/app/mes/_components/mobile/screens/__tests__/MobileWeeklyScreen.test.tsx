import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileWeeklyScreen } from "../MobileWeeklyScreen";

const state = vi.hoisted(() => ({
  getWeeklyReport: vi.fn(() => new Promise(() => {})),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getWeeklyReport: state.getWeeklyReport,
  },
}));

vi.mock("../../../_weekly_sections/WeeklyDetailTable", () => ({
  WeeklyDetailTable: ({ stockBasis }: { stockBasis: string }) => (
    <div data-testid="mobile-weekly-detail" data-stock-basis={stockBasis} />
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
});
