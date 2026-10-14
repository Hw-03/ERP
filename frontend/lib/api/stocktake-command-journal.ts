/** Durable command evidence; authentication credentials remain tab-local. */
import { ApiError } from "../api-core";
import type { StocktakeCommandKind } from "./types/stocktake";

const SESSION_KEY = "dexcowin_mes_operator_session";
const LEGACY_KEY = "dexcowin_mes_stocktake_command_journal";
const DATABASE = "dexcowin_mes_stocktake_commands";
const STORE = "pending";
const SOURCE = Math.random().toString(36).slice(2);
const SECRET_FIELD = /pin|token|password|secret|credential|session/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const listeners = new Set<() => void>();
const inFlight = new Map<string, number>();

type CommandIdentity = Pick<PendingStocktakeCommand, "actor_employee_id" | "kind" | "key">;

function identityKey(command: CommandIdentity): string {
  return JSON.stringify([command.actor_employee_id, command.kind, command.key]);
}

/** Only delivery in this tab is hidden; persisted evidence remains recoverable elsewhere. */
export function isStocktakeCommandInFlight(command: CommandIdentity): boolean {
  return inFlight.has(identityKey(command));
}

/** Begin before staging and release after transport, retries, lookup, and cleanup settle. */
export function beginStocktakeCommandDelivery(actor: string, kind: StocktakeCommandKind, key: string): () => void {
  const identity = identityKey({ actor_employee_id: actor, kind, key });
  inFlight.set(identity, (inFlight.get(identity) ?? 0) + 1);
  notifyLocal();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    const remaining = (inFlight.get(identity) ?? 1) - 1;
    if (remaining) inFlight.set(identity, remaining);
    else inFlight.delete(identity);
    notifyLocal();
  };
}

export interface PendingStocktakeCommand {
  version: 2;
  actor_employee_id: string;
  kind: StocktakeCommandKind;
  key: string;
  path: string;
  method: "POST" | "PATCH";
  payload: object;
  command_payload: object;
  created_at: string;
}

const ROUTES: Record<StocktakeCommandKind, string> = {
  round_start_preview: "/api/stocktakes/round-start-previews", round_start: "/api/stocktakes/rounds",
  target_append_preview: "/api/stocktakes/rounds/:round_id/target-append-previews",
  target_append: "/api/stocktakes/rounds/:round_id/target-appends",
  count_start: "/api/stocktakes/targets/:target_id/counts", count_save: "/api/stocktakes/counts/:count_id",
  count_confirm: "/api/stocktakes/counts/:count_id/confirm", count_resume: "/api/stocktakes/counts/:count_id/resume",
  count_abandon: "/api/stocktakes/counts/:count_id/abandon", count_force_release: "/api/stocktakes/counts/:count_id/force-release",
  application_preview: "/api/stocktakes/rounds/:round_id/application-previews", application_apply: "/api/stocktakes/rounds/:round_id/applications",
  application_bulk_preview: "/api/stocktakes/rounds/:round_id/application-bulk-previews",
  application_bulk_apply: "/api/stocktakes/rounds/:round_id/bulk-applications",
  round_close_preview: "/api/stocktakes/rounds/:round_id/close-previews", round_close: "/api/stocktakes/rounds/:round_id/close",
  correction_request: "/api/inventory/business-corrections", correction_preview: "/api/inventory/business-corrections/:correction_id/previews",
  correction_approve: "/api/inventory/business-corrections/:correction_id/approve",
  correction_reject: "/api/inventory/business-corrections/:correction_id/reject",
  correction_withdraw: "/api/inventory/business-corrections/:correction_id/withdraw",
};

function unavailable(): ApiError {
  return new ApiError("명령 기록을 안전하게 보관할 수 없습니다. 저장소를 확인해 주세요.", 503, "COMMAND_JOURNAL_UNAVAILABLE");
}

