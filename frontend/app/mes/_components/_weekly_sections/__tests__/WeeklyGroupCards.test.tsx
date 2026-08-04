import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WeeklyGroupCards } from "../WeeklyGroupCards";

vi.mock("../../DepartmentsContext", () => ({
  useDeptColorLookup: () => () => "#3b82f6",
}));

describe("WeeklyGroupCards", () => {
  it("keeps the department accent while showing both inventory change sides", () => {
    render(
      <WeeklyGroupCards
        groups={[
          {
            process_code: "AF",
            dept_name: "조립",
            label: "조립",
            item_count: 1,
            prev_qty: 18,
            increase_qty: 5,
            decrease_qty: 13,
            produce_qty: 0,
            receive_qty: 0,
            out_qty: 8,
            current_qty: 10,
            delta: -8,
            items: [],
          },
        ]}
        selected="AF"
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: /조립/ })).toHaveStyle({ borderColor: "#3b82f6" });
    expect(screen.getByText("+5").getAttribute("style")).toContain("var(--c-green)");
    expect(screen.getByText("-13").getAttribute("style")).toContain("var(--c-red)");
    expect(screen.queryByText("-8")).not.toBeInTheDocument();
    expect(screen.queryByText("변동 없음")).not.toBeInTheDocument();
  });

  it("shows both zero sides instead of the unchanged badge", () => {
    render(
      <WeeklyGroupCards
        groups={[
          {
            process_code: "TF",
            dept_name: "튜브",
            label: "튜브",
            item_count: 0,
            prev_qty: 0,
            increase_qty: 0,
            decrease_qty: 0,
            produce_qty: 0,
            receive_qty: 0,
            out_qty: 0,
            current_qty: 0,
            delta: 0,
            items: [],
          },
        ]}
        selected="TF"
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByText("+0")).toBeInTheDocument();
    expect(screen.getByText("-0")).toBeInTheDocument();
    expect(screen.queryByText("±0")).not.toBeInTheDocument();
    expect(screen.queryByText("변동 없음")).not.toBeInTheDocument();
  });

  it("does not mute activity whose increase and decrease net to zero", () => {
    render(
      <WeeklyGroupCards
        groups={[
          {
            process_code: "AF",
            dept_name: "조립",
            label: "조립",
            item_count: 1,
            prev_qty: 10,
            increase_qty: 10,
            decrease_qty: 10,
            produce_qty: 10,
            receive_qty: 0,
            out_qty: 10,
            current_qty: 10,
            delta: 0,
            items: [],
          },
        ]}
        selected="PF"
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByText("조립").getAttribute("style")).toContain("var(--c-text)");
  });
});
