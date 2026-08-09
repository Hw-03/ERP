import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { DailyWorkDatePicker } from "../_daily_report/DailyWorkDatePicker";
import { DesktopTopbar } from "../DesktopTopbar";

const notificationBellState = vi.hoisted(() => ({
  loginDialogEnabled: undefined as boolean | undefined,
  operator: null as null | { employee_id: string; name: string; department: string; warehouse_role: string; department_role: string },
}));

vi.mock("../login/useCurrentOperator", () => ({
  useCurrentOperator: () => notificationBellState.operator,
  clearCurrentOperator: vi.fn(),
}));

vi.mock("../notifications/NotificationBell", () => ({
  NotificationBell: ({ loginDialogEnabled }: { loginDialogEnabled: boolean }) => {
    notificationBellState.loginDialogEnabled = loginDialogEnabled;
    return null;
  },
}));

describe("DesktopTopbar", () => {
  it("uses the active tab color for the leading icon", () => {
    const { container } = render(
      <DesktopTopbar
        title="불량"
        icon={AlertTriangle}
        iconColor={LEGACY_COLORS.red}
        onRefresh={vi.fn()}
      />,
    );

    const iconBox = container.querySelector("[data-testid='desktop-topbar-icon']");

    expect(iconBox).toHaveStyle({
      color: LEGACY_COLORS.red,
      background: `color-mix(in srgb, ${LEGACY_COLORS.red} 12%, transparent)`,
    });
  });

  it("exposes the status pill as the destination for transient notices", () => {
    render(
      <DesktopTopbar
        title="출하"
        icon={AlertTriangle}
        iconColor={LEGACY_COLORS.blue}
        status="DEXCOWIN MES System"
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByTestId("desktop-status-target")).toHaveTextContent("DEXCOWIN MES System");
  });

  it("enables the login notification dialog for the desktop top bar", () => {
    render(
      <DesktopTopbar
        title="Dashboard"
        icon={AlertTriangle}
        iconColor={LEGACY_COLORS.blue}
        onRefresh={vi.fn()}
      />,
    );

    expect(notificationBellState.loginDialogEnabled).toBe(true);
  });

  it("allows an absolute-positioned date dialog to escape the title addon", () => {
    render(
      <DesktopTopbar
        title="Daily report"
        onRefresh={vi.fn()}
        titleAddon={<DailyWorkDatePicker value="2026-08-10" maxDate="2026-08-10" onChange={vi.fn()} />}
      />,
    );

    expect(screen.getByTestId("desktop-topbar-title-addon")).toHaveClass("overflow-visible");

    fireEvent.click(screen.getByRole("button", { name: "일보 날짜 선택" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("uses an opaque popup surface for the user menu", () => {
    notificationBellState.operator = {
      employee_id: "emp-1",
      name: "김현우",
      department: "조립",
      warehouse_role: "none",
      department_role: "none",
    };

    render(<DesktopTopbar title="대시보드" onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /김현우/ }));

    expect(screen.getByTestId("desktop-user-menu")).toHaveStyle({
      background: "var(--c-popup-bg)",
      boxShadow: "var(--c-popup-shadow)",
    });
  });
});
