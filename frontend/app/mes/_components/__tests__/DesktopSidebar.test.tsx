/* eslint-disable @next/next/no-img-element */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { DesktopSidebar, type DesktopTabId } from "../DesktopSidebar";

vi.mock("next/image", () => ({
  default: ({ alt = "", priority: _priority, ...props }: Record<string, unknown>) => <img alt={String(alt)} {...props} />,
}));

describe("DesktopSidebar", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses a flat sidebar surface without a card shadow", () => {
    const { container } = render(
      <DesktopSidebar
        activeTab="dashboard"
        onTabChange={vi.fn()}
        visibleTabs={["dashboard"]}
      />,
    );

    expect(container.querySelector("aside")).toHaveStyle({ boxShadow: "none" });
    expect(container.querySelector("button[aria-current='page']")).toHaveAttribute("data-sidebar-tab");
  });

  it("keeps weekly report followed by daily work report as the final work menu order", () => {
    render(
      <DesktopSidebar
        activeTab="dashboard"
        onTabChange={vi.fn()}
        visibleTabs={["dashboard", "warehouse", "shipping", "defect", "history", "warehouseMap", "weekly", "dailyReport", "admin"]}
      />,
    );

    const mainLabels = screen
      .getAllByRole("button")
      .map((button) => button.textContent ?? "")
      .filter((text) => ["주간보고", "일일 작업 일보"].some((label) => text.includes(label)));
    expect(mainLabels).toEqual([expect.stringContaining("주간보고"), expect.stringContaining("일일 작업 일보")]);
  });

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
      <DesktopSidebar activeTab="shipping" onTabChange={vi.fn()} visibleTabs={["dashboard", "shipping"]} />,
    );

    expect(container.querySelector('button[aria-current="page"] svg')?.getAttribute("class")).toContain("h-[22px]");
  });

  it("keeps the width and active-tab transitions", () => {
    const { container, rerender } = render(
      <DesktopSidebar activeTab="dashboard" onTabChange={vi.fn()} visibleTabs={["dashboard", "history"]} />,
    );
    rerender(<DesktopSidebar activeTab="history" onTabChange={vi.fn()} visibleTabs={["dashboard", "history"]} />);

    expect((container.firstElementChild as HTMLElement).style.transition).toContain("width 180ms cubic-bezier(0.4, 0, 0.2, 1)");
    expect(container.querySelector('button[aria-current="page"]')?.className).toContain("transition-all");
  });

  it("keeps settings visible even when only the dashboard business tab is visible", () => {
    render(<DesktopSidebar activeTab="dashboard" onTabChange={vi.fn()} visibleTabs={["dashboard"]} />);

    expect(screen.getByRole("button", { name: "설정" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "관리" })).not.toBeInTheDocument();
  });

  it("uses the bottom settings control as an active tab", () => {
    const onTabChange = vi.fn();
    const { rerender } = render(
      <DesktopSidebar activeTab="dashboard" onTabChange={onTabChange} visibleTabs={["dashboard"]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    expect(onTabChange).toHaveBeenCalledWith("settings");

    rerender(
      <DesktopSidebar activeTab={"settings" as DesktopTabId} onTabChange={onTabChange} visibleTabs={["dashboard"]} />,
    );
    expect(screen.getByRole("button", { name: "설정" })).toHaveAttribute("aria-current", "page");
  });

  it("shows the administrator icon with the active treatment while the admin tab is open", () => {
    render(<DesktopSidebar activeTab="admin" onTabChange={vi.fn()} visibleTabs={["dashboard", "admin"]} />);

    const settingsButton = screen.getByRole("button", { name: "설정" });
    expect(settingsButton).toHaveAttribute("aria-current", "page");
    expect(settingsButton.querySelector("svg")?.getAttribute("class")).toContain("lucide-settings2");
  });

  it("opens administrator PIN entry from the existing settings context action only for visible admins", () => {
    const onOpenAdminPinEntry = vi.fn();
    const { rerender } = render(
      <DesktopSidebar
        activeTab="dashboard"
        onTabChange={vi.fn()}
        visibleTabs={["dashboard", "admin"]}
        onOpenAdminPinEntry={onOpenAdminPinEntry}
      />,
    );

    const allowedEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    screen.getByRole("button", { name: "설정" }).dispatchEvent(allowedEvent);
    expect(allowedEvent.defaultPrevented).toBe(true);
    expect(onOpenAdminPinEntry).toHaveBeenCalledOnce();

    rerender(<DesktopSidebar activeTab="dashboard" onTabChange={vi.fn()} visibleTabs={["dashboard"]} onOpenAdminPinEntry={onOpenAdminPinEntry} />);
    const blockedEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    screen.getByRole("button", { name: "설정" }).dispatchEvent(blockedEvent);
    expect(blockedEvent.defaultPrevented).toBe(false);
    expect(onOpenAdminPinEntry).toHaveBeenCalledOnce();
  });

  it("expands and collapses from sidebar pointer boundaries for five consecutive cycles", () => {
    vi.useFakeTimers();
    const { container } = render(
      <DesktopSidebar activeTab="settings" onTabChange={vi.fn()} visibleTabs={["dashboard"]} sidebarMode="hover" />,
    );
    const sidebar = container.querySelector("aside") as HTMLElement;

    for (let cycle = 0; cycle < 5; cycle += 1) {
      fireEvent.mouseEnter(sidebar);
      expect(container.firstElementChild).toHaveStyle({ width: "220px" });
      fireEvent.mouseLeave(sidebar);
      act(() => vi.advanceTimersByTime(220));
      expect(container.firstElementChild).toHaveStyle({ width: "72px" });
    }
  });

  it("keeps the configured fixed modes independent of pointer movement", () => {
    const { container, rerender } = render(
      <DesktopSidebar activeTab="dashboard" onTabChange={vi.fn()} visibleTabs={["dashboard"]} sidebarMode="collapsed" />,
    );
    const sidebar = container.querySelector("aside") as HTMLElement;
    fireEvent.mouseEnter(sidebar);
    expect(container.firstElementChild).toHaveStyle({ width: "72px" });

    rerender(<DesktopSidebar activeTab="dashboard" onTabChange={vi.fn()} visibleTabs={["dashboard"]} sidebarMode="expanded" />);
    expect(container.firstElementChild).toHaveStyle({ width: "220px" });
  });
});
