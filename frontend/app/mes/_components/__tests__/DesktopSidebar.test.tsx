/* eslint-disable @next/next/no-img-element */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DesktopSidebar, type DesktopTabId } from "../DesktopSidebar";
import { api } from "@/lib/api";
import { readCurrentOperator } from "../login/useCurrentOperator";

vi.mock("next/image", () => ({
  default: ({ alt = "", priority: _priority, ...props }: Record<string, unknown>) => <img alt={String(alt)} {...props} />,
}));

describe("DesktopSidebar", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
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

    expect(mainLabels).toEqual([
      expect.stringContaining("주간보고"),
      expect.stringContaining("일일 작업 일보"),
    ]);
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

  it("removes the old management button and opens the PIN entry only for visible admins", () => {
    const onOpenAdminPinEntry = vi.fn();
    const visibleAdminProps = {
      activeTab: "dashboard" as const,
      onTabChange: vi.fn(),
      visibleTabs: ["dashboard", "admin"] as DesktopTabId[],
      onOpenAdminPinEntry,
    };
    const { rerender } = render(
      <DesktopSidebar {...(visibleAdminProps as unknown as React.ComponentProps<typeof DesktopSidebar>)} />,
    );

    expect(screen.queryByRole("button", { name: "관리" })).not.toBeInTheDocument();
    const allowedEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    screen.getByRole("button", { name: "설정" }).dispatchEvent(allowedEvent);
    expect(allowedEvent.defaultPrevented).toBe(true);
    expect(onOpenAdminPinEntry).toHaveBeenCalledOnce();

    const hiddenAdminProps = { ...visibleAdminProps, visibleTabs: ["dashboard"] as DesktopTabId[] };
    rerender(<DesktopSidebar {...(hiddenAdminProps as unknown as React.ComponentProps<typeof DesktopSidebar>)} />);
    const blockedEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    screen.getByRole("button", { name: "설정" }).dispatchEvent(blockedEvent);
    expect(blockedEvent.defaultPrevented).toBe(false);
    expect(onOpenAdminPinEntry).toHaveBeenCalledOnce();
  });

  it("설정 모달에서 고른 테마와 표시 방식을 저장할 때만 적용한다", async () => {
    const { container } = render(
      <DesktopSidebar
        activeTab="dashboard"
        onTabChange={vi.fn()}
        visibleTabs={["dashboard", "admin"]}
      />,
    );
    const sidebarSlot = container.firstElementChild as HTMLElement;

    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    fireEvent.click(screen.getByRole("button", { name: "다크 테마" }));
    fireEvent.click(screen.getByRole("button", { name: "펼침 고정" }));

    expect(sidebarSlot).toHaveStyle({ width: "72px" });
    expect(document.documentElement).toHaveAttribute("data-theme", "light");

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(sidebarSlot).toHaveStyle({ width: "220px" });
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      expect(window.localStorage.getItem("theme")).toBe("dark");
      expect(window.localStorage.getItem("dexcowin_mes_sidebar_mode")).toBe("expanded");
    });
  });

  it("로그인 사용자의 테마와 표시 방식을 함께 저장한다", async () => {
    window.sessionStorage.setItem(
      "dexcowin_mes_operator",
      JSON.stringify({
        employee_id: "emp-1",
        name: "테스트 사용자",
        role: "조립",
        department: "조립",
        level: "staff",
        employee_code: "E1",
        warehouse_role: "none",
        department_role: "none",
        theme: "light",
        sidebar_mode: "hover",
        assigned_model_slots: [],
        io_enabled: true,
        hidden_sidebar_tabs: [],
        loginPopupEnabled: false,
      }),
    );
    const saveTheme = vi.spyOn(api, "setEmployeeTheme").mockResolvedValue({} as never);
    const saveSidebarMode = vi.spyOn(api, "setEmployeeSidebarMode").mockResolvedValue({} as never);

    render(
      <DesktopSidebar
        activeTab="dashboard"
        onTabChange={vi.fn()}
        visibleTabs={["dashboard", "admin"]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    fireEvent.click(screen.getByRole("button", { name: "다크 테마" }));
    fireEvent.click(screen.getByRole("button", { name: "접힘 고정" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(saveTheme).toHaveBeenCalledWith("emp-1", "dark");
      expect(saveSidebarMode).toHaveBeenCalledWith("emp-1", "collapsed");
    });
    expect(readCurrentOperator()).toMatchObject({ theme: "dark", sidebar_mode: "collapsed" });
  });

  it.skip("cycles through collapsed, expanded, and hover behavior", () => {
    vi.useFakeTimers();
    const { container } = render(
      <DesktopSidebar
        activeTab="dashboard"
        onTabChange={vi.fn()}
        visibleTabs={["dashboard", "admin"]}
      />,
    );
    const sidebarSlot = container.firstElementChild as HTMLElement;

    fireEvent.mouseEnter(sidebarSlot);
    expect(sidebarSlot).toHaveStyle({ width: "220px" });

    fireEvent.click(screen.getByRole("button", { name: /사이드바 현재 호버 모드/ }));
    expect(sidebarSlot).toHaveStyle({ width: "72px" });
    fireEvent.mouseEnter(sidebarSlot);
    expect(sidebarSlot).toHaveStyle({ width: "72px" });

    fireEvent.click(screen.getByRole("button", { name: /사이드바 현재 접힘 고정/ }));
    expect(sidebarSlot).toHaveStyle({ width: "220px" });
    fireEvent.mouseLeave(sidebarSlot);
    act(() => vi.advanceTimersByTime(220));
    expect(sidebarSlot).toHaveStyle({ width: "220px" });

    fireEvent.mouseEnter(sidebarSlot);
    fireEvent.click(screen.getByRole("button", { name: /사이드바 현재 펼침 고정/ }));
    expect(sidebarSlot).toHaveStyle({ width: "220px" });
    fireEvent.mouseLeave(sidebarSlot);
    act(() => vi.advanceTimersByTime(219));
    expect(sidebarSlot).toHaveStyle({ width: "220px" });
    act(() => vi.advanceTimersByTime(1));
    expect(sidebarSlot).toHaveStyle({ width: "72px" });
  });
});
