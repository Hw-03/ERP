/** Explicit actor headers and uncertainty handling for stocktake commands. */

import { ApiError, extractErrorMessage, toApiUrl } from "../api-core";
import { getAuditRequestHeaders } from "../activity-audit-context";
import { requestOperatorLogin } from "../auth/login-recovery";
import type { StocktakeCommandKind } from "./types/stocktake";
import { actorForStocktakeToken, beginStocktakeCommandDelivery, clearPendingStocktakeCommand, listPendingStocktakeCommands,
  stageStocktakeCommand } from "./stocktake-command-journal";
import type { PendingStocktakeCommand } from "./stocktake-command-journal";

export { isStocktakeCommandInFlight, listPendingStocktakeCommands, subscribePendingStocktakeCommands } from "./stocktake-command-journal";
export type { PendingStocktakeCommand } from "./stocktake-command-journal";

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;
const COMMAND_DEADLINE_MS = 10_000;
const ADMIN_COMMANDS = new Set<StocktakeCommandKind>([
  "count_force_release",
  "correction_preview", "correction_approve", "correction_reject",
]);

export function stocktakeCommandRequiresAdmin(kind: StocktakeCommandKind): boolean {
  return ADMIN_COMMANDS.has(kind);
}

export function stocktakeCommandRequiresRoundManager(kind: StocktakeCommandKind): boolean {
  return ADMIN_COMMANDS.has(kind) || kind === "round_start_preview" || kind === "round_start" || kind === "target_append_preview"
    || kind === "target_append" || kind === "round_close_preview" || kind === "round_close";
}

export function isStocktakeNotApplied(failure: unknown): failure is ApiError {
  return failure instanceof ApiError && failure.code === "COMMAND_NOT_APPLIED"
    && failure.extra?.definitive === true && typeof failure.extra.receipt_id === "string"
    && failure.extra.receipt_id.length > 0;
}

function hasReceipt(result: unknown): boolean {
  return !!result && typeof result === "object" && "receipt_id" in result
    && typeof result.receipt_id === "string" && result.receipt_id.length > 0;
}

export interface StocktakeCommandOptions {
  key: string;
  adminPin?: string;
  method?: "POST" | "PATCH";
}

function requireToken(token: string): void {
  if (!token) throw new ApiError("작업자 인증을 다시 진행해 주세요.", 401, "OPERATOR_SESSION_INVALID");
}

async function apiFailure(response: Response): Promise<ApiError> {
  const raw = await response.text();
  let detail: unknown;
  try {
    detail = JSON.parse(raw)?.detail;
  } catch {
    detail = raw;
  }
  const fields = detail && typeof detail === "object" && !Array.isArray(detail)
    ? detail as Record<string, unknown> : null;
  const extra = fields?.extra && typeof fields.extra === "object" && !Array.isArray(fields.extra)
    ? fields.extra as Record<string, unknown> : undefined;
  return new ApiError(extractErrorMessage(detail, raw || response.statusText), response.status,
    typeof fields?.code === "string" ? fields.code : undefined, extra);
}

/** Keep caller headers while forcing the explicit actor token at the wire boundary. */
export async function requestJson<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== "GET") {
    for (const [name, value] of Object.entries(getAuditRequestHeaders())) {
      if (!headers.has(name)) headers.set(name, value);
    }
  }
  if (token !== null) {
    requireToken(token);
    headers.set("X-Operator-Session", token);
  }
  const controller = new AbortController();
  const external = init.signal;
  const forwardAbort = () => controller.abort(external?.reason);
  if (external?.aborted) forwardAbort();
  else external?.addEventListener("abort", forwardAbort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, COMMAND_DEADLINE_MS);
  const aborted = new Promise<never>((_resolve, reject) => {
    const fail = () => reject(new DOMException("Request aborted", "AbortError"));
    if (controller.signal.aborted) fail();
    else controller.signal.addEventListener("abort", fail, { once: true });
  });
  try {
    const work = (async () => {
      const response = await fetch(toApiUrl(path), { ...init, credentials: "include", headers, signal: controller.signal });
      if (!response.ok) throw await apiFailure(response);
      if (response.status === 204) return undefined as T;
      const body = await response.text();
      return body ? JSON.parse(body) as T : undefined as T;
    })();
    return await Promise.race([work, aborted]);
  } catch (failure) {
    if (timedOut) throw new ApiError("요청 시간을 초과했습니다.", 504, "REQUEST_TIMEOUT");
    if (token !== null && failure instanceof ApiError && failure.code === "OPERATOR_SESSION_INVALID") requestOperatorLogin(token);
    throw failure;
  } finally {
    clearTimeout(timeout);
    external?.removeEventListener("abort", forwardAbort);
  }
}

