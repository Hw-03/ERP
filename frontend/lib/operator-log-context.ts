export const OPERATOR_STORAGE_KEY = "dexcowin_mes_operator";

export type ClientEventSource = "desktop" | "mobile";

export function readCurrentEmployeeCodeForLog(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(OPERATOR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { employee_code?: unknown };
    const code = typeof parsed.employee_code === "string" ? parsed.employee_code.trim() : "";
    return code || null;
  } catch {
    return null;
  }
}

export function getClientEventSource(): ClientEventSource {
  if (typeof window === "undefined") return "desktop";
  return window.matchMedia?.("(max-width: 1023px)").matches ? "mobile" : "desktop";
}
