import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileMoreScreen } from "../MobileMoreScreen";

vi.mock("../../../notifications/NotificationBell", () => ({
  NotificationBell: () => <button type="button">notification bell</button>,
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
  it("combines profile and notification into one top card", () => {
    const onProfile = vi.fn();

    render(
      <MobileMoreScreen
        operator={operator}
        unreadCount={7}
        onProfile={onProfile}
        onNotificationNavigate={() => {}}
        onWeekly={() => {}}
        onShipping={() => {}}
        onWarehouseMap={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /프로필.*Kim/s }));

    expect(onProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByText("프로필")).toBeInTheDocument();
    expect(screen.queryByText(/알림.*7건/)).toBeNull();
    expect(screen.getByRole("button", { name: "notification bell" })).toBeInTheDocument();
    expect(screen.getByText("Kim")).toBeInTheDocument();
  });
});
