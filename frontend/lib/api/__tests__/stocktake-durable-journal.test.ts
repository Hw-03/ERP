import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recoverStocktakeCommand, resolveStocktakeCommand, retryStocktakeCommand, stocktakeApi } from "../stocktake";
import { isStocktakeCommandInFlight, listPendingStocktakeCommands, stageStocktakeCommand, subscribePendingStocktakeCommands } from "../stocktake-command-journal";

const ID = "11111111-1111-4111-8111-111111111111";
const PATH = `/api/stocktakes/counts/${ID}`;
const SESSION = "dexcowin_mes_operator_session";
const LEGACY = "dexcowin_mes_stocktake_command_journal";
const payload = { expected_version: 1, fence: 2, quantities: { normal: 0, defect: 0, b_grade: 0, obsolete: 0 } };
let session: Map<string, string>;
function login(token = "token-a", employee = "actor-a") {
  session.set(SESSION, JSON.stringify({ token, employee_id: employee, expires_at: "2030-01-01T00:00:00Z" }));
}
beforeEach(() => {
  session = new Map();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => session.get(key) ?? null,
    setItem: (key: string, value: string) => { session.set(key, value); }, removeItem: (key: string) => { session.delete(key); } });
  login();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("durable stocktake journal", () => {
  it("clears an empty target check only after its successful receipt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ receipt_id: "empty", no_targets: true, target_count: 0 })));
    await expect(stocktakeApi.command("target_append_preview", `/api/stocktakes/rounds/${ID}/target-append-previews`, "token-a", {}, { key: "empty-key" }))
      .resolves.toMatchObject({ no_targets: true });
    expect(await listPendingStocktakeCommands("token-a")).toEqual([]);
  });
  it("keeps the original request after every tab-local value disappears", async () => {
    await stageStocktakeCommand("token-a", "count_save", "key-a", PATH, payload);
    session.clear();
    login("fresh-token");
    expect(await listPendingStocktakeCommands("fresh-token")).toMatchObject([{ key: "key-a", method: "PATCH",
      command_payload: { count_id: ID, ...payload }, payload }]);
  });

  it("atomically allows only one new key for concurrent registrations", async () => {
    const results = await Promise.allSettled(["a", "b"].map(key =>
      Promise.resolve().then(() => stageStocktakeCommand("token-a", "count_save", key, PATH, payload))));
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(results.find(row => row.status === "rejected")).toMatchObject({ reason: { code: "COMMAND_RECOVERY_REQUIRED" } });
    expect(await listPendingStocktakeCommands("token-a")).toHaveLength(1);
    expect(session.has(LEGACY)).toBe(false);
  });

  it("imports legacy rows without deleting durable records of another employee", async () => {
    await stageStocktakeCommand("token-a", "count_save", "durable", PATH, payload);
    session.set(LEGACY, JSON.stringify([{ actor_employee_id: "actor-b", kind: "count_save", key: "legacy", path: PATH, payload }]));
    login("token-b", "actor-b");
    expect(await listPendingStocktakeCommands("token-b")).toMatchObject([{ key: "legacy", method: "PATCH" }]);
    expect(session.has(LEGACY)).toBe(false);
    login();
    expect(await listPendingStocktakeCommands("token-a")).toMatchObject([{ key: "durable" }]);
  });

  it("does not send before durable storage and retains a rejected command until resolved", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ detail: { code: "COUNT_VERSION_CONFLICT", message: "changed" } }, { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = stocktakeApi.command("count_save", PATH, "token-a", payload, { key: "saved", method: "PATCH" });
    const failure = expect(result).rejects.toMatchObject({ code: "COUNT_VERSION_CONFLICT" });
    expect(fetchMock).not.toHaveBeenCalled();
    await failure;
    expect(await listPendingStocktakeCommands("token-a")).toMatchObject([{ key: "saved" }]);
  });

  it("fails closed when IndexedDB cannot be used", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(stocktakeApi.command("count_save", PATH, "token-a", payload, { key: "key", method: "PATCH" }))
      .rejects.toMatchObject({ code: "COMMAND_JOURNAL_UNAVAILABLE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects cross-origin and mismatched command paths without storing them", async () => {
    await expect(Promise.resolve().then(() => stageStocktakeCommand("token-a", "count_save", "bad", `https://other.invalid${PATH}`, payload)))
      .rejects.toMatchObject({ code: "COMMAND_JOURNAL_UNAVAILABLE" });
    await expect(Promise.resolve().then(() => stageStocktakeCommand("token-a", "count_confirm", "bad", PATH, payload)))
      .rejects.toMatchObject({ code: "COMMAND_JOURNAL_UNAVAILABLE" });
    expect(await listPendingStocktakeCommands("token-a")).toEqual([]);
  });

  it("retries only the stored original method, body and key after a new login", async () => {
    await stageStocktakeCommand("token-a", "count_save", "original", PATH, payload);
    session.clear(); login("fresh-token");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ receipt_id: "done", version: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(retryStocktakeCommand("fresh-token", "count_save", "original")).resolves.toMatchObject({ version: 2 });
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(PATH);
    expect(request.method).toBe("PATCH");
    expect(JSON.parse(request.body)).toEqual(payload);
    expect(new Headers(request.headers).get("Idempotency-Key")).toBe("original");
    expect(new Headers(request.headers).get("X-Operator-Session")).toBe("fresh-token");
    expect(await listPendingStocktakeCommands("fresh-token")).toEqual([]);
  });

  it("resolves the stored canonical request and clears only a terminal server outcome", async () => {
    await stageStocktakeCommand("token-a", "count_save", "original", PATH, payload);
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ resolution: "unknown" }))
      .mockResolvedValueOnce(Response.json({ resolution: "NOT_APPLIED", receipt_id: "fenced" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveStocktakeCommand("token-a", "count_save", "original", "Closed tab"))
      .rejects.toMatchObject({ code: "COMMAND_RESULT_UNKNOWN" });
    expect(await listPendingStocktakeCommands("token-a")).toHaveLength(1);
    await expect(resolveStocktakeCommand("token-a", "count_save", "original", "Closed tab"))
      .resolves.toMatchObject({ resolution: "NOT_APPLIED" });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/stocktakes/commands/original/resolve");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ kind: "count_save", command_payload: { count_id: ID, ...payload }, reason: "Closed tab" });
    expect(await listPendingStocktakeCommands("token-a")).toEqual([]);
  });

  it("cleans up a definitive non-application receipt without claiming success", async () => {
    await stageStocktakeCommand("token-a", "count_save", "original", PATH, payload);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: { code: "COMMAND_NOT_APPLIED",
      message: "fenced", extra: { definitive: true, receipt_id: "fenced" } } }, { status: 409 })));
    await expect(recoverStocktakeCommand("token-a", "count_save", "original"))
      .rejects.toMatchObject({ code: "COMMAND_NOT_APPLIED" });
    expect(await listPendingStocktakeCommands("token-a")).toEqual([]);
  });

  it("does not send after storage commits if the employee session changed meanwhile", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const add = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof add>) {
      const result = add.apply(this, args);
      login("token-b", "actor-b");
      return result;
    });
    try {
      await expect(stocktakeApi.command("count_save", PATH, "token-a", payload, { key: "original", method: "PATCH" }))
        .rejects.toMatchObject({ code: "OPERATOR_SESSION_INVALID" });
    } finally { vi.restoreAllMocks(); }
    expect(fetchMock).not.toHaveBeenCalled();
    login();
    expect(await listPendingStocktakeCommands("token-a")).toMatchObject([{ key: "original" }]);
    expect(isStocktakeCommandInFlight({ actor_employee_id: "actor-a", kind: "count_save", key: "original" })).toBe(false);
  });

  it("starts tracking before durable insertion and keeps an overlapping key active until its first delivery ends", async () => {
    const identity = { actor_employee_id: "actor-a", kind: "count_save" as const, key: "original" };
    const add = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof add>) {
      expect(isStocktakeCommandInFlight(identity)).toBe(true);
      return add.apply(this, args);
    });
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>(done => { finish = done; }));
    vi.stubGlobal("fetch", fetchMock);
    const first = stocktakeApi.command("count_save", PATH, "token-a", payload, { key: "original", method: "PATCH" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await expect(stocktakeApi.command("count_save", PATH, "token-a", payload, { key: "original", method: "PATCH" }))
      .rejects.toMatchObject({ code: "COMMAND_RECOVERY_REQUIRED" });
    expect(isStocktakeCommandInFlight(identity)).toBe(true);
    finish(Response.json({ receipt_id: "done" }));
    await first;
    expect(isStocktakeCommandInFlight(identity)).toBe(false);
  });

  it("a failed cleanup exposes the retained record after successful delivery", async () => {
    vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(() => { throw new Error("cleanup failed"); });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ receipt_id: "done" })));
    await expect(stocktakeApi.command("count_save", PATH, "token-a", payload, { key: "original", method: "PATCH" }))
      .resolves.toMatchObject({ receipt_id: "done" });
    const rows = await listPendingStocktakeCommands("token-a");
    expect(rows).toMatchObject([{ key: "original" }]);
    expect(isStocktakeCommandInFlight(rows[0])).toBe(false);
  });

  it("a restored command stays visible during explicit original-key retry", async () => {
    await stageStocktakeCommand("token-a", "count_save", "original", PATH, payload);
    const [entry] = await listPendingStocktakeCommands("token-a");
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>(done => { finish = done; }));
    vi.stubGlobal("fetch", fetchMock);
    const retry = retryStocktakeCommand("token-a", "count_save", "original");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(isStocktakeCommandInFlight(entry)).toBe(false);
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("Idempotency-Key")).toBe("original");
    finish(Response.json({ receipt_id: "done" }));
    await retry;
  });

  it("another tab module sees durable evidence without inheriting this tab's delivery marker", async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>(done => { finish = done; }));
    vi.stubGlobal("fetch", fetchMock);
    const delivery = stocktakeApi.command("count_save", PATH, "token-a", payload, { key: "tab-key", method: "PATCH" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [entry] = await listPendingStocktakeCommands("token-a");
    expect(isStocktakeCommandInFlight(entry)).toBe(true);
    vi.resetModules();
    const otherTab = await import("../stocktake-command-journal");
    expect(await otherTab.listPendingStocktakeCommands("token-a")).toMatchObject([{ key: "tab-key" }]);
    expect(otherTab.isStocktakeCommandInFlight(entry)).toBe(false);
    finish(Response.json({ receipt_id: "done" }));
    await delivery;
  });

  it("keeps the legacy original when a durable transaction cannot store it", async () => {
    const raw = JSON.stringify([{ actor_employee_id: "actor-a", kind: "count_save", key: "legacy", path: PATH, payload }]);
    session.set(LEGACY, raw);
    vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(stocktakeApi.command("count_save", PATH, "token-a", payload, { key: "next", method: "PATCH" }))
      .rejects.toMatchObject({ code: "COMMAND_JOURNAL_UNAVAILABLE" });
    expect(session.get(LEGACY)).toBe(raw);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a new PIN for both administrator recovery mutations and never persists it", async () => {
    await stageStocktakeCommand("token-a", "count_force_release", "close", `/api/stocktakes/counts/${ID}/force-release`, { expected_version: 1, fence: 2, reason_code: "OPERATOR_REQUEST", reason: "Release" });
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(retryStocktakeCommand("token-a", "count_force_release", "close")).rejects.toMatchObject({ code: "ADMIN_PIN_REQUIRED" });
    await expect(resolveStocktakeCommand("token-a", "count_force_release", "close", "Reason")).rejects.toMatchObject({ code: "ADMIN_PIN_REQUIRED" });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(Response.json({ resolution: "NOT_APPLIED", receipt_id: "fence" }));
    await resolveStocktakeCommand("token-a", "count_force_release", "close", "Reason", "1234");
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("X-Admin-Pin")).toBe("1234");
    expect(fetchMock.mock.calls[0][1].body).not.toContain("1234");
  });

  it("retries and resolves department round commands without a shared administrator PIN", async () => {
    const path = `/api/stocktakes/rounds/${ID}/close`;
    const body = { preview_id: ID, preview_hash: "hash" };
    await stageStocktakeCommand("token-a", "round_close", "retry", path, body);
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ receipt_id: "done" }))
      .mockResolvedValueOnce(Response.json({ resolution: "NOT_APPLIED", receipt_id: "fence" }));
    vi.stubGlobal("fetch", fetchMock);
    await retryStocktakeCommand("token-a", "round_close", "retry");
    await stageStocktakeCommand("token-a", "round_close", "resolve", path, body);
    await resolveStocktakeCommand("token-a", "round_close", "resolve", "Recovery");
    for (const [, init] of fetchMock.mock.calls) expect(new Headers(init.headers).has("X-Admin-Pin")).toBe(false);
    expect(await listPendingStocktakeCommands("token-a")).toEqual([]);
  });

  it("retains an unresolved record after logout, expired authentication and malformed receipts", async () => {
    await stageStocktakeCommand("token-a", "count_save", "original", PATH, payload);
    session.delete(SESSION);
    await expect(listPendingStocktakeCommands("token-a")).rejects.toMatchObject({ code: "OPERATOR_SESSION_INVALID" });
    session.set(SESSION, JSON.stringify({ token: "token-a", employee_id: "actor-a", expires_at: "2000-01-01T00:00:00Z" }));
    await expect(retryStocktakeCommand("token-a", "count_save", "original")).rejects.toMatchObject({ code: "OPERATOR_SESSION_INVALID" });
    login();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "ok" })));
    await expect(recoverStocktakeCommand("token-a", "count_save", "original")).rejects.toMatchObject({ code: "COMMAND_RESULT_UNKNOWN" });
    expect(await listPendingStocktakeCommands("token-a")).toHaveLength(1);
  });

  it("uses the canonical PATCH method for an initial count save even when the option is omitted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ receipt_id: "saved" }));
    vi.stubGlobal("fetch", fetchMock);
    await stocktakeApi.command("count_save", PATH, "token-a", payload, { key: "original" });
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
  });

  it("refuses a corrupted durable body without deleting it or sending it", async () => {
    await stageStocktakeCommand("token-a", "count_save", "original", PATH, payload);
    const [row] = await listPendingStocktakeCommands("token-a");
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("dexcowin_mes_stocktake_commands", 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction("pending", "readwrite");
        tx.objectStore("pending").put({ ...row, payload: { ...payload, fence: 999 } });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(retryStocktakeCommand("token-a", "count_save", "original")).rejects.toMatchObject({ code: "COMMAND_JOURNAL_UNAVAILABLE" });
    await expect(listPendingStocktakeCommands("token-a")).rejects.toMatchObject({ code: "COMMAND_JOURNAL_UNAVAILABLE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes on another tab notification and releases subscriptions on cleanup", () => {
    const channels: Array<{ onmessage?: (event: { data: object }) => void; close: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal("BroadcastChannel", class {
      onmessage?: (event: { data: object }) => void;
      close = vi.fn();
      constructor() { channels.push(this); }
    });
    const listener = vi.fn();
    const unsubscribe = subscribePendingStocktakeCommands(listener);
    channels[0].onmessage?.({ data: { source: "another-tab" } });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(channels[0].close).toHaveBeenCalledTimes(1);
  });
});
