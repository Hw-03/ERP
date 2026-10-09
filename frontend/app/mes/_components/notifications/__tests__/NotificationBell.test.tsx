import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppNotification } from "@/lib/api/types";

const state = vi.hoisted(() => ({
  operator: {
    employee_id: "emp-1",
    name: "Kim",
    department: "Assembly",
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
  queryLoading: false,
  queryHasData: true,
  queryError: null as Error | null,
  refetch: vi.fn(),
  unreadNotifications: null as { items: AppNotification[]; unread_count: number } | null,
  queryCalls: vi.fn(),
}));

vi.mock("@/lib/queries/useNotificationsQuery", () => ({
  useNotificationsQuery: (employeeId: string, options?: { unreadOnly?: boolean; enabled?: boolean }) => {
    state.queryCalls(employeeId, options);
    return { data: state.queryHasData ? (options?.unreadOnly ? state.unreadNotifications ?? state.notifications : state.notifications) : undefined, dataUpdatedAt: options?.unreadOnly && state.unreadNotifications ? 2 : 1, isLoading: state.queryLoading, error: state.queryError, refetch: state.refetch };
  },
  useMarkNotificationsReadMutation: () => ({ mutate: state.markRead, mutateAsync: state.markRead }),
  useDeleteNotificationMutation: () => ({ mutate: state.deleteNotification, mutateAsync: state.deleteNotification }),
  useDeleteReadNotificationsMutation: () => ({ mutate: state.deleteRead, mutateAsync: state.deleteRead }),
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
    state.queryLoading = false;
    state.queryHasData = true;
    state.queryError = null;
    state.unreadNotifications = null;
    state.queryCalls.mockClear();
    state.refetch.mockClear();
    window.sessionStorage.clear();
    state.operator.loginPopupEnabled = true;
    state.notifications = {
      items: [notification(), notification({ notification_id: "n-2", title: "New handover" })],
      unread_count: 2,
    };
    state.markRead.mockReset().mockResolvedValue({});
    state.deleteNotification.mockReset().mockResolvedValue({});
    state.deleteRead.mockReset().mockResolvedValue({});
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
    expect(screen.getByRole("tab", { name: "안 읽음" })).toHaveAttribute("aria-selected", "true");
    expect(window.sessionStorage.getItem("dexcowin_mes_login_popup_pending")).toBeNull();
  });

  it("모바일 알림 버튼이 패널에 최초 조회·실패·재시도를 전달한다", () => {
    state.queryHasData = false;
    state.queryLoading = true;
    const { rerender } = render(<NotificationBell mobilePresentation loginDialogEnabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "알림" }));
    expect(screen.getByRole("status", { name: "알림 목록 불러오는 중" })).toBeInTheDocument();
    state.queryLoading = false;
    state.queryError = new Error("offline");
    rerender(<NotificationBell mobilePresentation loginDialogEnabled={false} />);
    expect(screen.queryByRole("status", { name: "알림 목록 불러오는 중" })).not.toBeInTheDocument();
    expect(screen.queryByText("알림이 없습니다.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(state.refetch).toHaveBeenCalledOnce();
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
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith({ tab: "warehouse", section: "queue", relatedRequestId: "request-1" }));
  });

  it("marks every notification read from the login dialog", async () => {
    window.sessionStorage.setItem("dexcowin_mes_login_popup_pending", "emp-1");

    render(<NotificationBell loginDialogEnabled />);

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "\uBAA8\uB450 \uC77D\uC74C" }));

    expect(state.markRead).toHaveBeenCalledWith({ recipient_employee_id: "emp-1" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "안 읽음" })).toHaveAttribute("aria-selected", "true");
  });

  it("switches filters in the same dialog and manual reopening defaults to all", async () => {
    window.sessionStorage.setItem("dexcowin_mes_login_popup_pending", "emp-1");

    render(<NotificationBell loginDialogEnabled />);

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("tab", { name: "전체" }));
    expect(screen.getByRole("dialog")).toBe(dialog);
    fireEvent.click(within(dialog).getByRole("tab", { name: "안 읽음" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "알림 닫기" }));
    fireEvent.click(screen.getByRole("button", { name: "알림 2건" }));
    expect(screen.getByRole("tab", { name: "전체" })).toHaveAttribute("aria-selected", "true");
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
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith({ tab: "history", section: "detail", relatedRequestId: null }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("fetches older unread items even when the recent all list contains only read items", async () => {
    state.notifications = { items: [notification({ is_read: true })], unread_count: 1 };
    state.unreadNotifications = { items: [notification({ notification_id: "older", title: "Older unread" })], unread_count: 1 };
    window.sessionStorage.setItem("dexcowin_mes_login_popup_pending", "emp-1");
    render(<NotificationBell loginDialogEnabled />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Older unread")).toBeInTheDocument();
    expect(screen.queryByText("Approval done")).not.toBeInTheDocument();
    expect(state.queryCalls).toHaveBeenCalledWith("emp-1", { unreadOnly: true, enabled: true });
  });

  it("uses the freshest unread count when the filtered response reflects another device's read", () => {
    render(<NotificationBell loginDialogEnabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "알림 2건" }));
    state.unreadNotifications = { items: [], unread_count: 0 };
    fireEvent.click(screen.getByRole("tab", { name: "안 읽음" }));
    expect(screen.getByText("읽지 않은 알림 0건")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "모두 읽음" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "알림 닫기" }));
    expect(screen.getByRole("button", { name: "알림", exact: true })).toBeInTheDocument();
  });

  it.each(["read", "all", "delete", "deleteRead", "setting"] as const)("keeps the dialog open and shows %s failure", async (action) => {
    state.notifications.items[1].is_read = true;
    const onNavigate = vi.fn();
    state.notifications.items[0].target_tab = "warehouse";
    if (action === "read" || action === "all") state.markRead.mockRejectedValueOnce(new Error("offline"));
    if (action === "delete") state.deleteNotification.mockRejectedValueOnce(new Error("offline"));
    if (action === "deleteRead") state.deleteRead.mockRejectedValueOnce(new Error("offline"));
    if (action === "setting") state.setLoginPopup.mockRejectedValueOnce(new Error("offline"));
    render(<NotificationBell onNavigate={onNavigate} loginDialogEnabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "알림 2건" }));
    if (action === "read") fireEvent.click(screen.getByText("Approval done"));
    if (action === "all") fireEvent.click(screen.getByRole("button", { name: "모두 읽음" }));
    if (action === "delete") fireEvent.click(screen.getAllByRole("button", { name: "알림 삭제" })[0]);
    if (action === "deleteRead") fireEvent.click(screen.getByRole("button", { name: "읽은 알림 삭제" }));
    if (action === "setting") fireEvent.click(screen.getByRole("switch", { name: "로그인 팝업" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(state.updateCurrentOperatorPreferences).not.toHaveBeenCalled();
  });

  it("shows initial desktop query errors and retry inside the dialog", () => {
    state.queryHasData = false;
    state.queryError = new Error("offline");
    render(<NotificationBell loginDialogEnabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "알림" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });

  it.each(["loading", "error"] as const)("does not report an unknown initial %s count as zero and preserves known counts", (phase) => {
    state.queryHasData = false;
    state.queryLoading = phase === "loading";
    state.queryError = phase === "error" ? new Error("offline") : null;
    const { rerender } = render(<NotificationBell loginDialogEnabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "알림" }));
    expect(screen.queryByText("읽지 않은 알림 0건")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "모두 읽음" })).toBeDisabled();

    state.queryHasData = true;
    state.queryLoading = false;
    state.queryError = null;
    state.notifications = { items: [], unread_count: 0 };
    rerender(<NotificationBell loginDialogEnabled={false} />);
    expect(screen.getByText("읽지 않은 알림 0건")).toBeInTheDocument();

    state.notifications = { items: [notification()], unread_count: 1 };
    state.queryError = new Error("refresh failed");
    rerender(<NotificationBell loginDialogEnabled={false} />);
    expect(screen.getByText("읽지 않은 알림 1건")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "알림 1건" })).toBeInTheDocument();
    expect(screen.queryByText("읽지 않은 알림 0건")).not.toBeInTheDocument();
  });
});
