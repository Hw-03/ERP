import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WarehouseSectionTabs } from "../WarehouseSectionTabs";

describe("WarehouseSectionTabs", () => {
  it("shows the renamed cart tab label", () => {
    render(
      <WarehouseSectionTabs
        active="compose"
        onChange={vi.fn()}
        showQueue={false}
        showDeptQueue={false}
      />,
    );

    expect(screen.getByRole("tab", { name: /작성 중/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /작업 중/ })).not.toBeInTheDocument();
  });
});
