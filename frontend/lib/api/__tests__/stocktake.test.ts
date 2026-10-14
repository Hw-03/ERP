import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api-core";
import { stocktakeApi } from "../stocktake";
import { isStocktakeCommandInFlight } from "../stocktake-command-journal";

const busy = () => Response.json({ detail: {
  code: "STOCKTAKE_BUSY", message: "retry", extra: { retryable: true },
} }, { status: 503 });
const success = () => Response.json({ status: "CLOSED_FULL", receipt_id: "receipt-1" });
let entries: Map<string, string>;
function actor(token: string): void {
  entries.set("dexcowin_mes_operator_session", JSON.stringify({ employee_id: "employee-1", token,
    tab_id: "tab-1", expires_at: "2030-01-01T00:00:00Z" }));
}
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  entries = new Map();
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("stocktake command boundary", () => {
  it("asks for normal MES login when the server rejects a revoked actor session", async () => {
    const login = vi.fn();
    vi.stubGlobal("window", { dispatchEvent: login, sessionStorage });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: {
      code: "OPERATOR_SESSION_INVALID", message: "expired",
    } }, { status: 401 })));
    await expect(stocktakeApi.read("/api/stocktakes/rounds", "expired-token")).rejects.toMatchObject({ code: "OPERATOR_SESSION_INVALID" });
    expect(login).toHaveBeenCalledTimes(1);
  });

  it("ignores a late rejection of the old token after normal login renewed it", async () => {
    actor("renewed-token");
    const login = vi.fn();
    vi.stubGlobal("window", { dispatchEvent: login, sessionStorage });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: {
      code: "OPERATOR_SESSION_INVALID", message: "expired",
    } }, { status: 401 })));
    await expect(stocktakeApi.read("/api/stocktakes/rounds", "old-token")).rejects.toMatchObject({ code: "OPERATOR_SESSION_INVALID" });
    expect(login).not.toHaveBeenCalled();
  });

  it("keeps the exact key, actor token, body and fresh PIN across confirmed busy retries", async () => {
    actor("actor-token");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const fetchMock = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(busy())
      .mockResolvedValueOnce(busy()).mockResolvedValueOnce(success());
    vi.stubGlobal("fetch", fetchMock);
    const payload = { preview_id: "preview-1", preview_hash: "hash-1" };
    const result = stocktakeApi.command<{ status: string }>(
      "round_close", "/api/stocktakes/rounds/11111111-1111-4111-8111-111111111111/close", "actor-token", payload,
      { key: "same-key", adminPin: "fresh-pin" },
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled(), { interval: 1 });
    const identity = { actor_employee_id: "employee-1", kind: "round_close" as const, key: "same-key" };
    expect(isStocktakeCommandInFlight(identity)).toBe(true);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(isStocktakeCommandInFlight(identity)).toBe(true);
    await vi.advanceTimersByTimeAsync(4_000);
    await expect(result).resolves.toMatchObject({ status: "CLOSED_FULL" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(isStocktakeCommandInFlight(identity)).toBe(false);
    const requests = fetchMock.mock.calls.map((call) => call[1] as RequestInit);
    expect(requests.map((request) => request.body)).toEqual(Array(4).fill(JSON.stringify(payload)));
    for (const request of requests) {
      const headers = new Headers(request.headers);
      expect(headers.get("X-Operator-Session")).toBe("actor-token");
      expect(headers.get("Idempotency-Key")).toBe("same-key");
      expect(headers.get("X-Admin-Pin")).toBe("fresh-pin");
      expect(JSON.parse(String(request.body))).not.toHaveProperty("actor_employee_id");
    }
  });

  it("never retries ordinary 503 or a fourth busy result", async () => {
    actor("token");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(busy()));
    vi.stubGlobal("fetch", fetchMock);
    const result = stocktakeApi.command("round_close", "/api/stocktakes/rounds/11111111-1111-4111-8111-111111111111/close", "token", {},
      { key: "key", adminPin: "pin" });
    const rejection = expect(result).rejects.toMatchObject({ code: "STOCKTAKE_BUSY" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled(), { interval: 1 });
    await vi.advanceTimersByTimeAsync(7_000);
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(4);

    entries.set("dexcowin_mes_operator_session", JSON.stringify({ employee_id: "employee-2", token: "token", expires_at: "2030-01-01T00:00:00Z" }));
    fetchMock.mockReset().mockResolvedValue(Response.json({ detail: {
      code: "SERVER_UNAVAILABLE", message: "down",
    } }, { status: 503 }));
    await expect(stocktakeApi.command("count_save", "/api/stocktakes/counts/11111111-1111-4111-8111-111111111111", "token", {},
      { key: "other-key", method: "PATCH" })).rejects.toMatchObject({ code: "SERVER_UNAVAILABLE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves an unknown network result through the same actor receipt before returning", async () => {
    actor("same-actor");
    const identity = { actor_employee_id: "employee-1", kind: "application_apply" as const, key: "same-key" };
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("connection lost"))
      .mockImplementationOnce(async () => {
        expect(isStocktakeCommandInFlight(identity)).toBe(true);
        return Response.json({ receipt_id: "found", status: "APPLIED" });
      });
    vi.stubGlobal("fetch", fetchMock);
    const result = await stocktakeApi.command("application_apply", "/api/stocktakes/rounds/11111111-1111-4111-8111-111111111111/applications",
      "same-actor", { preview_id: "p" }, { key: "same-key" });
    expect(result).toMatchObject({ receipt_id: "found" });
    expect(isStocktakeCommandInFlight(identity)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/stocktakes/commands/same-key?kind=application_apply");
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("X-Operator-Session")).toBe("same-actor");
  });

  it("does not infer success from a missing receipt after an unknown result", async () => {
    actor("token");
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ detail: {
      code: "COMMAND_RESULT_UNKNOWN", message: "unknown", extra: { receipt_lookup_required: true },
    } }, { status: 503 })).mockResolvedValueOnce(Response.json({ detail: {
      code: "NOT_FOUND", message: "missing",
    } }, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const failure = stocktakeApi.command("round_close", "/api/stocktakes/rounds/11111111-1111-4111-8111-111111111111/close", "token", {},
      { key: "unknown-key", adminPin: "pin" });
    await expect(failure).rejects.toMatchObject({ code: "COMMAND_RESULT_UNKNOWN" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ends at the ten-second command deadline without starting a receipt lookup after its budget is gone", async () => {
    actor("actor");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const fetchMock = vi.fn().mockImplementationOnce((_path, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = stocktakeApi.command("round_close", "/api/stocktakes/rounds/11111111-1111-4111-8111-111111111111/close", "actor", {},
      { key: "deadline-key", adminPin: "pin" });
    const rejection = expect(result).rejects.toMatchObject({ code: "COMMAND_RESULT_UNKNOWN" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled(), { interval: 1 });
    const identity = { actor_employee_id: "employee-1", kind: "round_close" as const, key: "deadline-key" };
    expect(isStocktakeCommandInFlight(identity)).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    expect(isStocktakeCommandInFlight(identity)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bounds the automatic receipt lookup by the remaining command budget", async () => {
    actor("actor");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("connection lost"))
      .mockImplementationOnce((_path, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "AbortError")));
      }));
    vi.stubGlobal("fetch", fetchMock);
    const result = stocktakeApi.command("application_apply", "/api/stocktakes/rounds/11111111-1111-4111-8111-111111111111/applications", "actor", {},
      { key: "unknown-key" });
    const rejection = expect(result).rejects.toMatchObject({ code: "COMMAND_RESULT_UNKNOWN" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled(), { interval: 1 });
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounds an authenticated read and forwards an external abort", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const fetchMock = vi.fn().mockImplementation((_path, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const timedOut = stocktakeApi.read("/api/stocktakes/rounds", "actor");
    const rejection = expect(timedOut).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled(), { interval: 1 });
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    const controller = new AbortController();
    const cancelled = stocktakeApi.read("/api/stocktakes/rounds", "actor", { signal: controller.signal });
    const cancellation = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await cancellation;
  });

  it("requires rollback confirmation before treating a busy-looking response as retryable", async () => {
    actor("token");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ detail: {
      code: "STOCKTAKE_BUSY", message: "uncertain", extra: { retryable: false },
    } }, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(stocktakeApi.command("count_force_release", "/api/stocktakes/counts/11111111-1111-4111-8111-111111111111/force-release", "token", {},
      { key: "key", adminPin: "pin" })).rejects.toMatchObject({ code: "STOCKTAKE_BUSY" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires an explicit token, a key, and a fresh admin PIN", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(stocktakeApi.command("round_close", "/api/stocktakes/rounds/11111111-1111-4111-8111-111111111111/close", "token", {},
      { key: "key" })).rejects.toThrow();
    await expect(stocktakeApi.read("/api/stocktakes/rounds", "")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends explicit authenticated GET headers and retains API error codes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ detail: {
      code: "TARGET_SET_CHANGED", message: "stale", extra: { generation: 2 },
    } }, { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(stocktakeApi.read("/api/stocktakes/rounds/11111111-1111-4111-8111-111111111111/targets", "token", {
      headers: { "X-Test": "value" },
    })).rejects.toMatchObject({ status: 409, code: "TARGET_SET_CHANGED", extra: { generation: 2 } });
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("X-Operator-Session")).toBe("token");
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("X-Test")).toBe("value");
  });
});