function uncertain(kind: StocktakeCommandKind, key: string, cause: unknown): ApiError {
  return new ApiError("작업 결과를 확인할 수 없습니다. 같은 작업자의 영수증을 다시 조회해 주세요.",
    503, "COMMAND_RESULT_UNKNOWN", { kind, key, receipt_lookup_required: true,
      receipt_error_status: cause instanceof ApiError ? cause.status : undefined });
}

async function receiptAfterUnknown<T>(kind: StocktakeCommandKind, key: string, token: string, started: number): Promise<T> {
  const remaining = COMMAND_DEADLINE_MS - (Date.now() - started);
  if (remaining <= 0) throw uncertain(kind, key, new Error("deadline exceeded"));
  const query = new URLSearchParams({ kind });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remaining);
  try {
    return await stocktakeApi.read<T>(`/api/stocktakes/commands/${encodeURIComponent(key)}?${query}`, token,
      { signal: controller.signal });
  } catch (cause) {
    if (isStocktakeNotApplied(cause)) throw cause;
    // A 404 means no completed receipt was visible; it does not prove rollback.
    throw uncertain(kind, key, cause);
  } finally {
    clearTimeout(timeout);
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export const stocktakeApi = {
  async read<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
    requireToken(token);
    const match = /^\/api\/stocktakes\/commands\/([^/?]+)\?(.+)$/.exec(path);
    const actor = match ? actorForStocktakeToken(token) : undefined;
    const clearReceipt = async () => {
      if (!match || !actor) return;
      const kind = new URLSearchParams(match[2]).get("kind") as StocktakeCommandKind;
      await clearPendingStocktakeCommand(actor, kind, decodeURIComponent(match[1]));
    };
    let result: T;
    try { result = await requestJson<T>(path, token, { ...init, method: "GET", body: undefined }); }
    catch (failure) { if (isStocktakeNotApplied(failure)) await clearReceipt(); throw failure; }
    if (match) {
      if (!hasReceipt(result)) throw uncertain(new URLSearchParams(match[2]).get("kind") as StocktakeCommandKind,
        decodeURIComponent(match[1]), new Error("Invalid receipt"));
      await clearReceipt();
    }
    return result;
  },

  async command<T>(kind: StocktakeCommandKind, path: string, token: string, payload: object,
    options: StocktakeCommandOptions): Promise<T> {
    requireToken(token);
    if (!options.key || options.key.length > 128) {
      throw new ApiError("멱등 키가 올바르지 않습니다.", 422, "VALIDATION_ERROR");
    }
    if (ADMIN_COMMANDS.has(kind) && !options.adminPin) {
      throw new ApiError("관리자 PIN을 다시 입력해 주세요.", 403, "ADMIN_PIN_REQUIRED");
    }
    if ("actor_employee_id" in payload || "actor_id" in payload || "employee_id" in payload) {
      throw new ApiError("작업자 식별자는 요청 본문에 포함할 수 없습니다.", 422, "VALIDATION_ERROR");
    }
    const body = JSON.stringify(payload);
    const endDelivery = beginStocktakeCommandDelivery(actorForStocktakeToken(token), kind, options.key);
    try {
      const actor = await stageStocktakeCommand(token, kind, options.key, path, JSON.parse(body) as object, options.method);
      try { return await sendStoredCommand<T>(actor, kind, path, token, body, options); }
      catch (failure) {
        // Every staged request remains recoverable until an authenticated receipt fences it.
        if (isStocktakeNotApplied(failure)) throw failure;
        if (failure instanceof ApiError) throw new ApiError(failure.message, failure.status, failure.code,
          { ...failure.extra, command_pending: true });
        throw uncertain(kind, options.key, failure);
      }
    } finally { endDelivery(); }
  },
};

