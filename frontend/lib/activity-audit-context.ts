export type AuditScreen = {
  key: string;
  label: string;
};

type AuditScreenPriority = "tab" | "workflow";
type AuditScreenOptions = {
  priority?: AuditScreenPriority;
  force?: boolean;
};

const AUDIT_SESSION_STORAGE_KEY = "dexcowin_mes_audit_session";
const AUDIT_TERMINAL_STORAGE_KEY = "dexcowin_mes_audit_terminal";

let currentScreen: (AuditScreen & { priority: AuditScreenPriority }) | null = null;

function createIdentifier(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readOrCreate(storage: Storage, key: string): string {
  const existing = storage.getItem(key)?.trim();
  if (existing) return existing;
  const created = createIdentifier();
  storage.setItem(key, created);
  return created;
}

export function startAuditSession(): string | null {
  if (typeof window === "undefined") return null;
  const sessionId = createIdentifier();
  window.sessionStorage.setItem(AUDIT_SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}

export function clearAuditSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(AUDIT_SESSION_STORAGE_KEY);
  currentScreen = null;
}

export function setAuditScreen(screen: AuditScreen | null, options: AuditScreenOptions = {}): void {
  if (screen === null) {
    currentScreen = null;
    return;
  }
  const priority = options.priority ?? "tab";
  if (!options.force && currentScreen?.priority === "workflow" && priority !== "workflow") {
    return;
  }
  currentScreen = { ...screen, priority };
}

export function getAuditRequestHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const sessionId = readOrCreate(window.sessionStorage, AUDIT_SESSION_STORAGE_KEY);
  const terminalId = readOrCreate(window.localStorage, AUDIT_TERMINAL_STORAGE_KEY);
  const headers: Record<string, string> = {
    "X-MES-Audit-Session": sessionId,
    "X-MES-Terminal-Id": terminalId,
    "X-MES-Audit-Source": getClientEventSource(),
  };
  if (currentScreen) {
    headers["X-MES-Audit-Screen"] = currentScreen.key;
    headers["X-MES-Audit-Screen-Label"] = encodeURIComponent(currentScreen.label);
  }
  return headers;
}

export function getAuditEventContext(): Record<string, string> {
  const headers = getAuditRequestHeaders();
  const context: Record<string, string> = {
    session_id: headers["X-MES-Audit-Session"],
    terminal_id: headers["X-MES-Terminal-Id"],
  };
  if (currentScreen) {
    context.screen_key = currentScreen.key;
    context.screen_label = currentScreen.label;
  }
  return context;
}

export function getAuditTerminalId(): string | null {
  if (typeof window === "undefined") return null;
  return readOrCreate(window.localStorage, AUDIT_TERMINAL_STORAGE_KEY);
}
import { getClientEventSource } from "./operator-log-context";
