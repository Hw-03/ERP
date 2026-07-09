import {
  getClientEventSource,
  readCurrentEmployeeCodeForLog,
  type ClientEventSource,
} from "./operator-log-context";

export type ClientEvent =
  | { event: "ui_login"; source?: ClientEventSource }
  | { event: "ui_logout"; source?: ClientEventSource }
  | {
      event: "ui_nav";
      from?: string;
      to?: string;
      path?: string;
      source?: ClientEventSource;
    };

const ALLOWED_EVENTS = new Set(["ui_login", "ui_logout", "ui_nav"]);

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
    }).catch(() => {});
  } catch {
    // Client event logging must never block the MES screen flow.
  }
}
