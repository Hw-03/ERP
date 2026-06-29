import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { DesktopTopbar } from "../DesktopTopbar";

vi.mock("../login/useCurrentOperator", () => ({
  useCurrentOperator: () => null,
  clearCurrentOperator: vi.fn(),
}));

vi.mock("../notifications/NotificationBell", () => ({
  NotificationBell: () => null,
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
});
