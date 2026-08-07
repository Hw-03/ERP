import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DesktopMesShell } from "../DesktopMesShell";
import type { DesktopTabId } from "../tabAccess";
import { sendClientEvent } from "@/lib/client-events";

const routerPush = vi.hoisted(() => vi.fn());
const routerReplace = vi.hoisted(() => vi.fn());
const queryClientMock = vi.hoisted(() => ({
  prefetchQuery: vi.fn(),
}));
const shippingViewProps = vi.hoisted(() => vi.fn());
const adminViewMounts = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => queryClientMock,
}));

vi.mock("@/lib/client-events", () => ({
  sendClientEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  useSearchParams: () => new URLSearchParams("tab=history"),
}));

vi.mock("@/lib/ui/dirty-guard", () => ({
  DirtyGuardProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useConfirmNavigation: () => (next: () => void) => next(),
  useFlushDirtyEntries: () => async () => {},
}));

vi.mock("@/lib/queries/useProductionQuery", () => ({
  useProductionCapacityQuery: () => ({ data: null, refetch: vi.fn() }),
}));

vi.mock("../login/useCurrentOperator", () => ({
  useCurrentOperator: () => null,
  readCurrentOperator: () => null,
  setCurrentOperator: vi.fn(),
}));

const sidebarTabs: DesktopTabId[] = ["dashboard", "warehouse", "shipping", "history", "dailyReport", "weekly", "warehouseMap", "settings"];

vi.mock("../DesktopSidebar", () => ({
  DESKTOP_TAB_ICON_COLORS: {
    dashboard: "#fff",
    warehouse: "#fff",
    shipping: "#fff",
    warehouseMap: "#fff",
    defect: "#fff",
    history: "#fff",
    dailyReport: "#fff",
    weekly: "#fff",
    admin: "#fff",
    settings: "#fff",
  },
  DesktopSidebar: ({
    activeTab,
    onTabChange,
    onOpenAdminPinEntry,
  }: {
    activeTab: DesktopTabId;
    onTabChange: (tab: DesktopTabId) => void;
    onOpenAdminPinEntry: () => void;
  }) => (
    <nav>
      <button type="button" onClick={onOpenAdminPinEntry}>admin pin entry</button>
      {sidebarTabs.map((tab) => (
        <button
          key={tab}
          type="button"
          aria-current={activeTab === tab ? "page" : undefined}
          onClick={() => onTabChange(tab)}
        >
          {tab}
        </button>
      ))}
    </nav>
  ),
}));

vi.mock("../DesktopTopbar", () => ({
  DesktopTopbar: ({ title }: { title: string }) => <header>{title}</header>,
}));

vi.mock("../DesktopInventoryView", () => ({ DesktopInventoryView: () => <main>dashboard content</main> }));
vi.mock("../DesktopWarehouseView", () => ({
  DesktopWarehouseView: ({ onSubmitSuccess }: { onSubmitSuccess?: () => void }) => (
    <main>
      <button type="button" onClick={() => onSubmitSuccess?.()}>warehouse submit</button>
    </main>
  ),
}));
vi.mock("../DesktopShippingView", () => ({
  DesktopShippingView: (props: Record<string, unknown>) => {
    shippingViewProps(props);
    return <main>shipping content</main>;
  },
}));
vi.mock("../DesktopDefectView", () => ({ DesktopDefectView: () => <main>defect content</main> }));
vi.mock("../DesktopHistoryView", () => ({ DesktopHistoryView: () => <main>history content</main> }));
vi.mock("../DesktopDailyWorkReportView", () => ({ DesktopDailyWorkReportView: () => <main>daily report content</main> }));
vi.mock("../DesktopWeeklyReportView", () => ({ DesktopWeeklyReportView: () => <main>weekly content</main> }));
vi.mock("../DesktopAdminView", async () => {
  const { useEffect } = await import("react");
  return {
    DesktopAdminView: () => {
      useEffect(() => {
        adminViewMounts();
      }, []);
      return <main>admin content</main>;
    },
  };
});
vi.mock("../DesktopWarehouseMapTab", () => ({ DesktopWarehouseMapTab: () => <main>warehouse map content</main> }));
vi.mock("../CapacityDetailModal", () => ({ CapacityDetailModal: () => <div /> }));
vi.mock("../_weekly_sections/WeeklyWeekPicker", () => ({
  WeeklyWeekPicker: () => <div />,
  getWeekStartMonday: () => new Date("2026-07-02T00:00:00.000Z"),
}));

