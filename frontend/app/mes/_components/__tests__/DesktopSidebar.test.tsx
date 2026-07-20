/* eslint-disable @next/next/no-img-element */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("keeps the menu and icon transitions while the active tab changes", () => {
    const { container, rerender } = render(
      <DesktopSidebar
        activeTab="dashboard"
        onTabChange={vi.fn()}
        visibleTabs={["dashboard", "warehouse", "shipping", "defect", "history", "warehouseMap", "weekly", "admin"]}
      />,
    );

    rerender(
      <DesktopSidebar
        activeTab="history"
        onTabChange={vi.fn()}
        visibleTabs={["dashboard", "warehouse", "shipping", "defect", "history", "warehouseMap", "weekly", "admin"]}
      />,
    );

    expect(container.querySelector('button[aria-current="page"]')?.className).toContain("transition-all");
    expect(screen.getByRole("button", { name: /대시보드/ }).querySelector("div > div")?.className).toContain("transition-all");
  });

  it("animates the sidebar width when it expands", () => {
    const { container } = render(
      <DesktopSidebar
        activeTab="history"
        onTabChange={vi.fn()}
        visibleTabs={["dashboard", "warehouse", "shipping", "defect", "history", "warehouseMap", "weekly", "admin"]}
      />,
    );

    expect((container.firstElementChild as HTMLElement).style.transition).toContain("width 180ms cubic-bezier(0.4, 0, 0.2, 1)");
  });

  it("expands the sidebar layout slot when the pointer enters", () => {
    const { container } = render(
      <DesktopSidebar
        activeTab="dashboard"
        onTabChange={vi.fn()}
        visibleTabs={["dashboard", "warehouse", "shipping", "defect", "history", "warehouseMap", "weekly", "admin"]}
      />,
    );

    const sidebarSlot = container.firstElementChild as HTMLElement;
    const sidebar = container.querySelector("aside") as HTMLElement;
    fireEvent.mouseEnter(sidebarSlot);

    expect(sidebarSlot).toHaveStyle({ width: "220px" });
    expect(sidebar).not.toHaveStyle({ width: "220px" });
  });
});