/** Local identity selects evidence; the server authorizes every request independently. */
export function actorForStocktakeToken(token: string): string {
  let raw: string | null;
  try { raw = sessionStorage.getItem(SESSION_KEY); } catch { throw unavailable(); }
  try {
    const session = JSON.parse(raw ?? "null");
    if (session?.token === token && typeof session.employee_id === "string"
        && typeof session.expires_at === "string" && Date.parse(session.expires_at) > Date.now()) return session.employee_id;
  } catch { /* Invalid credentials cannot select journal records. */ }
  throw new ApiError("작업자 인증을 다시 진행해 주세요.", 401, "OPERATOR_SESSION_INVALID");
}

function hasSecret(value: unknown): boolean {
  return !!value && typeof value === "object" && Object.entries(value).some(([key, child]) => SECRET_FIELD.test(key) || hasSecret(child));
}

/** Persisted records may only select an existing command route and its path IDs. */
function commandPayload(kind: StocktakeCommandKind, path: string, payload: object): object {
  const template = Object.hasOwn(ROUTES, kind) ? ROUTES[kind] : undefined;
  if (!template || !payload || Array.isArray(payload) || typeof payload !== "object" || hasSecret(payload)) throw unavailable();
  if (["actor_id", "actor_employee_id", "employee_id"].some(key => key in payload)) throw unavailable();
  const actual = path.split("/"), expected = template.split("/");
  if (actual.length !== expected.length) throw unavailable();
  const parameters: Record<string, string> = {};
  expected.forEach((part, index) => {
    if (part.startsWith(":")) {
      if (!UUID.test(actual[index]) || part.slice(1) in payload) throw unavailable();
      parameters[part.slice(1)] = actual[index].toLowerCase();
    } else if (part !== actual[index]) throw unavailable();
  });
  return { ...parameters, ...payload };
}

function entry(actor: string, kind: StocktakeCommandKind, key: string, path: string, payload: object): PendingStocktakeCommand {
  if (typeof actor !== "string" || !actor || typeof key !== "string" || !key || key.length > 128 || typeof path !== "string") throw unavailable();
  const body = JSON.parse(JSON.stringify(payload)) as object;
  return { version: 2, actor_employee_id: actor, kind, key, path, method: kind === "count_save" ? "PATCH" : "POST",
    payload: body, command_payload: commandPayload(kind, path, body), created_at: new Date().toISOString() };
}

function checked(value: PendingStocktakeCommand): PendingStocktakeCommand {
  if (!value || value.version !== 2 || typeof value.created_at !== "string" || !Number.isFinite(Date.parse(value.created_at))) throw unavailable();
  const normalized = entry(value.actor_employee_id, value.kind, value.key, value.path, value.payload);
  if (normalized.method !== value.method || JSON.stringify(normalized.command_payload) !== JSON.stringify(value.command_payload)) throw unavailable();
  return value;
}

/** Resolve after transaction completion, never after only an individual request. */
async function transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, rows: PendingStocktakeCommand[]) => T): Promise<T> {
  if (typeof indexedDB === "undefined") throw unavailable();
  return new Promise<T>((resolve, reject) => {
    let open: IDBOpenDBRequest;
    let blocked = false;
    try { open = indexedDB.open(DATABASE, 1); } catch { reject(unavailable()); return; }
    open.onupgradeneeded = () => { open.result.createObjectStore(STORE, { keyPath: ["actor_employee_id", "kind", "key"] }); };
    open.onerror = () => reject(unavailable());
    open.onblocked = () => { blocked = true; reject(unavailable()); };
    open.onsuccess = () => {
      const db = open.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => db.close();
      let transaction: IDBTransaction;
      try { transaction = db.transaction(STORE, mode, { durability: "strict" }); }
      catch { db.close(); reject(unavailable()); return; }
      let result: T, failure: unknown;
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onabort = () => { db.close(); reject(failure ?? unavailable()); };
      transaction.onerror = () => { /* Abort owns rejection and cleanup. */ };
      const store = transaction.objectStore(STORE);
      const read = store.getAll();
      read.onsuccess = () => {
        try { result = work(store, (read.result as PendingStocktakeCommand[]).map(checked)); }
        catch (error) { failure = error instanceof ApiError ? error : unavailable(); transaction.abort(); }
      };
    };
  });
}

