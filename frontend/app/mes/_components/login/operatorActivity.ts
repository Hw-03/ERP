/** Tab-local idle state; employee preferences must never acknowledge a pending check. */
export const OPERATOR_ACTIVITY_KEY = "dexcowin_mes_operator_activity";
export const OPERATOR_IDLE_MS = 5 * 60 * 1000;

export interface OperatorActivity {
  employeeId: string;
  lastActivityAt: number;
  confirmationRequired: boolean;
}

/** Missing, mismatched, or malformed records require one explicit confirmation. */
export function readOperatorActivity(employeeId: string): OperatorActivity | null {
  try {
    const raw = window.sessionStorage.getItem(OPERATOR_ACTIVITY_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Partial<OperatorActivity>;
    if (record.employeeId !== employeeId
      || typeof record.lastActivityAt !== "number"
      || !Number.isFinite(record.lastActivityAt)
      || record.lastActivityAt < 0 || record.lastActivityAt > Date.now()
      || typeof record.confirmationRequired !== "boolean") return null;
    return record as OperatorActivity;
  } catch {
    return null;
  }
}

/** Shared by PIN login and explicit continuation; no login/audit event is created here. */
export function writeOperatorActivity(activity: OperatorActivity): void {
  window.sessionStorage.setItem(OPERATOR_ACTIVITY_KEY, JSON.stringify(activity));
}
