/** Per-tab stocktake credential, separate from the legacy display-only login. */

import { ApiError } from "../api-core";
import { requestJson } from "../api/stocktake";
import type { Employee } from "../api/types/employees";
import type { OperatorSessionCurrent, OperatorSessionIssued } from "../api/types/stocktake";

const SESSION_KEY = "dexcowin_mes_operator_session";
const TAB_KEY = "dexcowin_mes_operator_tab_id";
const CHANNEL_NAME = "dexcowin_mes_operator_tab_owner";
const OWNERSHIP_PROBE_MS = 300;
const DOCUMENT_ID = globalThis.crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

type OwnershipMessage = {
  type: "probe" | "owned";
  tab_id: string;
  nonce: string;
  document_id: string;
};

let ownedTabId: string | null = null;
let channel: BroadcastChannel | null = null;
let pendingProbe: { tab_id: string; nonce: string; resolve: (owned: boolean) => void } | null = null;
let ownershipCheck: Promise<boolean> | null = null;

export interface StoredOperatorSession extends OperatorSessionIssued {
  employee_id: string;
  tab_id: string;
}

export interface RevocationResult {
  status: "revoked" | "uncertain";
  message?: string;
}

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

function freshTabId(): string {
  return globalThis.crypto.randomUUID?.() ?? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)))
    .map((part) => part.toString(16).padStart(2, "0")).join("");
}

function ownershipChannel(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<OwnershipMessage>) => {
    const message = event.data;
    if (!message || message.document_id === DOCUMENT_ID) return;
    if (message.type === "probe" && ownedTabId === message.tab_id) {
      channel?.postMessage({ ...message, type: "owned", document_id: DOCUMENT_ID });
    } else if (message.type === "owned" && pendingProbe?.tab_id === message.tab_id
        && pendingProbe.nonce === message.nonce) {
      pendingProbe.resolve(true);
    }
  };
  window.addEventListener("pagehide", () => {
    ownedTabId = null;
    channel?.close();
    channel = null;
  }, { once: true });
  return channel;
}

function tabId(): string {
  const current = storage()?.getItem(TAB_KEY);
  if (current) return current;
  const id = freshTabId();
  storage()?.setItem(TAB_KEY, id);
  return id;
}

function save(employeeId: string, issued: OperatorSessionIssued, tab: string): StoredOperatorSession {
  const session = { token: issued.token, expires_at: issued.expires_at, employee_id: employeeId, tab_id: tab };
  storage()?.setItem(SESSION_KEY, JSON.stringify(session));
  ownedTabId = tab;
  ownershipChannel();
  return session;
}

/** One PIN check returns the authoritative employee profile and a bearer for this tab. */
export async function authenticateEmployee(employeeId: string, pin: string): Promise<{
  employee: Employee;
  session: StoredOperatorSession;
}> {
  await validateTabOwnership();
  const tab = tabId();
  const result = await requestJson<{ employee: Employee; operator_session: OperatorSessionIssued }>(
    `/api/employees/${encodeURIComponent(employeeId)}/verify-pin`, null,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, tab_id: tab }) },
  );
  return { employee: result.employee, session: save(result.employee.employee_id, result.operator_session, tab) };
}

/** Re-authenticate an existing display login when its stocktake token is absent or expired. */
export async function issueSession(employeeId: string, pin: string): Promise<StoredOperatorSession> {
  await validateTabOwnership();
  const tab = tabId();
  const issued = await requestJson<OperatorSessionIssued>("/api/operator-sessions", null, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: employeeId, pin, tab_id: tab }),
  });
  return save(employeeId, issued, tab);
}

/** Local restore is only a cache read; call readOperatorSession for server validity. */
function storedSession(employeeId?: string): StoredOperatorSession | null {
  const local = storage();
  const raw = local?.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredOperatorSession>;
    if (!value.token || !value.employee_id || !value.tab_id || !value.expires_at
        || !Number.isFinite(Date.parse(value.expires_at)) || Date.parse(value.expires_at) <= Date.now()) {
      local?.removeItem(SESSION_KEY);
      return null;
    }
    // A stale workspace may still read while a different employee finishes logging in.
    if (employeeId && value.employee_id !== employeeId) return null;
    return value as StoredOperatorSession;
  } catch {
    local?.removeItem(SESSION_KEY);
    return null;
  }
}

/** Check for a live document with the same copied tab ID before using stored credentials. */
export async function validateTabOwnership(): Promise<boolean> {
  if (ownershipCheck) return ownershipCheck;
  ownershipCheck = (async () => {
    const session = storedSession();
    const candidateTabId = session?.tab_id ?? storage()?.getItem(TAB_KEY);
    if (!candidateTabId) return false;
    if (ownedTabId === candidateTabId) return !!session;
    const bus = ownershipChannel();
    if (!bus) {
      clearOperatorSession();
      storage()?.setItem(TAB_KEY, freshTabId());
      return false;
    }
    const nonce = freshTabId();
    const duplicate = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), OWNERSHIP_PROBE_MS);
      pendingProbe = { tab_id: candidateTabId, nonce, resolve: (owned) => {
        clearTimeout(timeout);
        resolve(owned);
      } };
      bus.postMessage({ type: "probe", tab_id: candidateTabId, nonce, document_id: DOCUMENT_ID });
    });
    pendingProbe = null;
    if (duplicate) {
      clearOperatorSession();
      storage()?.setItem(TAB_KEY, freshTabId());
      return false;
    }
    ownedTabId = candidateTabId;
    return !!session;
  })();
  try {
    return await ownershipCheck;
  } finally {
    ownershipCheck = null;
  }
}

/** Synchronous reads stay blocked until this document owns the tab credential. */
export function restoreOperatorSession(employeeId?: string): StoredOperatorSession | null {
  const session = storedSession(employeeId);
  return session && ownedTabId === session.tab_id ? session : null;
}

export async function readOperatorSession(token?: string): Promise<OperatorSessionCurrent> {
  const bearer = token ?? restoreOperatorSession()?.token;
  if (!bearer) throw new ApiError("작업자 인증을 다시 진행해 주세요.", 401, "OPERATOR_SESSION_INVALID");
  return requestJson<OperatorSessionCurrent>("/api/operator-sessions/current", bearer);
}

/** Remove the local bearer even when remote revocation could not be confirmed. */
export async function revokeOperatorSession(): Promise<RevocationResult> {
  const session = restoreOperatorSession();
  clearOperatorSession();
  if (!session) {
    return { status: "revoked" };
  }
  try {
    await requestJson<void>("/api/operator-sessions/current", session.token, { method: "DELETE", keepalive: true });
    return { status: "revoked" };
  } catch (failure) {
    if (failure instanceof ApiError && failure.status === 401) return { status: "revoked" };
    return { status: "uncertain", message: "서버의 작업자 세션 해지를 확인하지 못했습니다." };
  }
}

/** Immediate local clear for account switches; callers can separately report revoke uncertainty. */
export function clearOperatorSession(): void {
  storage()?.removeItem(SESSION_KEY);
  ownedTabId = null;
  channel?.close();
  channel = null;
}