/** Both first delivery and explicit replay use the same bounded, original-key transport. */
async function sendStoredCommand<T>(actor: string, kind: StocktakeCommandKind, path: string, token: string,
  body: string, options: StocktakeCommandOptions): Promise<T> {
    if (ADMIN_COMMANDS.has(kind) && !options.adminPin) {
      throw new ApiError("관리자 PIN을 다시 입력해 주세요.", 403, "ADMIN_PIN_REQUIRED");
    }
    const clear = () => clearPendingStocktakeCommand(actor, kind, options.key);
    const headers = new Headers({ "Content-Type": "application/json", "Idempotency-Key": options.key,
      "X-Operator-Session": token });
    if (options.adminPin) headers.set("X-Admin-Pin", options.adminPin);
    const started = Date.now();
    for (let attempt = 0; ; attempt += 1) {
      if (actorForStocktakeToken(token) !== actor) throw new ApiError("작업자 인증을 다시 진행해 주세요.", 401, "OPERATOR_SESSION_INVALID");
      const remaining = COMMAND_DEADLINE_MS - (Date.now() - started);
      if (remaining <= 0) {
        throw new ApiError("재시도 제한 시간을 초과했습니다.", 503, "STOCKTAKE_BUSY");
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), remaining);
      try {
        const result = await requestJson<T>(path, token, {
          method: options.method ?? (kind === "count_save" ? "PATCH" : "POST"), headers, body, signal: controller.signal,
        });
        if (!hasReceipt(result)) throw uncertain(kind, options.key, new Error("Invalid receipt"));
        await clear();
        return result;
      } catch (failure) {
        if (failure instanceof ApiError && (failure.code === "COMMAND_RESULT_UNKNOWN" || failure.code === "REQUEST_TIMEOUT")) {
          const result = await receiptAfterUnknown<T>(kind, options.key, token, started);
          await clear();
          return result;
        }
        if (failure instanceof ApiError && failure.code === "STOCKTAKE_BUSY" && failure.extra?.retryable === true) {
          const delay = RETRY_DELAYS_MS[attempt];
          if (delay === undefined || Date.now() - started + delay >= COMMAND_DEADLINE_MS) {
            throw failure;
          }
          await wait(delay);
          continue;
        }
        if (failure instanceof ApiError) {
          if (isStocktakeNotApplied(failure)) await clear();
          throw failure;
        }
        const result = await receiptAfterUnknown<T>(kind, options.key, token, started);
        await clear();
        return result;
      } finally {
        clearTimeout(timeout);
      }
    }
}

async function pendingCommand(token: string, kind: StocktakeCommandKind, key: string): Promise<PendingStocktakeCommand> {
  const pending = (await listPendingStocktakeCommands(token)).find(entry => entry.kind === kind && entry.key === key);
  if (!pending) throw new ApiError("확인할 명령 기록을 찾을 수 없습니다.", 404, "NOT_FOUND");
  if (actorForStocktakeToken(token) !== pending.actor_employee_id) throw new ApiError("작업자 인증을 다시 진행해 주세요.", 401, "OPERATOR_SESSION_INVALID");
  return pending;
}

/** A user-selected replay cannot replace the persisted path, payload, method or key. */
export async function retryStocktakeCommand<T>(token: string, kind: StocktakeCommandKind, key: string, adminPin?: string): Promise<T> {
  const pending = await pendingCommand(token, kind, key);
  return sendStoredCommand<T>(pending.actor_employee_id, kind, pending.path, token, JSON.stringify(pending.payload),
    { key, adminPin, method: pending.method });
}

export interface StocktakeResolution { resolution: "COMPLETED" | "NOT_APPLIED"; receipt_id: string; result?: unknown }

/** The server fences unresolved requests; resolving a successful receipt never cancels it. */
export async function resolveStocktakeCommand(token: string, kind: StocktakeCommandKind, key: string,
  reason: string, adminPin?: string): Promise<StocktakeResolution> {
  const pending = await pendingCommand(token, kind, key);
  if (!reason.trim() || reason.trim().length > 1000) throw new ApiError("정리 사유를 입력해 주세요.", 422, "VALIDATION_ERROR");
  if (ADMIN_COMMANDS.has(kind) && !adminPin) throw new ApiError("관리자 PIN을 다시 입력해 주세요.", 403, "ADMIN_PIN_REQUIRED");
  const headers = new Headers({ "Content-Type": "application/json" });
  if (adminPin) headers.set("X-Admin-Pin", adminPin);
  let result: StocktakeResolution;
  try {
    result = await requestJson<StocktakeResolution>(`/api/stocktakes/commands/${encodeURIComponent(key)}/resolve`, token,
      { method: "POST", headers, body: JSON.stringify({ kind, command_payload: pending.command_payload, reason: reason.trim() }) });
  } catch (failure) {
    if (failure instanceof ApiError) throw failure;
    throw uncertain(kind, key, failure);
  }
  if (!hasReceipt(result) || !["COMPLETED", "NOT_APPLIED"].includes(result.resolution)
    || (result.resolution === "COMPLETED" && !hasReceipt(result.result))) throw uncertain(kind, key, new Error("Invalid resolution"));
  await clearPendingStocktakeCommand(pending.actor_employee_id, kind, key);
  return result;
}

/** Re-authenticated operators can resolve a previous document's exact successful receipt. */
export async function recoverStocktakeCommand<T>(token: string, kind: StocktakeCommandKind, key: string): Promise<T> {
  const pending = await pendingCommand(token, kind, key);
  const result = await stocktakeApi.read<T>(`/api/stocktakes/commands/${encodeURIComponent(key)}?kind=${kind}`, token);
  await clearPendingStocktakeCommand(pending.actor_employee_id, kind, key);
  return result;
}
