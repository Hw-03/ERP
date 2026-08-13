import {
  getClientEventSource,
  readCurrentEmployeeCodeForLog,
  type ClientEventSource,
} from "./operator-log-context";
import { getAuditEventContext } from "./activity-audit-context";

export type ClientEvent =
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

const ALLOWED_EVENTS = new Set(["ui_login", "ui_logout", "ui_nav", "ui_action_cancel"]);

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
