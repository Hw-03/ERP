import { fireEvent, render, screen } from "@testing-library/react";
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

  beforeEach(() => {
    routerPush.mockClear();
    routerReplace.mockClear();
    queryClientMock.prefetchQuery.mockClear();
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
});
