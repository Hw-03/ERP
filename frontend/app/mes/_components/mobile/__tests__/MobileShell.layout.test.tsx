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
    getProductionCapacity: vi.fn(() => Promise.resolve(null)),
  },
}));

vi.mock("@/lib/queries/useNotificationsQuery", () => ({
  useNotificationsQuery: () => ({ data: state.notifications }),
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
  MobileWeeklyScreen: () => <div>weekly screen</div>,
  MobileWarehouseMapScreen: () => <div>map screen</div>,
  MobileShippingScreen: () => <div>shipping screen</div>,
  MobileMoreScreen: () => <div>more screen</div>,
}));

import { MobileShell } from "../MobileShell";

describe("MobileShell layout", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/mes");
    state.notifications = { items: [], unread_count: 0 };
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

  it("does not show mobile status messages as floating notifications", () => {
    render(<MobileShell />);

    fireEvent.click(screen.getByRole("button", { name: "dashboard screen" }));

    expect(screen.queryByText("item added")).not.toBeInTheDocument();
  });
});
