import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MesPage from "../../page";

vi.mock("../mobile/MobileShell", () => ({
  MobileShell: () => <div data-testid="mobile-shell" />,
}));

vi.mock("../DesktopMesShell", () => ({
  DesktopMesShell: () => <div data-testid="desktop-shell" />,
}));

vi.mock("../login/MesLoginGate", () => ({
  MesLoginGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../DepartmentsContext", () => ({
  DepartmentsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/auth/admin-session", () => ({
  AdminSessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/queries/client", () => ({
  QueryProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

describe("MesPage responsive shell", () => {
  it("mounts only the desktop shell on desktop viewports", () => {
    setViewportWidth(1280);

    render(<MesPage />);

    expect(screen.getByTestId("desktop-shell")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-shell")).not.toBeInTheDocument();
  });

  it("mounts only the mobile shell on mobile viewports", () => {
    setViewportWidth(430);

    render(<MesPage />);

    expect(screen.getByTestId("mobile-shell")).toBeInTheDocument();
    expect(screen.queryByTestId("desktop-shell")).not.toBeInTheDocument();
  });
});
