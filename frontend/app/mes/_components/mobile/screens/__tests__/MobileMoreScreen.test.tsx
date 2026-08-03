import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileMoreScreen } from "../MobileMoreScreen";

vi.mock("../../../notifications/NotificationBell", () => ({
  NotificationBell: ({ loginDialogEnabled }: { loginDialogEnabled: boolean }) => (
    <button type="button" data-login-dialog-enabled={String(loginDialogEnabled)}>
      notification bell
    </button>
  ),
}));

const operator = {
  employee_id: "emp-1",
  name: "Kim",
  department: "Assembly",
  level: "staff",
  employee_code: "E1",
  warehouse_role: "primary",
  department_role: "none",
  theme: null,
  assigned_model_slots: [],
  io_enabled: true,
  hidden_sidebar_tabs: [],
  loginPopupEnabled: true,
};

describe("MobileMoreScreen", () => {
  it("does not apply a card shadow to the More-screen profile area", () => {
    const { container } = render(
      <MobileMoreScreen
        operator={operator}
        onProfile={() => {}}
        onNotificationNavigate={() => {}}
        onChecklist={() => {}}
        onDailyReport={() => {}}
        onWeekly={() => {}}
        onShipping={() => {}}
        onWarehouseMap={() => {}}
      />,
    );

    expect(container.querySelector(".card")).toBeNull();
  });

  it("combines profile and notification into one top card", () => {
    const onProfile = vi.fn();

    render(
      <MobileMoreScreen
        operator={operator}
        unreadCount={7}
        onProfile={onProfile}
        onNotificationNavigate={() => {}}
        onChecklist={() => {}}
        onDailyReport={() => {}}
        onWeekly={() => {}}
        onShipping={() => {}}
        onWarehouseMap={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /프로필.*Kim/s }));

    expect(onProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByText("프로필")).toBeInTheDocument();
    expect(screen.queryByText(/알림.*7건/)).toBeNull();
    expect(screen.getByRole("button", { name: "notification bell" })).toHaveAttribute(
      "data-login-dialog-enabled",
      "false",
    );
    expect(screen.getByText("Kim")).toBeInTheDocument();
  });

  it("fills the available menu space with checklist, daily report, shipping, weekly, and warehouse-map entries in order", () => {
    const onChecklist = vi.fn();
    const onDailyReport = vi.fn();
    const onWeekly = vi.fn();
    const onShipping = vi.fn();
    const onWarehouseMap = vi.fn();

    render(
      <MobileMoreScreen
        operator={operator}
        onProfile={() => {}}
        onNotificationNavigate={() => {}}
        onChecklist={onChecklist}
        onDailyReport={onDailyReport}
        onWeekly={onWeekly}
        onShipping={onShipping}
        onWarehouseMap={onWarehouseMap}
      />,
    );

    expect(screen.getByTestId("mobile-more-notification-target")).toHaveClass("h-16");
    const menuList = screen.getByTestId("mobile-more-menu-list");
    const menuButtons = within(menuList).getAllByRole("button");

    expect(menuList).toHaveClass("flex-1");
    expect(menuButtons.map((button) => button.textContent)).toEqual([
      expect.stringContaining("체크리스트"),
      expect.stringContaining("일일 작업 일보"),
      expect.stringContaining("출하"),
      expect.stringContaining("주간보고"),
      expect.stringContaining("창고 지도"),
    ]);
    menuButtons.forEach((button) => expect(button).toHaveClass("flex-1"));

    fireEvent.click(screen.getByRole("button", { name: /체크리스트/ }));
    fireEvent.click(screen.getByRole("button", { name: /일일 작업 일보/ }));

    fireEvent.click(screen.getByRole("button", { name: /출하/ }));
    fireEvent.click(screen.getByRole("button", { name: /주간보고/ }));
    fireEvent.click(screen.getByRole("button", { name: /창고 지도/ }));

    expect(onChecklist).toHaveBeenCalledTimes(1);
    expect(onDailyReport).toHaveBeenCalledTimes(1);
    expect(onWeekly).toHaveBeenCalledTimes(1);
    expect(onShipping).toHaveBeenCalledTimes(1);
    expect(onWarehouseMap).toHaveBeenCalledTimes(1);
  });

  it("keeps the common 32px visual gap above the frozen tab bar", () => {
    render(
      <MobileMoreScreen
        operator={operator}
        onProfile={() => {}}
        onNotificationNavigate={() => {}}
        onChecklist={() => {}}
        onDailyReport={() => {}}
        onWeekly={() => {}}
        onShipping={() => {}}
        onWarehouseMap={() => {}}
      />,
    );

    expect(screen.getByTestId("mobile-more-menu-list").parentElement).toHaveClass("pb-6");
  });
});
