import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WeeklyGroupCards } from "../WeeklyGroupCards";

vi.mock("../../DepartmentsContext", () => ({
  useDeptColorLookup: () => () => "#3b82f6",
}));

describe("WeeklyGroupCards", () => {
  it("keeps an assembly card blue when its weekly delta is negative", () => {
    render(
      <WeeklyGroupCards
        groups={[
          {
            process_code: "AF",
            dept_name: "조립",
            label: "조립",
            item_count: 1,
            prev_qty: 18,
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
    expect(screen.getByText("-8").getAttribute("style")).toContain("var(--c-red)");
  });
});
