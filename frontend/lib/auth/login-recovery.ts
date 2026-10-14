/** Shared login recovery; an expired credential never creates a second PIN form. */
export const OPERATOR_LOGIN_REQUIRED = "dexcowin_operator_login_required";
export const OPERATOR_LOGIN_CHANGED = "dexcowin_operator_change";

/** Ask the MES login gate to recover without unmounting the current draft. */
export function requestOperatorLogin(rejectedToken?: string): void {
  if (typeof window === "undefined") return;
  if (rejectedToken) {
    try {
      const stored = JSON.parse(window.sessionStorage.getItem("dexcowin_mes_operator_session") ?? "null") as { token?: string } | null;
      if (stored?.token && stored.token !== rejectedToken) return;
    } catch { /* Invalid storage still requires a normal login. */ }
  }
  window.dispatchEvent(new Event(OPERATOR_LOGIN_REQUIRED));
}
