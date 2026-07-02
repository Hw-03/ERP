import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppNotification } from "@/lib/api/types";
import { NotificationPanel } from "../NotificationPanel";

const TEXT = {
  title: "알림",
  loginPopup: "로그인 팝업",
};

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
  it("keeps the title row separate from login popup controls", () => {
    render(
      <NotificationPanel
        items={[makeNotification({ is_read: true })]}
        unread={0}
        loginPopupEnabled={true}
        onToggleLoginPopup={vi.fn()}
        {...emptyHandlers}
      />,
    );

    expect(screen.getByText(TEXT.title)).toHaveClass("shrink-0");
    expect(screen.getByText(TEXT.loginPopup)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: TEXT.loginPopup })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "읽은 알림 삭제" })).toHaveClass("no-btn-inset");
  });

  it("renders the login popup switch off and toggles on click", () => {
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

    const toggle = screen.getByRole("switch", { name: TEXT.loginPopup });
    const knob = screen.getByTestId("login-popup-switch-knob");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveClass("no-btn-inset");
    expect(screen.getByText("꺼짐")).toBeInTheDocument();
    expect(knob).toHaveStyle({ left: "2px", transform: "translateX(0px)" });
    expect(screen.queryByText("켜기")).not.toBeInTheDocument();
    expect(screen.queryByText("끄기")).not.toBeInTheDocument();
    expect(screen.queryByText("켜짐")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(onToggleLoginPopup).toHaveBeenCalledTimes(1);
  });

  it("renders the login popup switch on", () => {
    render(
      <NotificationPanel
        items={[]}
        unread={0}
        loginPopupEnabled={true}
        onToggleLoginPopup={vi.fn()}
        {...emptyHandlers}
      />,
    );

    const toggle = screen.getByRole("switch", { name: TEXT.loginPopup });
    const knob = screen.getByTestId("login-popup-switch-knob");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toHaveClass("no-btn-inset");
    expect(screen.getByText("켜짐")).toBeInTheDocument();
    expect(knob).toHaveStyle({ left: "2px", transform: "translateX(20px)" });
  });

  it("disables the login popup switch while saving", () => {
    render(
      <NotificationPanel
        items={[]}
        unread={0}
        loginPopupEnabled={true}
        loginPopupUpdating={true}
        onToggleLoginPopup={vi.fn()}
        {...emptyHandlers}
      />,
    );

    expect(screen.getByRole("switch", { name: TEXT.loginPopup })).toBeDisabled();
  });
});
