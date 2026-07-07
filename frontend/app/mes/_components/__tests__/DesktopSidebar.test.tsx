/* eslint-disable @next/next/no-img-element */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DesktopSidebar } from "../DesktopSidebar";

vi.mock("next/image", () => ({
  default: ({ alt = "", priority: _priority, ...props }: Record<string, unknown>) => <img alt={String(alt)} {...props} />,
}));

describe("DesktopSidebar", () => {
  it("places history directly below warehouse in the main sidebar order", () => {
    render(
      <DesktopSidebar
        activeTab="dashboard"
        onTabChange={vi.fn()}
        visibleTabs={["dashboard", "warehouse", "shipping", "defect", "history", "warehouseMap", "weekly", "admin"]}
      />,
    );

    const mainLabels = screen
      .getAllByRole("button")
      .map((button) => button.textContent ?? "")
      .filter((text) => ["대시보드", "입출고", "입출고 내역", "출하", "불량", "창고 지도", "주간보고"].some((label) => text.includes(label)));

    expect(mainLabels).toEqual([
      expect.stringContaining("대시보드"),
      expect.stringContaining("입출고"),
      expect.stringContaining("입출고 내역"),
      expect.stringContaining("출하"),
      expect.stringContaining("불량"),
      expect.stringContaining("창고 지도"),
      expect.stringContaining("주간보고"),
    ]);
  });

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
