import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppNotification } from "@/lib/api/types";

const state = vi.hoisted(() => ({
  operator: {
    employee_id: "emp-1",
    name: "김현우",
    department: "조립",
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
  notifications: {
    items: [] as AppNotification[],
    unread_count: 0,
  },
  markRead: vi.fn(),
  deleteNotification: vi.fn(),
  deleteRead: vi.fn(),
  setLoginPopup: vi.fn(),
  setCurrentOperator: vi.fn(),
}));

vi.mock("@/lib/queries/useNotificationsQuery", () => ({
  useNotificationsQuery: () => ({ data: state.notifications }),
  useMarkNotificationsReadMutation: () => ({ mutate: state.markRead }),
  useDeleteNotificationMutation: () => ({ mutate: state.deleteNotification }),
  useDeleteReadNotificationsMutation: () => ({ mutate: state.deleteRead }),
}));

vi.mock("@/lib/api/employees", () => ({
  employeesApi: {
    setLoginPopup: state.setLoginPopup,
  },
}));

vi.mock("../../login/useCurrentOperator", () => ({
  useCurrentOperator: () => state.operator,
  setCurrentOperator: state.setCurrentOperator,
  getStoredBootId: () => "boot-1",
  consumeLoginNotificationPopupPending: (employeeId: string) => {
    if (window.sessionStorage.getItem("dexcowin_mes_login_popup_pending") !== employeeId) return false;
    window.sessionStorage.removeItem("dexcowin_mes_login_popup_pending");
    return true;
  },
}));

import { NotificationBell } from "../NotificationBell";

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    notification_id: "n-1",
    recipient_employee_id: "emp-1",
    type: "approval_approved",
    title: "결재 승인됨",
    body: "김현우 · 창고 → 부서 · SR-1",
    target_tab: null,
    target_section: null,
    related_request_id: null,
    is_read: false,
    created_at: "2026-07-02T02:46:00Z",
    ...overrides,
  };
}

describe("NotificationBell login popup", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    state.operator.loginPopupEnabled = true;
    state.notifications = {
      items: [notification(), notification({ notification_id: "n-2", title: "새 인수인계 도착" })],
      unread_count: 2,
    };
    state.markRead.mockClear();
    state.deleteNotification.mockClear();
    state.deleteRead.mockClear();
    state.setLoginPopup.mockReset();
    state.setLoginPopup.mockResolvedValue({});
    state.setCurrentOperator.mockClear();
  });

  it("shows a centered login notification dialog only when the login flag is pending", async () => {
    window.sessionStorage.setItem("dexcowin_mes_login_popup_pending", "emp-1");

    render(<NotificationBell />);

    expect(await screen.findByRole("dialog", { name: "로그인 알림" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "로그인 알림" }).parentElement).toHaveStyle({
      position: "fixed",
      display: "flex",
      zIndex: "260",
    });
    expect(screen.getByRole("button", { name: "모두 읽음" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "알림 보기" })).toBeInTheDocument();
  });

  it("does not open the login dialog during a restored session", async () => {
    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "로그인 알림" })).not.toBeInTheDocument();
    });
  });

  it("does not consume the login popup flag from a hidden shell", async () => {
    window.sessionStorage.setItem("dexcowin_mes_login_popup_pending", "emp-1");

    render(
      <div style={{ display: "none" }}>
        <NotificationBell />
      </div>,
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(window.sessionStorage.getItem("dexcowin_mes_login_popup_pending")).toBe("emp-1");

    render(<NotificationBell />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("dexcowin_mes_login_popup_pending")).toBeNull();
  });

  it("marks all unread notifications from the login dialog", async () => {
    window.sessionStorage.setItem("dexcowin_mes_login_popup_pending", "emp-1");
    render(<NotificationBell />);

    fireEvent.click(await screen.findByRole("button", { name: "모두 읽음" }));

    expect(state.markRead).toHaveBeenCalledWith({ recipient_employee_id: "emp-1" });
    expect(screen.queryByRole("dialog", { name: "로그인 알림" })).not.toBeInTheDocument();
  });

  it("opens the notification panel from the login dialog", async () => {
    window.sessionStorage.setItem("dexcowin_mes_login_popup_pending", "emp-1");
    render(<NotificationBell />);

    fireEvent.click(await screen.findByRole("button", { name: "알림 보기" }));

    expect(screen.queryByRole("dialog", { name: "로그인 알림" })).not.toBeInTheDocument();
    expect(screen.getByText("새 인수인계 도착")).toBeInTheDocument();
  });

  it("marks an item read and navigates when an item is clicked in the login dialog", async () => {
    const onNavigate = vi.fn();
    window.sessionStorage.setItem("dexcowin_mes_login_popup_pending", "emp-1");
    state.notifications.items = [notification({ target_tab: "history", target_section: "detail" })];
    state.notifications.unread_count = 1;

    render(<NotificationBell onNavigate={onNavigate} />);

    fireEvent.click(await screen.findByRole("button", { name: /결재 승인됨/ }));

    expect(state.markRead).toHaveBeenCalledWith({
      recipient_employee_id: "emp-1",
      notification_ids: ["n-1"],
    });
    expect(onNavigate).toHaveBeenCalledWith("history", "detail");
  });
});
