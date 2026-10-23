import type { Query, QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-core";
import { restoreOperatorSession } from "@/lib/auth/operator-session";
import { OPERATOR_LOGIN_CHANGED } from "@/lib/auth/login-recovery";
import { getOperatorAccessContext } from "@/app/mes/_components/login/useCurrentOperator";

export const WORK_DRAFT_GC_TIME = 5 * 60_000;
export const isDraftAuthError = (error: unknown): boolean => error instanceof ApiError && (error.status === 401 || error.status === 403);

/** Scope the purge to saved work; unrelated stock requests retain their policy. */
function savedWork(query: Query): boolean {
  return query.queryKey[0] === "stockRequests" && ["workDrafts", "drafts"].includes(String(query.queryKey[1]));
}

function identity(): string {
  const session = restoreOperatorSession();
  return JSON.stringify([getOperatorAccessContext(), session?.employee_id, session?.token]);
}

/** This observer lives with QueryProvider, including while all work screens are closed. */
export function installWorkDraftCacheGuard(client: QueryClient, readIdentity: () => string = identity): () => void {
  let previous = readIdentity();
  const clear = (): void => {
    void client.cancelQueries({ predicate: savedWork });
    client.removeQueries({ predicate: savedWork });
  };
  const changed = (): void => {
    const next = readIdentity();
    if (next !== previous) { previous = next; clear(); }
    else void client.invalidateQueries({ predicate: savedWork });
  };
  window.addEventListener(OPERATOR_LOGIN_CHANGED, changed);
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "error" || !savedWork(event.query) || !isDraftAuthError(event.query.state.error)) return;
    // Keep active observers in an error state: removing them would immediately
    // create another enabled query and retry an expired credential indefinitely.
    const error = event.query.state.error;
    void client.cancelQueries({ predicate: savedWork });
    for (const query of client.getQueryCache().findAll({ predicate: savedWork })) {
      if (query.getObserversCount() === 0) client.getQueryCache().remove(query);
      else query.setState({ data: undefined, dataUpdatedAt: 0, error, status: "error", fetchStatus: "idle" });
    }
  });
  return () => { unsubscribe(); window.removeEventListener(OPERATOR_LOGIN_CHANGED, changed); };
}
