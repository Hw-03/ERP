import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppNotification } from "@/lib/api/types";
import { NotificationPanel } from "../NotificationPanel";

const emptyHandlers = {
  onItemClick: vi.fn(),
  onMarkAll: vi.fn(),
  onDeleteItem: vi.fn(),
  onDeleteRead: vi.fn(),
};

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    notification_id: "n-1",
    recipient_employee_id: "emp-1",
    type: "approval_request",
    title: "approval needed",
    body: "warehouse_to_dept",
    target_tab: null,
    target_section: null,
    related_request_id: null,
    is_read: false,
    created_at: "2026-07-01T01:00:00Z",
    ...overrides,
  };
}

describe("NotificationPanel", () => {
  it("shows login popup enable action when the employee setting is off", () => {
    const onToggleLoginPopup = vi.fn();
    render(
      <NotificationPanel
        items={[makeNotification()]}
        unread={1}
        loginPopupEnabled={false}
        onToggleLoginPopup={onToggleLoginPopup}
        {...emptyHandlers}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "로그인시 팝업 띄우기" }));

    expect(onToggleLoginPopup).toHaveBeenCalledTimes(1);
  });

  it("shows login popup stop action when the employee setting is on", () => {
    render(
      <NotificationPanel
        items={[]}
        unread={0}
        loginPopupEnabled={true}
        onToggleLoginPopup={vi.fn()}
        {...emptyHandlers}
      />,
    );

    expect(screen.getByRole("button", { name: "로그인시 팝업 띄우기 중지" })).toBeInTheDocument();
  });
});