function notifyLocal(): void {
  listeners.forEach(listener => { try { listener(); } catch { /* UI failure cannot change durable evidence. */ } });
}

function notify(): void {
  notifyLocal();
  if (typeof BroadcastChannel === "undefined") return;
  try { const channel = new BroadcastChannel(DATABASE); channel.postMessage({ source: SOURCE }); channel.close(); } catch { /* Focus reload remains available. */ }
}

async function importLegacy(): Promise<void> {
  let raw: string | null;
  try { raw = sessionStorage.getItem(LEGACY_KEY); } catch { throw unavailable(); }
  if (!raw) return;
  let legacy: PendingStocktakeCommand[];
  try {
    const values = JSON.parse(raw);
    if (!Array.isArray(values)) throw unavailable();
    legacy = values.map(row => {
      const migrated = entry(row.actor_employee_id, row.kind, row.key, row.path, row.payload);
      if (row.created_at !== undefined) {
        if (typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at))) throw unavailable();
        migrated.created_at = row.created_at;
      }
      return migrated;
    });
  } catch { throw unavailable(); }
  await transact("readwrite", (store, rows) => {
    for (const value of legacy) {
      const previous = rows.find(row => row.actor_employee_id === value.actor_employee_id && row.kind === value.kind && row.key === value.key);
      if (previous && (previous.path !== value.path || JSON.stringify(previous.payload) !== JSON.stringify(value.payload))) throw unavailable();
      if (!previous) { store.add(value); rows.push(value); }
    }
  });
  try { if (sessionStorage.getItem(LEGACY_KEY) === raw) sessionStorage.removeItem(LEGACY_KEY); } catch { throw unavailable(); }
  notify();
}

export async function listPendingStocktakeCommands(token: string): Promise<PendingStocktakeCommand[]> {
  const actor = actorForStocktakeToken(token);
  await importLegacy();
  return transact("readonly", (_store, rows) => rows.filter(row => row.actor_employee_id === actor));
}

/** The actor check and insertion share one transaction across every open tab. */
export async function stageStocktakeCommand(token: string, kind: StocktakeCommandKind, key: string,
  path: string, payload: object, method?: "POST" | "PATCH"): Promise<string> {
  const actor = actorForStocktakeToken(token);
  let value: PendingStocktakeCommand;
  try { value = entry(actor, kind, key, path, payload); } catch { throw unavailable(); }
  if (method && method !== value.method) throw unavailable();
  await importLegacy();
  await transact("readwrite", (store, rows) => {
    const pending = rows.find(row => row.actor_employee_id === actor);
    if (pending) throw new ApiError("미확인 요청의 결과를 먼저 확인해 주세요.", 409, "COMMAND_RECOVERY_REQUIRED", { kind: pending.kind, key: pending.key });
    store.add(value);
  });
  notify();
  return actor;
}

/** A failed cleanup keeps the record; it never reclassifies a confirmed server result. */
export async function clearPendingStocktakeCommand(actor: string, kind: StocktakeCommandKind, key: string): Promise<void> {
  try { await transact("readwrite", store => { store.delete([actor, kind, key]); }); notify(); }
  catch { /* The next authenticated lookup can repeat cleanup. */ }
}

export function subscribePendingStocktakeCommands(listener: () => void): () => void {
  listeners.add(listener);
  const wake = () => { try { listener(); } catch { /* Notification failures cannot change the journal. */ } };
  let channel: BroadcastChannel | undefined;
  try { if (typeof BroadcastChannel !== "undefined") { channel = new BroadcastChannel(DATABASE); channel.onmessage = event => { if (event.data?.source !== SOURCE) wake(); }; } }
  catch { /* IndexedDB transactions still serialize registration. */ }
  if (typeof window !== "undefined") { window.addEventListener("focus", wake); window.addEventListener("pageshow", wake); }
  return () => {
    listeners.delete(listener); channel?.close();
    if (typeof window !== "undefined") { window.removeEventListener("focus", wake); window.removeEventListener("pageshow", wake); }
  };
}
