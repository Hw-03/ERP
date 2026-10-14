import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { recoverStocktakeCommand, stocktakeApi } from "../stocktake";
import { listPendingStocktakeCommands, subscribePendingStocktakeCommands } from "../stocktake-command-journal";

const SESSION_KEY = "dexcowin_mes_operator_session";
const JOURNAL_KEY = "dexcowin_mes_stocktake_command_journal";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

let storage: MemoryStorage;
function actor(token: string, employeeId: string): void {
  storage.setItem(SESSION_KEY, JSON.stringify({ token, employee_id: employeeId,
    tab_id: "tab-1", expires_at: "2030-01-01T00:00:00Z" }));
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  storage = new MemoryStorage();
  vi.stubGlobal("sessionStorage", storage);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("stocktake command journal", () => {
  it.each([
    ["application_bulk_preview", "application-bulk-previews"],
    ["application_bulk_apply", "bulk-applications"],
  ] as const)("journals and recovers %s with the original key", async (kind, route) => {
    actor("bearer-bulk", "employee-bulk");
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ detail: {
      code: "COMMAND_RESULT_UNKNOWN", message: "uncertain",
    } }, { status: 503 })).mockResolvedValueOnce(Response.json({ detail: {
      code: "NOT_FOUND", message: "missing",
    } }, { status: 404 })).mockResolvedValueOnce(Response.json({ receipt_id: "bulk-receipt", applications: [{ application_id: "bulk-result" }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(stocktakeApi.command(kind, `/api/stocktakes/rounds/11111111-1111-4111-8111-111111111111/${route}`,
      "bearer-bulk", { preview_id: "p", preview_hash: "h" }, { key: "bulk-key" })).rejects.toMatchObject({ code: "COMMAND_RESULT_UNKNOWN" });
    const pending = await listPendingStocktakeCommands("bearer-bulk");
    expect(pending).toMatchObject([{ kind, key: "bulk-key", actor_employee_id: "employee-bulk" }]);
    await recoverStocktakeCommand("bearer-bulk", kind, "bulk-key");
    expect(String(fetchMock.mock.calls[2][0])).toContain(`bulk-key?kind=${kind}`);
    expect(await listPendingStocktakeCommands("bearer-bulk")).toEqual([]);
  });
  it("persists the actor and exact command before HTTP without storing a PIN or bearer", async () => {
    actor("bearer-1", "employee-1");
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const updates = vi.fn();
    const unsubscribe = subscribePendingStocktakeCommands(updates);
    const command = stocktakeApi.command("round_close", "/api/stocktakes/rounds/11111111-1111-4111-8111-111111111111/close", "bearer-1",
      { preview_id: "p", preview_hash: "h" }, { key: "key-1", adminPin: "4321" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await listPendingStocktakeCommands("bearer-1")).toMatchObject([{ actor_employee_id: "employee-1",
      kind: "round_close", key: "key-1", path: "/api/stocktakes/rounds/11111111-1111-4111-8111-111111111111/close",
      payload: { preview_id: "p", preview_hash: "h" } }]);
    expect(JSON.stringify(await listPendingStocktakeCommands("bearer-1"))).not.toContain("bearer-1");
    expect(JSON.stringify(await listPendingStocktakeCommands("bearer-1"))).not.toContain("4321");
    finish(Response.json({ receipt_id: "receipt-1" }));
    await command;
    expect(await listPendingStocktakeCommands("bearer-1")).toEqual([]);
    expect(updates).toHaveBeenCalledTimes(4);
    unsubscribe();
  });

  it("blocks another key for the same actor while allowing another actor after reauthentication", async () => {
    actor("bearer-a", "employee-a");
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ detail: {
      code: "COMMAND_RESULT_UNKNOWN", message: "uncertain",
    } }, { status: 503 })).mockResolvedValueOnce(Response.json({ detail: {
      code: "NOT_FOUND", message: "missing",
    } }, { status: 404 })).mockResolvedValueOnce(Response.json({ receipt_id: "other" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(stocktakeApi.command("count_save", "/api/stocktakes/counts/11111111-1111-4111-8111-111111111111", "bearer-a", {},
      { key: "key-a", method: "PATCH" })).rejects.toMatchObject({ code: "COMMAND_RESULT_UNKNOWN" });
    await expect(stocktakeApi.command("count_save", "/api/stocktakes/counts/11111111-1111-4111-8111-111111111111", "bearer-a", {},
      { key: "key-b", method: "PATCH" })).rejects.toMatchObject({ code: "COMMAND_RECOVERY_REQUIRED" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    actor("bearer-b", "employee-b");
    await stocktakeApi.command("count_save", "/api/stocktakes/counts/22222222-2222-4222-8222-222222222222", "bearer-b", {},
      { key: "key-c", method: "PATCH" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await listPendingStocktakeCommands("bearer-b")).toEqual([]);
    actor("new-bearer-a", "employee-a");
    expect(await listPendingStocktakeCommands("new-bearer-a")).toMatchObject([{ key: "key-a" }]);
  });

  it("recovers after reload or reauthentication and keeps missing receipts pending", async () => {
    actor("bearer-a", "employee-a");
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ detail: {
      code: "COMMAND_RESULT_UNKNOWN", message: "uncertain",
    } }, { status: 503 })).mockResolvedValueOnce(Response.json({ detail: {
      code: "NOT_FOUND", message: "missing",
    } }, { status: 404 })).mockResolvedValueOnce(Response.json({ detail: {
      code: "NOT_FOUND", message: "missing",
    } }, { status: 404 })).mockResolvedValueOnce(Response.json({ receipt_id: "found" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(stocktakeApi.command("application_apply", "/api/stocktakes/rounds/11111111-1111-4111-8111-111111111111/applications", "bearer-a", {},
      { key: "key-a" })).rejects.toMatchObject({ code: "COMMAND_RESULT_UNKNOWN" });
    actor("new-bearer-a", "employee-a");
    await expect(recoverStocktakeCommand("new-bearer-a", "application_apply", "key-a"))
      .rejects.toMatchObject({ status: 404 });
    expect(await listPendingStocktakeCommands("new-bearer-a")).toHaveLength(1);
    await expect(recoverStocktakeCommand("new-bearer-a", "application_apply", "key-a"))
      .resolves.toMatchObject({ receipt_id: "found" });
    expect(await listPendingStocktakeCommands("new-bearer-a")).toEqual([]);
  });

  it("lets the existing raw receipt read clear a matching journal entry", async () => {
    actor("bearer-a", "employee-a");
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ detail: {
      code: "COMMAND_RESULT_UNKNOWN", message: "uncertain",
    } }, { status: 503 })).mockResolvedValueOnce(Response.json({ detail: {
      code: "NOT_FOUND", message: "missing",
    } }, { status: 404 })).mockResolvedValueOnce(Response.json({ receipt_id: "found" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(stocktakeApi.command("count_confirm", "/api/stocktakes/counts/11111111-1111-4111-8111-111111111111/confirm", "bearer-a", {},
      { key: "key-a" })).rejects.toMatchObject({ code: "COMMAND_RESULT_UNKNOWN" });
    await stocktakeApi.read("/api/stocktakes/commands/key-a?kind=count_confirm", "bearer-a");
    expect(await listPendingStocktakeCommands("bearer-a")).toEqual([]);
  });

  it("fails closed before HTTP when storage is unavailable or corrupted", async () => {
    actor("bearer-a", "employee-a");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    storage.setItem(JOURNAL_KEY, "{broken");
    await expect(stocktakeApi.command("count_save", "/api/stocktakes/counts/11111111-1111-4111-8111-111111111111", "bearer-a", {},
      { key: "key-a", method: "PATCH" })).rejects.toMatchObject({ code: "COMMAND_JOURNAL_UNAVAILABLE" });
    storage.removeItem(JOURNAL_KEY);
    vi.spyOn(indexedDB, "open").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
    await expect(stocktakeApi.command("count_save", "/api/stocktakes/counts/11111111-1111-4111-8111-111111111111", "bearer-a", {},
      { key: "key-b", method: "PATCH" })).rejects.toMatchObject({ code: "COMMAND_JOURNAL_UNAVAILABLE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects payloads containing secret fields instead of persisting them", async () => {
    actor("bearer-a", "employee-a");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(stocktakeApi.command("count_save", "/api/stocktakes/counts/11111111-1111-4111-8111-111111111111", "bearer-a",
      { nested: { admin_pin: "1234" } }, { key: "key-a", method: "PATCH" }))
      .rejects.toMatchObject({ code: "COMMAND_JOURNAL_UNAVAILABLE" });
    expect(storage.getItem(JOURNAL_KEY)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not strand a staged command when a UI journal subscriber throws", async () => {
    actor("bearer-a", "employee-a");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ receipt_id: "done" }));
    vi.stubGlobal("fetch", fetchMock);
    const unsubscribe = subscribePendingStocktakeCommands(() => { throw new Error("render failure"); });
    await expect(stocktakeApi.command("count_save", "/api/stocktakes/counts/11111111-1111-4111-8111-111111111111", "bearer-a", {},
      { key: "key-a", method: "PATCH" })).resolves.toMatchObject({ receipt_id: "done" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await listPendingStocktakeCommands("bearer-a")).toEqual([]);
    unsubscribe();
  });

  it("retains conflicts and server errors until an authenticated resolution", async () => {
    actor("bearer-a", "employee-a");
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ detail: {
      code: "PREVIEW_STALE", message: "changed",
    } }, { status: 409 })).mockResolvedValueOnce(Response.json({ detail: {
      code: "SERVER_UNAVAILABLE", message: "unknown server state",
    } }, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(stocktakeApi.command("application_apply", "/api/stocktakes/rounds/11111111-1111-4111-8111-111111111111/applications", "bearer-a", {},
      { key: "key-a" })).rejects.toMatchObject({ code: "PREVIEW_STALE" });
    expect(await listPendingStocktakeCommands("bearer-a")).toMatchObject([{ key: "key-a" }]);
    actor("bearer-b", "employee-b");
    await expect(stocktakeApi.command("application_apply", "/api/stocktakes/rounds/11111111-1111-4111-8111-111111111111/applications", "bearer-b", {},
      { key: "key-b" })).rejects.toMatchObject({ code: "SERVER_UNAVAILABLE" });
    expect(await listPendingStocktakeCommands("bearer-b")).toMatchObject([{ key: "key-b" }]);
  });
});
