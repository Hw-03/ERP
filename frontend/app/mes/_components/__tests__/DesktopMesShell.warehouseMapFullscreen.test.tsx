import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DesktopMesShell } from "../DesktopMesShell";
import { SIDEBAR_TAB_IDS } from "../tabAccess";

const desktopTabIconColors = vi.hoisted(() => ({
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
}));

const queryClientMock = vi.hoisted(() => ({
  prefetchQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => queryClientMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("tab=warehouseMap"),
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

vi.mock("../DesktopSidebar", () => ({
  DESKTOP_TAB_ICON_COLORS: desktopTabIconColors,
  DesktopSidebar: () => <nav data-testid="desktop-sidebar" />,
}));

vi.mock("../DesktopTopbar", () => ({
  DesktopTopbar: () => <header data-testid="desktop-topbar" />,
}));

vi.mock("../DesktopInventoryView", () => ({ DesktopInventoryView: () => <div /> }));
vi.mock("../DesktopWarehouseView", () => ({
  DesktopWarehouseView: ({
    itemPickerFullscreen,
    onItemPickerFullscreenChange,
  }: {
    itemPickerFullscreen?: boolean;
    onItemPickerFullscreenChange?: (fullscreen: boolean) => void;
  }) => (
    <section>
      <span data-testid="warehouse-item-picker-fullscreen-state">{String(Boolean(itemPickerFullscreen))}</span>
      <button type="button" onClick={() => onItemPickerFullscreenChange?.(true)}>
        enter item picker fullscreen
      </button>
      <button type="button" onClick={() => onItemPickerFullscreenChange?.(false)}>
        exit item picker fullscreen
      </button>
    </section>
  ),
}));
vi.mock("../DesktopShippingView", () => ({ DesktopShippingView: () => <div /> }));
vi.mock("../DesktopDefectView", () => ({ DesktopDefectView: () => <div /> }));
vi.mock("../DesktopHistoryView", () => ({ DesktopHistoryView: () => <div /> }));
vi.mock("../DesktopWeeklyReportView", () => ({ DesktopWeeklyReportView: () => <div /> }));
vi.mock("../DesktopAdminView", () => ({ DesktopAdminView: () => <div /> }));
vi.mock("../CapacityDetailModal", () => ({ CapacityDetailModal: () => <div /> }));
vi.mock("../_weekly_sections/WeeklyWeekPicker", () => ({
  WeeklyWeekPicker: () => <div />,
  getWeekStartMonday: () => new Date("2026-07-02T00:00:00.000Z"),
}));

vi.mock("../DesktopWarehouseMapTab", () => ({
  DesktopWarehouseMapTab: ({
    fullscreen,
    onFullscreenChange,
  }: {
    fullscreen?: boolean;
    onFullscreenChange?: (fullscreen: boolean) => void;
  }) => (
    <section>
      <span data-testid="warehouse-map-fullscreen-state">{String(Boolean(fullscreen))}</span>
      <button type="button" onClick={() => onFullscreenChange?.(true)}>
        enter fullscreen
      </button>
    </section>
  ),
}));

describe("DesktopMesShell warehouse map fullscreen", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/mes?tab=warehouseMap");
  });

  it("mocks colors for every desktop tab", () => {
    expect(Object.keys(desktopTabIconColors).sort()).toEqual([...SIDEBAR_TAB_IDS, "settings"].sort());
  });

  it("re-renders the warehouse map tab when fullscreen changes", () => {
    const { container } = render(<DesktopMesShell />);

    expect(screen.getByTestId("warehouse-map-fullscreen-state")).toHaveTextContent("false");
    expect(screen.getByTestId("desktop-topbar")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "enter fullscreen" }));

    expect(screen.getByTestId("warehouse-map-fullscreen-state")).toHaveTextContent("true");
    expect(screen.queryByTestId("desktop-topbar")).toBeNull();
    const tabContent = container.querySelector<HTMLDivElement>(".desktop-tab-content");
    expect(tabContent).toBeInstanceOf(HTMLDivElement);
    expect(tabContent!.className).not.toMatch(/\bmt-\S+/);
  });

  it("hides the desktop topbar while the warehouse item picker is fullscreen", () => {
    window.history.replaceState({}, "", "/mes?tab=warehouse");
    render(<DesktopMesShell />);

    expect(screen.getByTestId("warehouse-item-picker-fullscreen-state")).toHaveTextContent("false");
    expect(screen.getByTestId("desktop-topbar")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "enter item picker fullscreen" }));

    expect(screen.getByTestId("warehouse-item-picker-fullscreen-state")).toHaveTextContent("true");
    expect(screen.queryByTestId("desktop-topbar")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "exit item picker fullscreen" }));
    expect(screen.getByTestId("warehouse-item-picker-fullscreen-state")).toHaveTextContent("false");
    expect(screen.getByTestId("desktop-topbar")).toBeInTheDocument();
  });
});