describe("DesktopMesShell tab transition", () => {
  const originalStartViewTransition = document.startViewTransition;

  beforeEach(() => {
    window.history.replaceState({}, "", "/mes?tab=history");
    routerPush.mockClear();
    routerReplace.mockClear();
    queryClientMock.prefetchQuery.mockClear();
    shippingViewProps.mockClear();
    adminViewMounts.mockClear();
    vi.mocked(sendClientEvent).mockClear();
  });

  afterEach(() => {
    document.startViewTransition = originalStartViewTransition;
  });

  it("commits a tab click immediately and updates the URL without App Router navigation", () => {
    document.startViewTransition = vi.fn();
    const pushState = vi.spyOn(window.history, "pushState");

    render(<DesktopMesShell />);

    expect(screen.getByText("history content")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "weekly" }));

    expect(document.startViewTransition).not.toHaveBeenCalled();
    expect(screen.getByText("weekly content")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveTextContent("주간보고");
    expect(screen.getByRole("button", { name: "weekly" })).toHaveAttribute("aria-current", "page");
    expect(pushState).toHaveBeenCalledWith(null, "", "?tab=weekly");
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
    expect(sendClientEvent).toHaveBeenCalledWith({
      event: "ui_nav",
      from: "history",
      to: "weekly",
      path: "/mes",
      source: "desktop",
    });
  });

  it("prefetches the default history page before the first history tab visit", () => {
    render(<DesktopMesShell />);

    expect(queryClientMock.prefetchQuery.mock.calls[0][0].queryKey.slice(0, 2)).toEqual([
      "transactions",
      "displayGroups",
    ]);
    expect(queryClientMock.prefetchQuery).toHaveBeenCalledWith(expect.objectContaining({
      queryKey: [
        "transactions",
        "displayGroups",
        expect.objectContaining({ limit: 100, cursor: null }),
      ],
    }));
    expect(queryClientMock.prefetchQuery).toHaveBeenCalledWith(expect.objectContaining({
      queryKey: [
        "transactions",
        "summary",
        expect.objectContaining({ dateFrom: expect.any(String) }),
      ],
    }));
  });

  it("does not wire the abolished shipping preparation entry into the shell", () => {
    render(<DesktopMesShell />);

    fireEvent.click(screen.getByRole("button", { name: "shipping" }));
    expect(shippingViewProps).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ onStartPrepareWork: expect.any(Function) }),
    );
  });

  it("opens settings from a direct tab URL even when it is not an employee-visible business tab", () => {
    window.history.replaceState({}, "", "/mes?tab=settings");

    render(<DesktopMesShell />);

    expect(screen.getByRole("banner")).toHaveTextContent("설정");
    expect(screen.getByRole("button", { name: "settings" })).toHaveAttribute("aria-current", "page");
  });

  it("remounts the admin PIN entry when requested from an already active admin tab", async () => {
    render(<DesktopMesShell />);

    fireEvent.click(screen.getByRole("button", { name: "admin pin entry" }));
    await waitFor(() => expect(adminViewMounts).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "admin pin entry" }));
    await waitFor(() => expect(adminViewMounts).toHaveBeenCalledTimes(2));
  });

  it.each(["dashboard", "history", "dailyReport", "weekly"] as const)(
    "keeps 12px top spacing for the %s tab content after navigation",
    (tab) => {
      const { container } = render(<DesktopMesShell />);

      fireEvent.click(screen.getByRole("button", { name: tab }));

      expect(container.querySelector(".desktop-tab-content")).toHaveClass("mt-3");
    },
  );
});
