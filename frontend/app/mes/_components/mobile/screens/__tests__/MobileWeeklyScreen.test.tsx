import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileWeeklyScreen } from "../MobileWeeklyScreen";

vi.mock("@/lib/api", () => ({
  api: {
    getWeeklyReport: vi.fn(() => new Promise(() => {})),
  },
}));

describe("MobileWeeklyScreen", () => {
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
});
