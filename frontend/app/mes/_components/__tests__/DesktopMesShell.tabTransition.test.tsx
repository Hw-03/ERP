import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DesktopMesShell } from "../DesktopMesShell";
import type { DesktopTabId } from "../tabAccess";

const routerPush = vi.hoisted(() => vi.fn());
const routerReplace = vi.hoisted(() => vi.fn());
const queryClientMock = vi.hoisted(() => ({
  prefetchQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => queryClientMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  useSearchParams: () => new URLSearchParams("tab=history"),
}));

vi.mock("@/lib/ui/dirty-guard", () => ({
  DirtyGuardProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useConfirmNavigation: () => (next: () => void) => next(),
}));

vi.mock("@/lib/queries/useProductionQuery", () => ({
  useProductionCapacityQuery: () => ({ data: null, refetch: vi.fn() }),
}));

vi.mock("../login/useCurrentOperator", () => ({
  useCurrentOperator: () => null,
}));

const sidebarTabs: DesktopTabId[] = ["dashboard", "history", "weekly", "warehouseMap"];

vi.mock("../DesktopSidebar", () => ({
  DESKTOP_TAB_ICON_COLORS: {
    dashboard: "#fff",
    warehouse: "#fff",
    shipping: "#fff",
    warehouseMap: "#fff",
    defect: "#fff",
    history: "#fff",
    weekly: "#fff",
    admin: "#fff",
  },
  DesktopSidebar: ({
    activeTab,
    onTabChange,
  }: {
    activeTab: DesktopTabId;
    onTabChange: (tab: DesktopTabId) => void;
  }) => (
    <nav>
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
vi.mock("../DesktopWarehouseView", () => ({ DesktopWarehouseView: () => <main>warehouse content</main> }));
vi.mock("../DesktopShippingView", () => ({ DesktopShippingView: () => <main>shipping content</main> }));
vi.mock("../DesktopDefectView", () => ({ DesktopDefectView: () => <main>defect content</main> }));
vi.mock("../DesktopHistoryView", () => ({ DesktopHistoryView: () => <main>history content</main> }));
vi.mock("../DesktopWeeklyReportView", () => ({ DesktopWeeklyReportView: () => <main>weekly content</main> }));
vi.mock("../DesktopAdminView", () => ({ DesktopAdminView: () => <main>admin content</main> }));
vi.mock("../DesktopWarehouseMapTab", () => ({ DesktopWarehouseMapTab: () => <main>warehouse map content</main> }));
vi.mock("../CapacityDetailModal", () => ({ CapacityDetailModal: () => <div /> }));
vi.mock("../_weekly_sections/WeeklyWeekPicker", () => ({
  WeeklyWeekPicker: () => <div />,
  getWeekStartMonday: () => new Date("2026-07-02T00:00:00.000Z"),
}));

describe("DesktopMesShell tab transition", () => {
  const originalStartViewTransition = document.startViewTransition;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    routerPush.mockClear();
    routerReplace.mockClear();
    queryClientMock.prefetchQuery.mockClear();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });

  afterEach(() => {
    document.startViewTransition = originalStartViewTransition;
    window.matchMedia = originalMatchMedia;
  });

  it("commits a tab click inside the desktop content view transition when available", () => {
    const callbacks: Array<() => void> = [];
    document.startViewTransition = vi.fn((callback: () => void) => {
      callbacks.push(callback);
      callback();
      return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve() };
    });

    render(<DesktopMesShell />);

    expect(screen.getByText("history content")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "weekly" }));

    expect(document.startViewTransition).toHaveBeenCalledTimes(1);
    expect(callbacks).toHaveLength(1);
    expect(screen.getByText("weekly content")).toBeInTheDocument();
    expect(routerPush).toHaveBeenCalledWith("?tab=weekly", { scroll: false });
  });

  it("falls back to an immediate tab commit when motion is reduced", () => {
    document.startViewTransition = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });

    render(<DesktopMesShell />);

    fireEvent.click(screen.getByRole("button", { name: "dashboard" }));

    expect(document.startViewTransition).not.toHaveBeenCalled();
    expect(screen.getByText("dashboard content")).toBeInTheDocument();
    expect(routerPush).toHaveBeenCalledWith("?tab=dashboard", { scroll: false });
  });
});
