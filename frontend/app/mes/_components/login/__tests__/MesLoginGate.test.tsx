/* eslint-disable @next/next/no-img-element */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Employee, OperatorSessionResponse } from "@/lib/api";
import { ApiError, postJson } from "@/lib/api-core";
import { AdminSessionProvider, useAdminSession } from "@/lib/auth/admin-session";
import { QueryProvider } from "@/lib/queries/client";

const state = vi.hoisted(() => ({
  getOperatorSession: vi.fn(),
  deleteOperatorSession: vi.fn(),
  clearCurrentOperator: vi.fn(),
  restoreCurrentOperator: vi.fn(),
  getWeeklyReport: vi.fn().mockResolvedValue({}),
  getWarehouseMap: vi.fn().mockResolvedValue({}),
}));

vi.mock("next/image", () => ({
  default: ({ alt = "", ...props }: Record<string, unknown>) => <img alt={String(alt)} {...props} />,
}));

vi.mock("@/lib/queries/realtime", () => ({
  RealtimeSyncProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/api/operator-session", () => ({
  operatorSessionApi: {
    getOperatorSession: state.getOperatorSession,
    deleteOperatorSession: state.deleteOperatorSession,
  },
}));

vi.mock("@/lib/api", () => ({
  api: { getWeeklyReport: state.getWeeklyReport },
}));

vi.mock("@/lib/api/warehouse-map", () => ({
  warehouseMapApi: { getMap: state.getWarehouseMap },
}));

vi.mock("../OperatorLoginCard", () => ({
  OperatorLoginCard: ({
    logoutPending,
    onRetryLogout,
  }: {
    logoutPending?: boolean;
    onRetryLogout?: () => void;
  }) => (
    <div>
      Operator login form
      {logoutPending && (
        <button type="button" onClick={onRetryLogout}>로그아웃 재시도</button>
      )}
    </div>
  ),
}));

vi.mock("../useCurrentOperator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../useCurrentOperator")>();
  return {
    ...actual,
    clearCurrentOperator: state.clearCurrentOperator,
    restoreCurrentOperator: state.restoreCurrentOperator,
  };
});

import { MesLoginGate } from "../MesLoginGate";

function makeEmployee(): Employee {
  return {
    employee_id: "emp-1",
    employee_code: "E1",
    name: "서버 작업자",
    role: "조립/사원",
    phone: null,
    department: "조립",
    level: "staff",
    warehouse_role: "none",
    department_role: "none",
    io_enabled: true,
    display_order: 1,
    is_active: true,
    created_at: "2026-08-19T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z",
    assigned_model_slots: [],
    hidden_sidebar_tabs: [],
    login_notification_popup_enabled: true,
  };
}

function makeSession(): OperatorSessionResponse {
  return {
    employee: makeEmployee(),
    expires_at: "2026-08-19T12:00:00Z",
    boot_id: "boot-1",
  };
}

interface MatchMediaOptions {
  narrow?: boolean;
  reducedMotion?: boolean;
}

function installMatchMedia({ narrow = false, reducedMotion = false }: MatchMediaOptions = {}) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string): MediaQueryList => ({
      matches: query === "(max-width: 1023px)" ? narrow : reducedMotion,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  });
}

function renderLoginGate() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MesLoginGate>
        <div>Authenticated content</div>
      </MesLoginGate>
    </QueryClientProvider>,
  );
}

function loginGateTree(queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <MesLoginGate>
        <div>Authenticated content</div>
      </MesLoginGate>
    </QueryClientProvider>
  );
}

