import { describe, it, expect, vi, afterEach } from "vitest";
import { notificationsApi } from "../api/notifications";

function makeResponse(body: unknown, ok = true, status?: number): Response {
  const st = status ?? (ok ? 200 : 500);
  return {
    ok,
    status: st,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function headersOf(init: RequestInit): Headers {
  return new Headers(init.headers);
}

describe("notificationsApi.listNotifications", () => {
  it("GET /api/notifications with recipient query and actor header", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ items: [], unread_count: 0 })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await notificationsApi.listNotifications("e-1");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/notifications");
    expect(url).toContain("recipient_employee_id=e-1");
    expect(headersOf(init).get("X-Actor-Employee-Id")).toBe("e-1");
  });
});

describe("notificationsApi.markNotificationsRead", () => {
  it("POST /api/notifications/mark-read forwards payload with actor header", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ items: [], unread_count: 0 })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await notificationsApi.markNotificationsRead({
      recipient_employee_id: "e-1",
      notification_ids: ["n-1"],
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/notifications/mark-read");
    expect(init.method).toBe("POST");
    expect(headersOf(init).get("X-Actor-Employee-Id")).toBe("e-1");
    expect(headersOf(init).get("Content-Type")).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(body.recipient_employee_id).toBe("e-1");
    expect(body.notification_ids).toEqual(["n-1"]);
  });
});

describe("notificationsApi delete endpoints", () => {
  it("DELETE single notification sends actor header", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(null, true, 204)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await notificationsApi.deleteNotification("n-1", "e-1");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/notifications/n-1");
    expect(url).toContain("recipient_employee_id=e-1");
    expect(init.method).toBe("DELETE");
    expect(headersOf(init).get("X-Actor-Employee-Id")).toBe("e-1");
  });

  it("DELETE read notifications sends actor header", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(null, true, 204)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await notificationsApi.deleteReadNotifications("e-1");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/notifications/read");
    expect(url).toContain("recipient_employee_id=e-1");
    expect(init.method).toBe("DELETE");
    expect(headersOf(init).get("X-Actor-Employee-Id")).toBe("e-1");
  });
});
