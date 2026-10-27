import { afterEach, describe, expect, it, vi } from "vitest";

import { sendClientEvent, reportClientError, installClientErrorListeners } from "../client-events";
import { setAuditScreen } from "../activity-audit-context";
import { restoreOperatorSession } from "../auth/operator-session";

vi.mock("../auth/operator-session", () => ({ restoreOperatorSession: vi.fn(() => null) }));

describe("client event logging", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(restoreOperatorSession).mockReturnValue(null);
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("sends allowed UI events with the current employee code", () => {
    window.sessionStorage.setItem(
      "dexcowin_mes_operator",
      JSON.stringify({ employee_id: "emp-1", name: "Kim", employee_code: "E22" }),
    );
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    sendClientEvent({ event: "ui_nav", from: "dashboard", to: "history", path: "/mes", source: "desktop" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/client-events");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "X-MES-Employee-Code": "E22",
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      event: "ui_nav",
      from: "dashboard",
      to: "history",
      path: "/mes",
      source: "desktop",
      session_id: expect.any(String),
      terminal_id: expect.any(String),
    });
  });

  it("sends the active screen and cancellation action without user input values", () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    globalThis.fetch = fetchSpy as typeof fetch;
    setAuditScreen({ key: "warehouse.io.produce.confirm", label: "입출고 · 부서 입출고 · 생산 · 제출" });

    sendClientEvent({
      event: "ui_action_cancel",
      action_key: "io.submit",
      action_label: "입출고 제출",
      target_summary: "7-PF-0026 4 EA",
      source: "desktop",
    });

    expect(JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      event: "ui_action_cancel",
      action_key: "io.submit",
      action_label: "입출고 제출",
      target_summary: "7-PF-0026 4 EA",
      screen_key: "warehouse.io.produce.confirm",
      screen_label: "입출고 · 부서 입출고 · 생산 · 제출",
    });
  });

  it("keeps an explicit navigation destination instead of the previous screen context", () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    globalThis.fetch = fetchSpy as typeof fetch;
    setAuditScreen({ key: "desktop.history", label: "history" });

    sendClientEvent({
      event: "ui_nav",
      from: "history",
      to: "weekly",
      screen_key: "desktop.weekly",
      screen_label: "weekly",
      source: "desktop",
    });

    expect(JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      screen_key: "desktop.weekly",
      screen_label: "weekly",
    });
  });

  it("does not throw when event delivery fails", () => {
    globalThis.fetch = vi.fn(() => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    expect(() => sendClientEvent({ event: "ui_logout", source: "desktop" })).not.toThrow();
  });

  it("reports a bounded error with occurrence time and active screen without arbitrary data", () => {
    expect(reportClientError).toBeTypeOf("function");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T03:04:05Z"));
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchSpy;
    setAuditScreen({ key: "stocktake", label: "Stocktake" });
    const error = Object.assign(new TypeError("crypto.randomUUID is not a function"), { pin: "1234", token: "never-log" });
    reportClientError(error, "react_boundary");
    const payload = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(payload).toMatchObject({ event: "ui_error", occurred_at: "2026-10-27T03:04:05.000Z",
      error_type: "TypeError", error_message: "crypto.randomUUID is not a function", error_source: "react_boundary", screen_key: "stocktake" });
    expect(JSON.stringify(payload)).not.toMatch(/1234|never-log/);
    expect(payload.error_stack.length).toBeLessThanOrEqual(4000);
  });

  it("captures synthetic browser errors and rejections once and cleans up listeners", () => {
    expect(installClientErrorListeners).toBeTypeOf("function");
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchSpy;
    const remove = installClientErrorListeners();
    const removeSecond = installClientErrorListeners();
    const error = new TypeError("synthetic browser error");
    window.dispatchEvent(new ErrorEvent("error", { error, message: error.message }));
    reportClientError(error, "react_boundary");
    const rejection = new Event("unhandledrejection");
    Object.defineProperty(rejection, "reason", { value: new Error("synthetic rejection") });
    window.dispatchEvent(rejection);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    removeSecond();
    remove();
    window.dispatchEvent(new Event("unhandledrejection"));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("redacts credentials and URL queries without inspecting rejected objects", () => {
    expect(reportClientError).toBeTypeOf("function");
    const fetchSpy = vi.fn().mockRejectedValue(new Error("network down"));
    globalThis.fetch = fetchSpy;
    const error = new Error("request https://example.test/a?pin=1234&token=secret password=hidden");
    error.stack = "Error: token=secret\n at https://example.test/app.js?token=secret:1:2\nforged=entry";
    reportClientError(error, "window_error");
    reportClientError({ pin: "9876", token: "other-secret" }, "unhandledrejection");
    const bodies = fetchSpy.mock.calls.map((call) => call[1].body).join(" ");
    expect(bodies).not.toMatch(/1234|secret|hidden|9876|forged=entry/);
    expect(JSON.parse(fetchSpy.mock.calls[1][1].body).error_message).toBe("Non-Error rejection");
  });

  it("transports the verified tab credential only in the authentication header", () => {
    vi.mocked(restoreOperatorSession).mockReturnValue({ token: "tab-credential", employee_id: "e06", tab_id: "tab-1", expires_at: "2030-01-01T00:00:00Z" });
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchSpy;
    reportClientError(new Error("tab failure"), "window_error");
    expect(fetchSpy.mock.calls[0][1].headers["X-Operator-Session"]).toBe("tab-credential");
    expect(fetchSpy.mock.calls[0][1].body).not.toContain("tab-credential");
  });

  it.each(["X-Admin-Pin", "X-Operator-Session", "access_token", "refresh_token", "api_key", "X-Auth-Token"])(
    "redacts composite credential key %s while preserving ordinary diagnostic fields", (key) => {
      const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      globalThis.fetch = fetchSpy;
      reportClientError(new Error(`${key}: \"credential value\" stocktake_count=4 spinning_count=2 item_key=PF-0026`), "window_error");
      const message = JSON.parse(fetchSpy.mock.calls[0][1].body).error_message;
      expect(message).not.toContain("credential value");
      expect(message).toContain("stocktake_count=4 spinning_count=2 item_key=PF-0026");
    },
  );

  it.each(["Bearer", "Basic"])("redacts the complete Authorization %s value", (scheme) => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchSpy;
    reportClientError(new Error(`Authorization: ${scheme} auth-credential stocktake_count=4`), "window_error");
    const message = JSON.parse(fetchSpy.mock.calls[0][1].body).error_message;
    expect(message).not.toContain("auth-credential");
    expect(message).toContain("stocktake_count=4");
  });
});
