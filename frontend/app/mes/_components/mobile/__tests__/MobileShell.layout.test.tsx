import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppNotification } from "@/lib/api/types";

const state = vi.hoisted(() => ({
  notifications: {
    items: [] as AppNotification[],
    unread_count: 0,
  },
  operator: {
    employee_id: "emp-1",
    name: "Kim",
    department: "Assembly",
    level: "staff",
    employee_code: "E1",
    warehouse_role: "none",
    department_role: "none",
    theme: null,
    assigned_model_slots: [],
    io_enabled: true,
    hidden_sidebar_tabs: [],
    loginPopupEnabled: true,
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    getProductionCapacity: vi.fn(() => new Promise<null>(() => {})),
  },
}));

vi.mock("@/lib/queries/useNotificationsQuery", () => ({
  useNotificationsQuery: () => ({ data: state.notifications }),
}));

vi.mock("@/lib/client-events", () => ({
  sendClientEvent: vi.fn(),
}));

vi.mock("../../login/useCurrentOperator", () => ({
  useCurrentOperator: () => state.operator,
}));

vi.mock("../screens", () => ({
  MobileDashboardScreen: ({ onStatusChange }: { onStatusChange: (status: string) => void }) => (
    <button type="button" onClick={() => onStatusChange("item added")}>
      dashboard screen
    </button>
  ),
  MobileWarehouseScreen: () => <div>warehouse screen</div>,
  MobileDefectScreen: () => <div>defect screen</div>,
  MobileHistoryScreen: () => <div>history screen</div>,
  MobileWeeklyScreen: ({ onExit }: { onExit?: () => void }) => (
    <>
      <div>weekly screen</div>
      <button type="button" onClick={onExit}>back from weekly</button>
    </>
  ),
  MobileWarehouseMapScreen: () => <div>map screen</div>,
  MobileShippingScreen: () => <div>shipping screen</div>,
  MobileAssemblyChecklistScreen: ({ onExit }: { onExit?: () => void }) => (
    <>
      <div>assembly checklist screen</div>
      <button type="button" onClick={onExit}>back from checklist</button>
    </>
  ),
  MobileMoreScreen: ({
    onChecklist,
    onWeekly,
    visibleEntries,
  }: {
    onChecklist?: () => void;
    onWeekly?: () => void;
    visibleEntries?: string[];
  }) => (
    <>
      <div data-testid="more-entry-order">{visibleEntries?.join(",")}</div>
      <button type="button" onClick={onChecklist}>open checklist</button>
      <button type="button" onClick={onWeekly}>open weekly</button>
    </>
  ),
}));

import { MobileShell } from "../MobileShell";
import { sendClientEvent } from "@/lib/client-events";

describe("MobileShell layout", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/mes");
    state.notifications = { items: [], unread_count: 0 };
    state.operator.hidden_sidebar_tabs = [];
    vi.mocked(sendClientEvent).mockClear();
  });

  it("does not render the old mobile top header controls", () => {
    render(<MobileShell />);

    expect(screen.queryByText("DEXCOWIN MES System")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "알림" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "사용자 메뉴" })).not.toBeInTheDocument();
    expect(screen.getByText("dashboard screen")).toBeInTheDocument();
  });

  it("shows unread notification count on the More bottom tab", () => {
    state.notifications = {
      items: [],
      unread_count: 3,
    };

    render(<MobileShell />);

    expect(screen.getByRole("button", { name: "더보기" })).toHaveTextContent("3");
  });

  it("keeps More visible when the checklist is the only available entry", () => {
    state.operator.hidden_sidebar_tabs = ["weekly", "shipping", "warehouseMap"];

    render(<MobileShell />);

    expect(screen.getByRole("button", { name: "더보기" })).toBeInTheDocument();
  });

  it("does not show mobile status messages as floating notifications", () => {
    render(<MobileShell />);

    fireEvent.click(screen.getByRole("button", { name: "dashboard screen" }));

    expect(screen.queryByText("item added")).not.toBeInTheDocument();
  });

  it("opens the checklist from More while keeping the More slot active", () => {
    render(<MobileShell />);

    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.click(screen.getByRole("button", { name: "open checklist" }));

    expect(screen.getByText("assembly checklist screen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "체크리스트" })).toHaveAttribute("aria-current", "page");
  });

  it("orders More entries and returns checklist and weekly screens to More", () => {
    render(<MobileShell />);

    fireEvent.click(screen.getByRole("button", { name: "더보기" }));

    expect(screen.getByTestId("more-entry-order")).toHaveTextContent("assemblyChecklist,shipping,weekly,warehouseMap");

    fireEvent.click(screen.getByRole("button", { name: "open checklist" }));
    fireEvent.click(screen.getByRole("button", { name: "back from checklist" }));

    expect(screen.getByRole("button", { name: "open checklist" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "open weekly" }));
    fireEvent.click(screen.getByRole("button", { name: "back from weekly" }));

    expect(screen.getByRole("button", { name: "open weekly" })).toBeInTheDocument();
  });

  it("logs top-level mobile tab changes once", () => {
    render(<MobileShell />);

    fireEvent.click(screen.getByRole("button", { name: "입출고" }));

    expect(sendClientEvent).toHaveBeenCalledWith({
      event: "ui_nav",
      from: "dashboard",
      to: "warehouse",
      path: "/mes",
      source: "mobile",
    });
    expect(sendClientEvent).toHaveBeenCalledTimes(1);
  });
});
