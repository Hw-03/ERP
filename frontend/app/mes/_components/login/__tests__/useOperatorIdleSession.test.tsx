import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OperatorSessionResponse } from "@/lib/api";
import { AUTH_REQUIRED_EVENT, ApiError, fetcher } from "@/lib/api-core";

const state = vi.hoisted(() => ({
  getOperatorSession: vi.fn(),
  getOperatorSessionForIdleCheck: vi.fn(),
  renewOperatorSession: vi.fn(),
}));

vi.mock("@/lib/api/operator-session", () => ({
  operatorSessionApi: {
    getOperatorSession: state.getOperatorSession,
    getOperatorSessionForIdleCheck: state.getOperatorSessionForIdleCheck,
    renewOperatorSession: state.renewOperatorSession,
  },
}));

import { useOperatorIdleSession } from "../useOperatorIdleSession";

function makeSession(remainingMs = 30 * 60_000): OperatorSessionResponse {
  const serverNow = Date.now();
  return {
    employee: {
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
      created_at: "2026-09-09T00:00:00Z",
      updated_at: "2026-09-09T00:00:00Z",
      assigned_model_slots: [],
      hidden_sidebar_tabs: [],
      login_notification_popup_enabled: true,
    },
    server_time: new Date(serverNow).toISOString(),
    expires_at: new Date(serverNow + remainingMs).toISOString(),
    boot_id: "boot-1",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useOperatorIdleSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T00:00:00Z"));
    state.getOperatorSession.mockReset();
    state.getOperatorSessionForIdleCheck.mockReset();
    state.renewOperatorSession.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("warns at 29 minutes and expires once after the server confirms expiry", async () => {
    state.getOperatorSessionForIdleCheck.mockRejectedValue(
      new ApiError("작업자 세션이 만료되었습니다.", 401, "SESSION_EXPIRED"),
    );
    const onExpired = vi.fn();
    const session = makeSession();
    const { result } = renderHook(() =>
      useOperatorIdleSession({
        session,
        active: true,
        onExpired,
      }),
    );

    act(() => vi.advanceTimersByTime(28 * 60_000 + 59_000));
    expect(result.current.warningSeconds).toBeNull();

    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.warningSeconds).toBe(60);

    act(() => vi.advanceTimersByTime(60_000));
    await act(async () => undefined);
    expect(state.getOperatorSessionForIdleCheck).toHaveBeenCalledTimes(1);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("accepts a newer server deadline when another tab renewed the session", async () => {
    const onExpired = vi.fn();
    state.getOperatorSessionForIdleCheck.mockImplementation(async () => makeSession());
    const session = makeSession();
    const { result } = renderHook(() =>
      useOperatorIdleSession({
        session,
        active: true,
        onExpired,
      }),
    );

    act(() => vi.advanceTimersByTime(30 * 60_000));
    expect(result.current.warningSeconds).toBe(0);
    await act(async () => undefined);

    expect(state.getOperatorSessionForIdleCheck).toHaveBeenCalledTimes(1);
    expect(onExpired).not.toHaveBeenCalled();
    expect(result.current.warningSeconds).toBeNull();
  });

  it("keeps the screen locked and retries when expiry cannot be confirmed", async () => {
    const onExpired = vi.fn();
    state.getOperatorSessionForIdleCheck.mockRejectedValueOnce(new ApiError("서버 연결 실패", 503));
    const session = makeSession();
    const { result } = renderHook(() =>
      useOperatorIdleSession({
        session,
        active: true,
        onExpired,
      }),
    );

    act(() => vi.advanceTimersByTime(30 * 60_000));
    await act(async () => undefined);

    expect(result.current.warningSeconds).toBe(0);
    expect(result.current.renewalError).toBe("로그인 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
    expect(onExpired).not.toHaveBeenCalled();

    state.getOperatorSessionForIdleCheck.mockImplementationOnce(async () => makeSession());
    await act(async () => result.current.renewNow());
    expect(result.current.warningSeconds).toBeNull();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("does not retry an uncertain deadline check until the operator asks", async () => {
    const onExpired = vi.fn();
    state.getOperatorSessionForIdleCheck.mockRejectedValue(new ApiError("서버 연결 실패", 503));
    const session = makeSession(1_000);
    const { result } = renderHook(() =>
      useOperatorIdleSession({
        session,
        active: true,
        onExpired,
      }),
    );

    act(() => vi.advanceTimersByTime(1_000));
    await act(async () => undefined);
    expect(state.getOperatorSessionForIdleCheck).toHaveBeenCalledTimes(1);
    expect(result.current.warningSeconds).toBe(0);

    for (let second = 0; second < 5; second += 1) {
      act(() => vi.advanceTimersByTime(1_000));
      await act(async () => undefined);
    }
    expect(state.getOperatorSessionForIdleCheck).toHaveBeenCalledTimes(1);
    expect(onExpired).not.toHaveBeenCalled();

    await act(async () => result.current.renewNow());
    expect(state.getOperatorSessionForIdleCheck).toHaveBeenCalledTimes(2);
  });

  it("hides at the exact server deadline instead of waiting for the next interval", async () => {
    state.getOperatorSessionForIdleCheck.mockRejectedValue(
      new ApiError("작업자 세션이 만료되었습니다.", 401, "SESSION_EXPIRED"),
    );
    const onExpired = vi.fn();
    const session = makeSession(60_250);
    const { result } = renderHook(() =>
      useOperatorIdleSession({
        session,
        active: true,
        onExpired,
      }),
    );

    act(() => vi.advanceTimersByTime(60_249));
    expect(result.current.warningSeconds).toBe(1);
    expect(state.getOperatorSessionForIdleCheck).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    await act(async () => undefined);
    expect(result.current.warningSeconds).toBe(0);
    expect(state.getOperatorSessionForIdleCheck).toHaveBeenCalledTimes(1);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("ignores an old deadline 401 after another tab confirms a newer deadline", async () => {
    const oldDeadlineCheck = deferred<OperatorSessionResponse>();
    state.getOperatorSessionForIdleCheck
      .mockReturnValueOnce(oldDeadlineCheck.promise)
      .mockResolvedValueOnce(makeSession());
    const onExpired = vi.fn();
    const session = makeSession(1_000);
    const { result } = renderHook(() =>
      useOperatorIdleSession({ session, active: true, onExpired }),
    );

    act(() => vi.advanceTimersByTime(1_000));
    expect(state.getOperatorSessionForIdleCheck).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: "dexcowin_mes_operator_activity",
        newValue: JSON.stringify({
          employee_id: session.employee.employee_id,
          boot_id: session.boot_id,
          nonce: "newer-other-tab",
        }),
      }));
      await Promise.resolve();
    });
    expect(state.getOperatorSessionForIdleCheck).toHaveBeenCalledTimes(2);
    expect(result.current.warningSeconds).toBeNull();

    oldDeadlineCheck.reject(
      new ApiError("작업자 세션이 만료되었습니다.", 401, "SESSION_EXPIRED"),
    );
    await act(async () => undefined);

    expect(onExpired).not.toHaveBeenCalled();
    expect(result.current.warningSeconds).toBeNull();
  });

  it("rechecks the server when an in-flight activity response arrives after the deadline", async () => {
    const renewal = deferred<OperatorSessionResponse>();
    const onExpired = vi.fn();
    state.renewOperatorSession.mockReturnValueOnce(renewal.promise);
    state.getOperatorSessionForIdleCheck.mockResolvedValueOnce(makeSession());
    const session = makeSession(61_000);
    const { result } = renderHook(() =>
      useOperatorIdleSession({ session, active: true, onExpired }),
    );

    fireEvent.click(document.body);
    expect(state.renewOperatorSession).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(61_000));
    expect(result.current.warningSeconds).toBe(0);

    renewal.resolve(makeSession());
    await act(async () => undefined);

    expect(state.getOperatorSessionForIdleCheck).toHaveBeenCalledTimes(1);
    expect(onExpired).not.toHaveBeenCalled();
    expect(result.current.warningSeconds).toBeNull();
  });

  it("rechecks the server before locking after a background resume", async () => {
    const onExpired = vi.fn();
    const session = makeSession();
    state.getOperatorSessionForIdleCheck.mockImplementationOnce(async () => makeSession());
    const { result } = renderHook(() =>
      useOperatorIdleSession({ session, active: true, onExpired }),
    );

    vi.setSystemTime(new Date(Date.now() + 31 * 60_000));
    fireEvent.focus(window);
    expect(result.current.warningSeconds).toBe(0);
    await act(async () => undefined);

    expect(state.getOperatorSessionForIdleCheck).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(onExpired).not.toHaveBeenCalled();
    expect(result.current.warningSeconds).toBeNull();
  });

  it("accepts another tab's activity only after a matching server recheck", async () => {
    const onExpired = vi.fn();
    const session = makeSession();
    state.getOperatorSessionForIdleCheck.mockImplementationOnce(async () => makeSession());
    renderHook(() => useOperatorIdleSession({ session, active: true, onExpired }));

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: "dexcowin_mes_operator_activity",
        newValue: JSON.stringify({
          employee_id: session.employee.employee_id,
          boot_id: session.boot_id,
          nonce: "other-tab",
        }),
      }));
    });
    await act(async () => undefined);

    expect(state.getOperatorSessionForIdleCheck).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(state.renewOperatorSession).not.toHaveBeenCalled();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("locks the old tab after another tab replaces the server actor", async () => {
    const onExpired = vi.fn();
    const boundary = vi.fn();
    const session = makeSession();
    const replacement = makeSession();
    replacement.employee = {
      ...replacement.employee,
      employee_id: "emp-2",
      employee_code: "E2",
      name: "다른 작업자",
    };
    replacement.boot_id = "boot-2";
    state.getOperatorSessionForIdleCheck.mockResolvedValueOnce(replacement);
    window.addEventListener(AUTH_REQUIRED_EVENT, boundary);
    renderHook(() => useOperatorIdleSession({ session, active: true, onExpired }));

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: "dexcowin_mes_operator_activity",
        newValue: JSON.stringify({
          employee_id: replacement.employee.employee_id,
          boot_id: replacement.boot_id,
          nonce: "other-tab-login",
        }),
      }));
    });
    await act(async () => undefined);

    expect(state.getOperatorSessionForIdleCheck).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(boundary).toHaveBeenCalledTimes(1);
    expect((boundary.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ reason: "server" });
    expect(onExpired).not.toHaveBeenCalled();
    window.removeEventListener(AUTH_REQUIRED_EVENT, boundary);
  });

  it("keeps the old tab masked when a replacement signal cannot be verified", async () => {
    const onExpired = vi.fn();
    const boundary = vi.fn();
    const session = makeSession();
    const replacement = makeSession();
    replacement.employee = {
      ...replacement.employee,
      employee_id: "emp-2",
      employee_code: "E2",
      name: "다른 작업자",
    };
    replacement.boot_id = "boot-2";
    state.getOperatorSessionForIdleCheck
      .mockRejectedValueOnce(new ApiError("서버 연결 실패", 503))
      .mockResolvedValueOnce(replacement);
    window.addEventListener(AUTH_REQUIRED_EVENT, boundary);
    const { result } = renderHook(() =>
      useOperatorIdleSession({ session, active: true, onExpired }),
    );

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: "dexcowin_mes_operator_activity",
        newValue: JSON.stringify({
          employee_id: replacement.employee.employee_id,
          boot_id: replacement.boot_id,
          nonce: "other-tab-login-network-error",
        }),
      }));
    });
    await act(async () => undefined);

    expect(result.current.warningSeconds).toBe(0);
    expect(result.current.renewalError).toBe(
      "다른 탭의 로그인 상태를 확인하지 못했습니다. 다시 시도해 주세요.",
    );
    expect(boundary).not.toHaveBeenCalled();

    await act(async () => result.current.renewNow());
    expect(boundary).toHaveBeenCalledTimes(1);
    expect((boundary.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ reason: "server" });
    expect(onExpired).not.toHaveBeenCalled();
    window.removeEventListener(AUTH_REQUIRED_EVENT, boundary);
  });

  it("times out a hanging identity recheck and enables an explicit retry", async () => {
    const session = makeSession();
    state.getOperatorSessionForIdleCheck.mockImplementationOnce(
      (signal?: AbortSignal) => new Promise<OperatorSessionResponse>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
    );
    const { result } = renderHook(() =>
      useOperatorIdleSession({ session, active: true, onExpired: vi.fn() }),
    );

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: "dexcowin_mes_operator_activity",
        newValue: JSON.stringify({
          employee_id: "emp-2",
          boot_id: "boot-2",
          nonce: "replacement-hanging-get",
        }),
      }));
    });
    expect(result.current.warningSeconds).toBe(0);
    expect(result.current.renewing).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(8_000);
      await Promise.resolve();
    });

    expect(result.current.warningSeconds).toBe(0);
    expect(result.current.renewing).toBe(false);
    expect(result.current.renewalError).toBe(
      "다른 탭의 로그인 상태를 확인하지 못했습니다. 다시 시도해 주세요.",
    );
  });

  it("keeps retry enabled when a second tab signal supersedes a pending identity check", async () => {
    const firstCheck = deferred<OperatorSessionResponse>();
    const session = makeSession();
    state.getOperatorSessionForIdleCheck
      .mockReturnValueOnce(firstCheck.promise)
      .mockRejectedValueOnce(new ApiError("서버 연결 실패", 503));
    const { result } = renderHook(() =>
      useOperatorIdleSession({ session, active: true, onExpired: vi.fn() }),
    );

    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: "dexcowin_mes_operator_activity",
        newValue: JSON.stringify({
          employee_id: "emp-2",
          boot_id: "boot-2",
          nonce: "replacement",
        }),
      }));
      await Promise.resolve();
    });
    expect(state.getOperatorSessionForIdleCheck).toHaveBeenCalledTimes(1);
    expect(result.current.warningSeconds).toBe(0);
    expect(result.current.renewing).toBe(true);

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: "dexcowin_mes_operator_activity",
        newValue: JSON.stringify({
          employee_id: session.employee.employee_id,
          boot_id: session.boot_id,
          nonce: "later-stale-activity",
        }),
      }));
    });
    await act(async () => undefined);

    expect(result.current.warningSeconds).toBe(0);
    expect(result.current.renewing).toBe(false);
    expect(result.current.renewalError).toBe(
      "다른 탭의 로그인 상태를 확인하지 못했습니다. 다시 시도해 주세요.",
    );
  });

  it("does not let a pre-deadline matching recheck revive an expired screen", async () => {
    const oldRecheck = deferred<OperatorSessionResponse>();
    const deadlineCheck = deferred<OperatorSessionResponse>();
    const staleResponse = makeSession();
    state.getOperatorSessionForIdleCheck
      .mockReturnValueOnce(oldRecheck.promise)
      .mockReturnValueOnce(deadlineCheck.promise);
    const onExpired = vi.fn();
    const session = makeSession(1_000);
    const { result } = renderHook(() =>
      useOperatorIdleSession({ session, active: true, onExpired }),
    );

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: "dexcowin_mes_operator_activity",
        newValue: JSON.stringify({
          employee_id: session.employee.employee_id,
          boot_id: session.boot_id,
          nonce: "pre-deadline-recheck",
        }),
      }));
    });
    expect(state.getOperatorSessionForIdleCheck).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.warningSeconds).toBe(0);
    expect(state.getOperatorSessionForIdleCheck).toHaveBeenCalledTimes(2);

    oldRecheck.resolve(staleResponse);
    await act(async () => undefined);
    expect(result.current.warningSeconds).toBe(0);

    deadlineCheck.reject(
      new ApiError("작업자 세션이 만료되었습니다.", 401, "SESSION_EXPIRED"),
    );
    await act(async () => undefined);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("subtracts time spent between receiving a session and mounting the idle guard", async () => {
    const receivedAt = Date.now();
    const delayedSession = {
      ...makeSession(1_000),
      client_received_at_ms: receivedAt,
    } as OperatorSessionResponse;
    state.getOperatorSessionForIdleCheck.mockRejectedValueOnce(
      new ApiError("작업자 세션이 만료되었습니다.", 401, "SESSION_EXPIRED"),
    );
    const onExpired = vi.fn();

    vi.setSystemTime(new Date(receivedAt + 2_000));
    const { result } = renderHook(() =>
      useOperatorIdleSession({ session: delayedSession, active: true, onExpired }),
    );
    await act(async () => undefined);

    expect(result.current.warningSeconds).toBe(0);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("renews for click, key, and scroll but not visibility changes", async () => {
    state.renewOperatorSession.mockImplementation(async () => makeSession());
    const session = makeSession();
    const { result } = renderHook(() =>
      useOperatorIdleSession({
        session,
        active: true,
        onExpired: vi.fn(),
      }),
    );

    fireEvent(window, new Event("visibilitychange"));
    expect(state.renewOperatorSession).not.toHaveBeenCalled();

    fireEvent.click(document.body);
    await act(async () => undefined);
    expect(state.renewOperatorSession).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document.body, { key: "A" });
    fireEvent.scroll(document.body);
    act(() => vi.advanceTimersByTime(60_000));
    await act(async () => undefined);
    expect(state.renewOperatorSession).toHaveBeenCalledTimes(2);
    expect(result.current.warningSeconds).toBeNull();
  });

  it("requires the warning button for renewal after the warning appears", async () => {
    state.renewOperatorSession.mockImplementation(async () => makeSession());
    const session = makeSession();
    const { result } = renderHook(() =>
      useOperatorIdleSession({
        session,
        active: true,
        onExpired: vi.fn(),
      }),
    );
    act(() => vi.advanceTimersByTime(29 * 60_000));
    expect(result.current.warningSeconds).toBe(60);

    fireEvent.click(document.body);
    await act(async () => undefined);
    expect(state.renewOperatorSession).not.toHaveBeenCalled();

    await act(async () => result.current.renewNow());
    expect(state.renewOperatorSession).toHaveBeenCalledTimes(1);
    expect(result.current.warningSeconds).toBeNull();
  });

  it.each(["ACTOR_MISMATCH", "EMPLOYEE_INACTIVE"])(
    "discards the old actor boundary when activity returns %s",
    async (code) => {
      state.renewOperatorSession.mockRejectedValueOnce(
        new ApiError("현재 작업자 세션을 사용할 수 없습니다.", 403, code),
      );
      const onExpired = vi.fn();
      const boundary = vi.fn();
      window.addEventListener(AUTH_REQUIRED_EVENT, boundary);
      const session = makeSession();
      renderHook(() => useOperatorIdleSession({ session, active: true, onExpired }));

      fireEvent.click(document.body);
      await act(async () => undefined);

      expect(boundary).toHaveBeenCalledTimes(1);
      expect((boundary.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ reason: "server" });
      expect(onExpired).not.toHaveBeenCalled();
      window.removeEventListener(AUTH_REQUIRED_EVENT, boundary);
    },
  );

  it("invalidates a pre-deadline read so its late 401 cannot discard the idle draft", async () => {
    const originalFetch = globalThis.fetch;
    const lateRead = deferred<Response>();
    globalThis.fetch = vi.fn(() => lateRead.promise) as unknown as typeof fetch;
    state.getOperatorSessionForIdleCheck.mockRejectedValueOnce(
      new ApiError("서버 연결 실패", 503),
    );
    const boundary = vi.fn();
    window.addEventListener(AUTH_REQUIRED_EVENT, boundary);
    const session = makeSession(1_000);

    try {
      const pendingRead = fetcher("/api/items").catch((error: unknown) => error);
      const { result } = renderHook(() =>
        useOperatorIdleSession({ session, active: true, onExpired: vi.fn() }),
      );

      act(() => vi.advanceTimersByTime(1_000));
      await act(async () => undefined);
      expect(result.current.warningSeconds).toBe(0);

      lateRead.resolve({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: () => Promise.resolve(JSON.stringify({
          detail: { code: "SESSION_EXPIRED", message: "세션이 만료되었습니다." },
        })),
      } as Response);
      await act(async () => {
        await pendingRead;
      });

      expect(boundary).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
      window.removeEventListener(AUTH_REQUIRED_EVENT, boundary);
    }
  });
});
