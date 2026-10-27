import {
  getClientEventSource,
  readCurrentEmployeeCodeForLog,
  type ClientEventSource,
} from "./operator-log-context";
import { getAuditEventContext } from "./activity-audit-context";
import { restoreOperatorSession } from "./auth/operator-session";

export type ClientEvent =
  | {
      event: "ui_error";
      occurred_at: string;
      error_source: ClientErrorSource;
      error_type: string;
      error_message: string;
      error_stack?: string;
      path: string;
      source?: ClientEventSource;
    }
  | { event: "ui_login"; source?: ClientEventSource }
  | { event: "ui_logout"; source?: ClientEventSource }
  | {
      event: "ui_nav";
      from?: string;
      to?: string;
      path?: string;
      screen_key?: string;
      screen_label?: string;
      source?: ClientEventSource;
    }
  | {
      event: "ui_action_cancel";
      action_key: string;
      action_label: string;
      target_summary?: string;
      related_id?: string;
      source?: ClientEventSource;
    };

const ALLOWED_EVENTS = new Set(["ui_login", "ui_logout", "ui_nav", "ui_action_cancel", "ui_error"]);

type ClientErrorSource = "window_error" | "unhandledrejection" | "react_boundary" | "global_boundary";
const reportedErrors = new WeakSet<object>();
let listenerUsers = 0;
let removeListeners: (() => void) | null = null;

/** Keep diagnostic text while removing common credential values and URL parameters. */
function cleanErrorText(value: string, limit: number): string {
  return value
    .replace(/((?:https?:\/\/|\/)[^\s?#]*)[?#][^\s)]*/gi, "$1")
    .replace(/\b(?:[a-z0-9]+[-_])*(?:pin|password|token|secret|authorization|cookie|storage|operator[-_]session|api[-_]key)(?:[-_][a-z0-9]+)*\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|(?:Bearer|Basic)\s+[^\s,;]+|[^\s,;]+)/gi, "[redacted]")
    .replace(/\bBearer\s+\S+/gi, "[redacted]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .slice(0, limit);
}

/** Report only explicit Error fields; rejected objects and application state stay local. */
export function reportClientError(error: unknown, source: ClientErrorSource): void {
  if (typeof window === "undefined") return;
  try {
    if (error !== null && typeof error === "object") {
      if (reportedErrors.has(error)) return;
      reportedErrors.add(error);
    }
    const isError = error instanceof Error;
    const message = isError ? error.message : typeof error === "string" ? error : "Non-Error rejection";
    const frames = isError && typeof error.stack === "string"
      ? error.stack.split("\n").filter((line) => /^\s*at\s|@.*:\d/.test(line)).join("\n") : "";
    sendClientEvent({
      event: "ui_error",
      occurred_at: new Date().toISOString(),
      error_source: source,
      error_type: cleanErrorText(isError ? error.name : "Error", 120),
      error_message: cleanErrorText(message, 500),
      error_stack: cleanErrorText(frames, 4000),
      path: window.location.pathname,
    });
  } catch {
    // A broken Error getter or blocked storage must not cause another UI failure.
  }
}

/** Share one listener pair across mounts, including React Strict Mode remounts. */
export function installClientErrorListeners(): () => void {
  if (typeof window === "undefined") return () => {};
  if (listenerUsers++ === 0) {
    const onError = (event: ErrorEvent): void => {
      reportClientError(event.error ?? event.message, "window_error");
    };
    const onRejection = (event: PromiseRejectionEvent): void => {
      reportClientError(event.reason, "unhandledrejection");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    removeListeners = () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    if (--listenerUsers === 0) {
      removeListeners?.();
      removeListeners = null;
    }
  };
}

function cleanEvent(event: ClientEvent): Record<string, string> | null {
  if (!ALLOWED_EVENTS.has(event.event)) return null;
  const payload: Record<string, string> = {
    event: event.event,
    source: event.source ?? getClientEventSource(),
  };
  if (event.event === "ui_nav") {
    if (event.from) payload.from = event.from;
    if (event.to) payload.to = event.to;
    if (event.path) payload.path = event.path;
    if (event.screen_key) payload.screen_key = event.screen_key;
    if (event.screen_label) payload.screen_label = event.screen_label;
  }
  if (event.event === "ui_action_cancel") {
    payload.action_key = event.action_key;
    payload.action_label = event.action_label;
    if (event.target_summary) payload.target_summary = event.target_summary;
    if (event.related_id) payload.related_id = event.related_id;
  }
  if (event.event === "ui_error") {
    payload.occurred_at = event.occurred_at;
    payload.error_source = event.error_source;
    payload.error_type = cleanErrorText(event.error_type, 120);
    payload.error_message = cleanErrorText(event.error_message, 500);
    if (event.error_stack) payload.error_stack = cleanErrorText(event.error_stack, 4000);
    payload.path = cleanErrorText(event.path, 120);
  }
  const auditContext = getAuditEventContext();
  payload.session_id = auditContext.session_id;
  payload.terminal_id = auditContext.terminal_id;
  if (!payload.screen_key && auditContext.screen_key) {
    payload.screen_key = auditContext.screen_key;
  }
  if (!payload.screen_label && auditContext.screen_label) {
    payload.screen_label = auditContext.screen_label;
  }
  return payload;
}

export function sendClientEvent(event: ClientEvent): void {
  if (typeof fetch !== "function") return;
  try {
    const payload = cleanEvent(event);
    if (!payload) return;
    const code = readCurrentEmployeeCodeForLog();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (code) headers["X-MES-Employee-Code"] = code;
    if (event.event === "ui_error" && typeof window !== "undefined") {
      // Transport the tab credential only as an authentication header, never as log data.
      try {
        const session = restoreOperatorSession();
        if (session) headers["X-Operator-Session"] = session.token;
      } catch {
        // Legacy logins can still be attributed using the server's signed audit cookie.
      }
    }
    void fetch("/api/client-events", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: "include",
    }).catch(() => {});
  } catch {
    // Client event logging must never block the MES screen flow.
  }
}
