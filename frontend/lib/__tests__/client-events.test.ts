import { afterEach, describe, expect, it, vi } from "vitest";

import { sendClientEvent } from "../client-events";
import { setAuditScreen } from "../activity-audit-context";

describe("client event logging", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
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
});