function AuthenticatedSecurityProbe({
  onReady,
}: {
  onReady: (queryClient: QueryClient, adminPin: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const { pin, setPin } = useAdminSession();
  useEffect(() => setPin("8642"), [setPin]);
  onReady(queryClient, pin);
  return <output>{pin ?? "no-admin-pin"}</output>;
}

function CrossTabSecurityProbe({
  seedAdminPin,
  onReady,
}: {
  seedAdminPin: { current: boolean };
  onReady: (queryClient: QueryClient, adminPin: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const { pin, setPin } = useAdminSession();
  useEffect(() => {
    if (!seedAdminPin.current) return;
    seedAdminPin.current = false;
    setPin("8642");
  }, [seedAdminPin, setPin]);
  onReady(queryClient, pin);
  return <output>{pin ?? "no-admin-pin"}</output>;
}

const LOGOUT_PENDING_KEY = "dexcowin_mes_logout_pending";
const LOGOUT_PENDING_VALUE = JSON.stringify({ state: "failed", employee_code: "A001" });

function dispatchLogoutMarker(value: string | null): void {
  const oldValue = window.localStorage.getItem(LOGOUT_PENDING_KEY);
  if (value === null) {
    window.localStorage.removeItem(LOGOUT_PENDING_KEY);
  } else {
    window.localStorage.setItem(LOGOUT_PENDING_KEY, value);
  }
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: LOGOUT_PENDING_KEY,
      oldValue,
      newValue: value,
      url: window.location.href,
    }),
  );
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function makeHttpResponse(body: unknown, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 403 ? "Forbidden" : "OK",
    text: () => Promise.resolve(status === 204 ? "" : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response;
}

function getMascotImages(container: HTMLElement): NodeListOf<HTMLImageElement> {
  return container.querySelectorAll('img[src*="dexray-pointing-left.webp"]');
}

describe("MesLoginGate server session", () => {
  beforeEach(() => {
    installMatchMedia({ reducedMotion: true });
    state.getOperatorSession.mockReset();
    state.deleteOperatorSession.mockReset();
    state.clearCurrentOperator.mockReset();
    state.restoreCurrentOperator.mockReset();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("restores the UI from the server session even without browser storage", async () => {
    state.getOperatorSession.mockResolvedValue(makeSession());

    renderLoginGate();

    expect(await screen.findByText("Authenticated content")).toBeInTheDocument();
    expect(state.restoreCurrentOperator).toHaveBeenCalledWith(
      expect.objectContaining({ employee_id: "emp-1", name: "서버 작업자" }),
      "boot-1",
    );
  });

  it("clears the cache and shows login when the server session is absent", async () => {
    state.getOperatorSession.mockRejectedValue(
      new ApiError("작업자 로그인이 필요합니다.", 401, "AUTH_REQUIRED"),
    );

    renderLoginGate();

    expect(await screen.findByText("Operator login form")).toBeInTheDocument();
    expect(state.clearCurrentOperator).toHaveBeenCalledTimes(1);
  });

  it("retries a persisted logout before session restore after reload", async () => {
    const order: string[] = [];
    window.localStorage.setItem(
      "dexcowin_mes_logout_pending",
      JSON.stringify({ state: "failed", employee_code: "E1" }),
    );
    state.deleteOperatorSession.mockImplementationOnce(async () => {
      order.push("DELETE");
    });
    state.getOperatorSession.mockImplementationOnce(async () => {
      order.push("GET");
      throw new ApiError("작업자 로그인이 필요합니다.", 401, "AUTH_REQUIRED");
    });

    renderLoginGate();

    expect(await screen.findByText("Operator login form")).toBeInTheDocument();
    expect(order).toEqual(["DELETE", "GET"]);
    expect(state.deleteOperatorSession).toHaveBeenCalledWith("E1");
    expect(window.localStorage.getItem("dexcowin_mes_logout_pending")).toBeNull();
  });

  it("blocks restore and login while persisted logout retry still fails", async () => {
    const pendingMarker = JSON.stringify({ state: "failed", employee_code: "E1" });
    window.localStorage.setItem("dexcowin_mes_logout_pending", pendingMarker);
    state.deleteOperatorSession.mockRejectedValueOnce(new Error("DB unavailable"));

    renderLoginGate();

    expect(await screen.findByRole("button", { name: "로그아웃 재시도" })).toBeInTheDocument();
    expect(state.getOperatorSession).not.toHaveBeenCalled();
    expect(screen.queryByText("Authenticated content")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("dexcowin_mes_logout_pending")).toBe(pendingMarker);
  });

  it("returns an authenticated screen to login on a later 401 event", async () => {
    state.getOperatorSession.mockResolvedValue(makeSession());
    renderLoginGate();
    expect(await screen.findByText("Authenticated content")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent("dexcowin_auth_required"));
    });

    expect(screen.getByText("Operator login form")).toBeInTheDocument();
    expect(state.clearCurrentOperator).toHaveBeenCalledTimes(1);
  });

  it("does not rerun session restore when the auth cache epoch rotates", async () => {
    state.getOperatorSession.mockResolvedValue(makeSession());
    const firstClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(loginGateTree(firstClient));
    expect(await screen.findByText("Authenticated content")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent("dexcowin_auth_required"));
    });
    const secondClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    view.rerender(loginGateTree(secondClient));

    await act(async () => undefined);
    expect(state.getOperatorSession).toHaveBeenCalledTimes(1);
  });

  it("clears A UI, query cache, and admin credentials on a cross-tab ACTOR_MISMATCH", async () => {
    state.getOperatorSession.mockResolvedValue(makeSession());
    let operatorAClient!: QueryClient;
    let latestAdminPin: string | null = null;
    render(
      <QueryProvider>
        <MesLoginGate>
          <AdminSessionProvider>
            <AuthenticatedSecurityProbe
              onReady={(queryClient, adminPin) => {
                operatorAClient = queryClient;
                latestAdminPin = adminPin;
              }}
            />
            <div>Authenticated content</div>
          </AdminSessionProvider>
        </MesLoginGate>
      </QueryProvider>,
    );
    expect(await screen.findByText("Authenticated content")).toBeInTheDocument();
    expect(await screen.findByText("8642")).toBeInTheDocument();
    expect(latestAdminPin).toBe("8642");

    operatorAClient.setQueryData(["warehouse", "operator-a"], "operator-a-private-data");
    window.sessionStorage.setItem(
      "dexcowin_mes_operator",
      JSON.stringify({ employee_id: "operator-a", employee_code: "A001", name: "작업자 A" }),
    );
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        makeHttpResponse(
          {
            detail: {
              code: "ACTOR_MISMATCH",
              message: "세션 작업자와 요청 작업자가 다릅니다.",
            },
          },
          403,
        ),
      )
      .mockResolvedValueOnce(makeHttpResponse({ employee: {}, boot_id: "boot-b" }, 200));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    try {
      let failure: unknown;
      await act(async () => {
        failure = await postJson("/api/io/submit", { work_type: "receive" }).catch(
          (error: unknown) => error,
        );
      });

      expect(failure).toMatchObject({ status: 403, code: "ACTOR_MISMATCH" });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const mutationHeaders = new Headers(
        (fetchSpy.mock.calls[0]?.[1] as RequestInit).headers,
      );
      expect(mutationHeaders.get("X-MES-Employee-Code")).toBe("A001");
      expect(mutationHeaders.get("X-Admin-Pin")).toBe("8642");
      expect(operatorAClient.getQueryCache().getAll()).toHaveLength(0);
      expect(state.clearCurrentOperator).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Operator login form")).toBeInTheDocument();

      await postJson("/api/operator-session", { employee_id: "operator-b", pin: "2222" });
      const nextLoginHeaders = new Headers(
        (fetchSpy.mock.calls[1]?.[1] as RequestInit).headers,
      );
      expect(nextLoginHeaders.get("X-MES-Employee-Code")).toBeNull();
      expect(nextLoginHeaders.get("X-Admin-Pin")).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
      window.sessionStorage.clear();
    }
  });

  it("locks A UI, cache, and admin state as soon as another tab persists a pending logout", async () => {
    state.getOperatorSession.mockResolvedValue(makeSession());
    const seedAdminPin = { current: true };
    let operatorAClient!: QueryClient;
    render(
      <QueryProvider>
        <MesLoginGate>
          <AdminSessionProvider>
            <CrossTabSecurityProbe
              seedAdminPin={seedAdminPin}
              onReady={(queryClient) => {
                operatorAClient = queryClient;
              }}
            />
            <div>Authenticated content</div>
          </AdminSessionProvider>
        </MesLoginGate>
      </QueryProvider>,
    );
    expect(await screen.findByText("Authenticated content")).toBeInTheDocument();
    expect(await screen.findByText("8642")).toBeInTheDocument();
    operatorAClient.setQueryData(["warehouse", "operator-a"], "private-a");

    act(() => dispatchLogoutMarker(LOGOUT_PENDING_VALUE));

    expect(screen.getByRole("button", { name: "로그아웃 재시도" })).toBeInTheDocument();
    expect(screen.queryByText("Authenticated content")).not.toBeInTheDocument();
    expect(screen.queryByText("8642")).not.toBeInTheDocument();
    expect(operatorAClient.getQueryCache().getAll()).toHaveLength(0);
    expect(state.clearCurrentOperator).toHaveBeenCalledTimes(1);
    expect(state.getOperatorSession).toHaveBeenCalledTimes(1);
  });

  it("restores only server-verified B in a fresh cache and admin epoch after marker removal", async () => {
    const operatorBSession = {
      ...makeSession(),
      employee: {
        ...makeEmployee(),
        employee_id: "emp-b",
        employee_code: "B001",
        name: "작업자 B",
      },
      boot_id: "boot-b",
    };
    state.getOperatorSession
      .mockResolvedValueOnce(makeSession())
      .mockResolvedValueOnce(operatorBSession);
    const seedAdminPin = { current: true };
    const clients: QueryClient[] = [];
    let latestAdminPin: string | null = null;
    render(
      <QueryProvider>
        <MesLoginGate>
          <AdminSessionProvider>
            <CrossTabSecurityProbe
              seedAdminPin={seedAdminPin}
              onReady={(queryClient, adminPin) => {
                if (!clients.includes(queryClient)) clients.push(queryClient);
                latestAdminPin = adminPin;
              }}
            />
            <div>Authenticated content</div>
          </AdminSessionProvider>
        </MesLoginGate>
      </QueryProvider>,
    );
    expect(await screen.findByText("8642")).toBeInTheDocument();
    const operatorAClient = clients[0]!;
    operatorAClient.setQueryData(["warehouse", "operator-a"], "private-a");

    act(() => dispatchLogoutMarker(LOGOUT_PENDING_VALUE));
    expect(screen.getByRole("button", { name: "로그아웃 재시도" })).toBeInTheDocument();
    act(() => dispatchLogoutMarker(null));

    expect(await screen.findByText("Authenticated content")).toBeInTheDocument();
    expect(await screen.findByText("no-admin-pin")).toBeInTheDocument();
    expect(latestAdminPin).toBeNull();
    expect(clients).toHaveLength(2);
    expect(clients[1]).not.toBe(operatorAClient);
    expect(operatorAClient.getQueryCache().getAll()).toHaveLength(0);
    expect(state.getOperatorSession).toHaveBeenCalledTimes(2);
    expect(state.restoreCurrentOperator).toHaveBeenLastCalledWith(
      expect.objectContaining({ employee_id: "emp-b", employee_code: "B001" }),
      "boot-b",
    );
  });

  it("keeps the login form after marker removal when the revoked A session returns 401", async () => {
    state.getOperatorSession
      .mockResolvedValueOnce(makeSession())
      .mockRejectedValueOnce(new ApiError("세션이 만료되었습니다.", 401, "SESSION_EXPIRED"));
    renderLoginGate();
    expect(await screen.findByText("Authenticated content")).toBeInTheDocument();

    act(() => dispatchLogoutMarker(LOGOUT_PENDING_VALUE));
    act(() => dispatchLogoutMarker(null));

    await waitFor(() => expect(state.getOperatorSession).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Operator login form")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "로그아웃 재시도" })).not.toBeInTheDocument();
    expect(screen.queryByText("Authenticated content")).not.toBeInTheDocument();
  });

  it("keeps pending on a failed server recheck and retries the recheck before restoring B", async () => {
    const operatorBSession = {
      ...makeSession(),
      employee: {
        ...makeEmployee(),
        employee_id: "emp-b",
        employee_code: "B001",
      },
      boot_id: "boot-b",
    };
    state.getOperatorSession
      .mockResolvedValueOnce(makeSession())
      .mockRejectedValueOnce(new ApiError("DB unavailable", 503, "DB_UNAVAILABLE"))
      .mockResolvedValueOnce(operatorBSession);
    renderLoginGate();
    expect(await screen.findByText("Authenticated content")).toBeInTheDocument();

    act(() => dispatchLogoutMarker(LOGOUT_PENDING_VALUE));
    act(() => dispatchLogoutMarker(null));

    const retry = await screen.findByRole("button", { name: "로그아웃 재시도" });
    expect(screen.queryByText("Authenticated content")).not.toBeInTheDocument();
    fireEvent.click(retry);

    expect(await screen.findByText("Authenticated content")).toBeInTheDocument();
    expect(state.getOperatorSession).toHaveBeenCalledTimes(3);
    expect(state.restoreCurrentOperator).toHaveBeenLastCalledWith(
      expect.objectContaining({ employee_id: "emp-b" }),
      "boot-b",
    );
  });

  it("ignores a stale B recheck when a new pending marker arrives before the GET resolves", async () => {
    const recheck = deferred<OperatorSessionResponse>();
    state.getOperatorSession
      .mockResolvedValueOnce(makeSession())
      .mockReturnValueOnce(recheck.promise);
    renderLoginGate();
    expect(await screen.findByText("Authenticated content")).toBeInTheDocument();

    act(() => dispatchLogoutMarker(LOGOUT_PENDING_VALUE));
    act(() => dispatchLogoutMarker(null));
    await waitFor(() => expect(state.getOperatorSession).toHaveBeenCalledTimes(2));
    act(() => dispatchLogoutMarker(LOGOUT_PENDING_VALUE));
    act(() => {
      recheck.resolve({
        ...makeSession(),
        employee: {
          ...makeEmployee(),
          employee_id: "emp-b",
          employee_code: "B001",
        },
        boot_id: "boot-b",
      });
    });

    await act(async () => undefined);
    expect(screen.getByRole("button", { name: "로그아웃 재시도" })).toBeInTheDocument();
    expect(screen.queryByText("Authenticated content")).not.toBeInTheDocument();
    expect(state.restoreCurrentOperator).toHaveBeenCalledTimes(1);
  });
});

describe("MesLoginGate mascot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installMatchMedia();
    state.getOperatorSession.mockReset();
    state.getOperatorSession.mockRejectedValue(new ApiError("로그인 필요", 401, "AUTH_REQUIRED"));
    state.clearCurrentOperator.mockReset();
    state.restoreCurrentOperator.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("shows one decorative desktop mascot on the right only after the intro reaches the form", async () => {
    const { container } = renderLoginGate();
    await act(async () => undefined);

    expect(getMascotImages(container)).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    const images = getMascotImages(container);
    expect(images).toHaveLength(1);
    const mascot = images[0];
    const decoration = mascot.closest('[aria-hidden="true"]');
    expect(mascot).toHaveAttribute("alt", "");
    expect(mascot).toHaveAttribute("width", "607");
    expect(mascot).toHaveAttribute("height", "640");
    expect(decoration).toHaveClass("pointer-events-none", "hidden", "lg:block");
  });

  it("shows the mascot immediately with the form when reduced motion is preferred", async () => {
    installMatchMedia({ reducedMotion: true });
    const { container } = renderLoginGate();

    await act(async () => undefined);
    expect(getMascotImages(container)).toHaveLength(1);
  });

  it("renders the mascot on the employee server", async () => {
    vi.stubEnv("NEXT_PUBLIC_MES_ENV", "employee");
    installMatchMedia({ reducedMotion: true });
    const { container } = renderLoginGate();

    await act(async () => undefined);
    expect(getMascotImages(container)).toHaveLength(1);
  });
});
