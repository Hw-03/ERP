import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppNotification } from "@/lib/api/types";

const state = vi.hoisted(() => ({
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
  notifications: {
    items: [] as AppNotification[],
    unread_count: 0,
  },
  markRead: vi.fn(),
  deleteNotification: vi.fn(),
  deleteRead: vi.fn(),
  setLoginPopup: vi.fn(),
  setCurrentOperator: vi.fn(),
  updateCurrentOperatorPreferences: vi.fn(),
  getStoredBootId: vi.fn(() => "boot-1"),
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
  updateCurrentOperatorPreferences: state.updateCurrentOperatorPreferences,
  getStoredBootId: state.getStoredBootId,
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
    title: "Approval done",
    body: "Kim - warehouse - SR-1",
    target_tab: null,
    target_section: null,
    related_request_id: null,
    is_read: false,
    created_at: "2026-07-02T02:46:00Z",
    ...overrides,
  };
}

describe("NotificationBell", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    state.operator.loginPopupEnabled = true;
    state.notifications = {
      items: [notification(), notification({ notification_id: "n-2", title: "New handover" })],
      unread_count: 2,
    };
    state.markRead.mockClear();
    state.deleteNotification.mockClear();
    state.deleteRead.mockClear();
    state.setLoginPopup.mockReset();
    state.setLoginPopup.mockResolvedValue({});
    state.setCurrentOperator.mockClear();
    state.updateCurrentOperatorPreferences.mockClear();
    state.getStoredBootId.mockClear();
  });

  it("shows the desktop login dialog once when unread notifications exist", async () => {
    window.sessionStorage.setItem("dexcowin_mes_login_popup_pending", "emp-1");

    render(<NotificationBell loginDialogEnabled />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("dexcowin_mes_login_popup_pending")).toBeNull();
  });

  it("does not show the login dialog for a restored session without a pending marker", async () => {
    render(<NotificationBell loginDialogEnabled />);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("consumes the pending marker when login has no unread notifications", async () => {
    state.notifications = { items: [], unread_count: 0 };
    window.sessionStorage.setItem("dexcowin_mes_login_popup_pending", "emp-1");

    const { rerender } = render(<NotificationBell loginDialogEnabled />);

    await waitFor(() => {
      expect(window.sessionStorage.getItem("dexcowin_mes_login_popup_pending")).toBeNull();
    });

    state.notifications = { items: [notification()], unread_count: 1 };
    rerender(<NotificationBell loginDialogEnabled />);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("does not show the login dialog when disabled for the mounted surface", async () => {
    window.sessionStorage.setItem("dexcowin_mes_login_popup_pending", "emp-1");

    render(<NotificationBell loginDialogEnabled={false} />);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(window.sessionStorage.getItem("dexcowin_mes_login_popup_pending")).toBeNull();
    });
  });

  it("does not show the login dialog when the operator disabled the preference", async () => {
    state.operator.loginPopupEnabled = false;
    window.sessionStorage.setItem("dexcowin_mes_login_popup_pending", "emp-1");

    render(<NotificationBell loginDialogEnabled />);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(window.sessionStorage.getItem("dexcowin_mes_login_popup_pending")).toBeNull();
    });
  });

  it("keeps the notification panel available after a disabled automatic dialog", async () => {
    window.sessionStorage.setItem("dexcowin_mes_login_popup_pending", "emp-1");

    render(<NotificationBell loginDialogEnabled={false} />);
    await waitFor(() => expect(window.sessionStorage.getItem("dexcowin_mes_login_popup_pending")).toBeNull());

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("New handover")).toBeInTheDocument();
  });

  it("updates the login popup preference without emitting a login event", async () => {
    render(<NotificationBell loginDialogEnabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: "알림 2건" }));
    fireEvent.click(screen.getByRole("switch", { name: "로그인 팝업" }));

    await waitFor(() => {
      expect(state.setLoginPopup).toHaveBeenCalledWith("emp-1", false);
      expect(state.updateCurrentOperatorPreferences).toHaveBeenCalledWith({ loginPopupEnabled: false });
    });
    expect(state.setCurrentOperator).not.toHaveBeenCalled();
    expect(state.getStoredBootId).not.toHaveBeenCalled();
  });

  it("does not consume the login popup flag from a hidden shell", async () => {
    window.sessionStorage.setItem("dexcowin_mes_login_popup_pending", "emp-1");

    render(
      <div style={{ display: "none" }}>
        <NotificationBell loginDialogEnabled />
      </div>,
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(window.sessionStorage.getItem("dexcowin_mes_login_popup_pending")).toBe("emp-1");
  });

  it("marks an item read and navigates when an item is clicked in the notification panel", async () => {
    const onNavigate = vi.fn();
    state.notifications.items = [notification({ target_tab: "warehouse", target_section: "queue", related_request_id: "request-1" })];
    state.notifications.unread_count = 1;

    render(<NotificationBell onNavigate={onNavigate} loginDialogEnabled={false} />);

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Approval done"));

    expect(state.markRead).toHaveBeenCalledWith({
      recipient_employee_id: "emp-1",
      notification_ids: ["n-1"],
    });
    expect(onNavigate).toHaveBeenCalledWith({ tab: "warehouse", section: "queue", relatedRequestId: "request-1" });
  });

  it("marks every notification read from the login dialog", async () => {
    window.sessionStorage.setItem("dexcowin_mes_login_popup_pending", "emp-1");

    render(<NotificationBell loginDialogEnabled />);

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "\uBAA8\uB450 \uC77D\uC74C" }));

    expect(state.markRead).toHaveBeenCalledWith({ recipient_employee_id: "emp-1" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the notification panel from the login dialog", async () => {
    window.sessionStorage.setItem("dexcowin_mes_login_popup_pending", "emp-1");

    render(<NotificationBell loginDialogEnabled />);

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "\uC54C\uB9BC \uBCF4\uAE30" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("New handover")).toBeInTheDocument();
  });

  it("marks and navigates when an item is selected from the login dialog", async () => {
    const onNavigate = vi.fn();
    state.notifications.items = [notification({ target_tab: "history", target_section: "detail" })];
    state.notifications.unread_count = 1;
    window.sessionStorage.setItem("dexcowin_mes_login_popup_pending", "emp-1");

    render(<NotificationBell onNavigate={onNavigate} loginDialogEnabled />);

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText("Approval done"));

    expect(state.markRead).toHaveBeenCalledWith({
      recipient_employee_id: "emp-1",
      notification_ids: ["n-1"],
    });
    expect(onNavigate).toHaveBeenCalledWith({ tab: "history", section: "detail", relatedRequestId: null });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
