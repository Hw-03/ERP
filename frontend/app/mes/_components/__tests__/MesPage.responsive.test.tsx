import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MesPage from "../../page";

const shellState = vi.hoisted(() => ({
  desktopFlush: vi.fn<() => Promise<void>>(),
  mobileFlush: vi.fn<() => Promise<void>>(),
  gateAuthed: true,
  adminMount: vi.fn(),
  adminUnmount: vi.fn(),
}));

vi.mock("../mobile/MobileShell", () => ({
  MobileShell: ({
    onBeforeViewportSwitchChange,
  }: {
    onBeforeViewportSwitchChange?: (handler: (() => Promise<void>) | null) => void;
  }) => {
    useEffect(() => {
      onBeforeViewportSwitchChange?.(shellState.mobileFlush);
      return () => onBeforeViewportSwitchChange?.(null);
    }, [onBeforeViewportSwitchChange]);

    return <div data-testid="mobile-shell" />;
  },
}));

vi.mock("../DesktopMesShell", () => ({
  DesktopMesShell: ({
    onBeforeViewportSwitchChange,
  }: {
    onBeforeViewportSwitchChange?: (handler: (() => Promise<void>) | null) => void;
  }) => {
    useEffect(() => {
      onBeforeViewportSwitchChange?.(shellState.desktopFlush);
      return () => onBeforeViewportSwitchChange?.(null);
    }, [onBeforeViewportSwitchChange]);

    return <div data-testid="desktop-shell" />;
  },
}));

vi.mock("../login/MesLoginGate", () => ({
  MesLoginGate: ({ children }: { children: React.ReactNode }) =>
    shellState.gateAuthed ? <>{children}</> : <div>operator-login-boundary</div>,
}));

vi.mock("../DepartmentsContext", () => ({
  DepartmentsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/auth/admin-session", () => ({
  AdminSessionProvider: ({ children }: { children: React.ReactNode }) => {
    useEffect(() => {
      shellState.adminMount();
      return () => shellState.adminUnmount();
    }, []);
    return <>{children}</>;
  },
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
  let desktopMatches = true;
  let mediaListeners: Set<(event: MediaQueryListEvent) => void>;

  const setDesktopMatch = (matches: boolean) => {
    desktopMatches = matches;
    const event = { matches, media: "(min-width: 1024px)" } as MediaQueryListEvent;
    mediaListeners.forEach((listener) => listener(event));
  };

  beforeEach(() => {
    desktopMatches = true;
    mediaListeners = new Set();
    window.history.replaceState({}, "", "/mes");
    shellState.desktopFlush.mockReset();
    shellState.mobileFlush.mockReset();
    shellState.gateAuthed = true;
    shellState.adminMount.mockReset();
    shellState.adminUnmount.mockReset();
    shellState.desktopFlush.mockResolvedValue(undefined);
    shellState.mobileFlush.mockResolvedValue(undefined);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: desktopMatches,
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          mediaListeners.add(listener);
        },
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          mediaListeners.delete(listener);
        },
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("unmounts the admin PIN provider at the operator login boundary", () => {
    setViewportWidth(1280);
    const view = render(<MesPage />);
    expect(shellState.adminMount).toHaveBeenCalledTimes(1);

    shellState.gateAuthed = false;
    view.rerender(<MesPage />);

    expect(screen.getByText("operator-login-boundary")).toBeInTheDocument();
    expect(shellState.adminUnmount).toHaveBeenCalledTimes(1);
  });

  it("mounts only the desktop shell on desktop viewports", () => {
    desktopMatches = true;
    setViewportWidth(1280);

    render(<MesPage />);

    expect(screen.getByTestId("desktop-shell")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-shell")).not.toBeInTheDocument();
  });

  it("mounts only the mobile shell on mobile viewports", () => {
    desktopMatches = false;
    setViewportWidth(430);

    render(<MesPage />);

    expect(screen.getByTestId("mobile-shell")).toBeInTheDocument();
    expect(screen.queryByTestId("desktop-shell")).not.toBeInTheDocument();
  });

  it("waits for the active shell flush before switching at the breakpoint", async () => {
    setViewportWidth(1280);
    let releaseFlush: (() => void) | undefined;
    shellState.desktopFlush.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseFlush = resolve;
      }),
    );

    render(<MesPage />);
    expect(await screen.findByTestId("desktop-shell")).toBeInTheDocument();

    act(() => setDesktopMatch(false));
    expect(shellState.desktopFlush).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("desktop-shell")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-shell")).not.toBeInTheDocument();

    await act(async () => releaseFlush?.());
    expect(await screen.findByTestId("mobile-shell")).toBeInTheDocument();
  });

  it("keeps the current shell and shows an error when draft flush fails", async () => {
    setViewportWidth(1280);
    shellState.desktopFlush.mockRejectedValue(new Error("save failed"));

    render(<MesPage />);
    expect(await screen.findByTestId("desktop-shell")).toBeInTheDocument();

    act(() => setDesktopMatch(false));

    expect(
      await screen.findByText("작성 중인 작업을 저장하지 못해 화면 모드를 전환하지 않았습니다."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("desktop-shell")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-shell")).not.toBeInTheDocument();
  });

  it("cancels a pending switch when the viewport crosses back before the flush finishes", async () => {
    setViewportWidth(1280);
    let releaseFlush: (() => void) | undefined;
    shellState.desktopFlush.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseFlush = resolve;
      }),
    );

    render(<MesPage />);
    expect(await screen.findByTestId("desktop-shell")).toBeInTheDocument();
    act(() => setDesktopMatch(false));
    act(() => setDesktopMatch(true));
    await act(async () => releaseFlush?.());

    expect(screen.getByTestId("desktop-shell")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-shell")).not.toBeInTheDocument();
  });

  it("maps desktop-only admin to mobile more while preserving shared URL state", async () => {
    setViewportWidth(1280);
    window.history.replaceState(
      {},
      "",
      "/mes?tab=admin&section=requests&step=3&stockRequestId=req-1&draftId=draft-1",
    );

    render(<MesPage />);
    expect(await screen.findByTestId("desktop-shell")).toBeInTheDocument();
    act(() => setDesktopMatch(false));
    expect(await screen.findByTestId("mobile-shell")).toBeInTheDocument();

    const params = new URLSearchParams(window.location.search);
    expect(params.get("tab")).toBe("more");
    expect(params.get("section")).toBe("requests");
    expect(params.get("step")).toBe("3");
    expect(params.get("stockRequestId")).toBe("req-1");
    expect(params.get("draftId")).toBe("draft-1");
  });

  it("maps mobile-only checklist to the desktop dashboard", async () => {
    desktopMatches = false;
    setViewportWidth(430);
    window.history.replaceState({}, "", "/mes?tab=assemblyChecklist");

    render(<MesPage />);
    expect(await screen.findByTestId("mobile-shell")).toBeInTheDocument();
    act(() => setDesktopMatch(true));
    expect(await screen.findByTestId("desktop-shell")).toBeInTheDocument();

    expect(new URLSearchParams(window.location.search).get("tab")).toBe("dashboard");
  });
});
