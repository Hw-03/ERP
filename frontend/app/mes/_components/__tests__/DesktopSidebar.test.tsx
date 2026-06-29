/* eslint-disable @next/next/no-img-element */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DesktopSidebar } from "../DesktopSidebar";

vi.mock("next/image", () => ({
  default: ({ alt = "", priority: _priority, ...props }: Record<string, unknown>) => <img alt={String(alt)} {...props} />,
}));

describe("DesktopSidebar", () => {
  it("renders the shipping icon slightly larger than the default icon size", () => {
    const { container } = render(
      <DesktopSidebar
        activeTab="shipping"
        onTabChange={vi.fn()}
        visibleTabs={["dashboard", "warehouse", "shipping", "defect", "history", "warehouseMap", "weekly", "admin"]}
      />,
    );

    expect(screen.getByText("출하")).toBeInTheDocument();
    const icon = container.querySelector('button[aria-current="page"] svg');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("class")).toContain("h-[22px]");
    expect(icon?.getAttribute("class")).toContain("w-[22px]");
  });
});
