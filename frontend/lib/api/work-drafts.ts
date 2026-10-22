import { ApiError } from "../api-core";
import { requestOperatorLogin } from "../auth/login-recovery";
import { restoreOperatorSession } from "../auth/operator-session";
import { requestJson } from "./stocktake";
import type { WorkDraftDetail, WorkDraftFilters, WorkDraftList, WorkDraftSelection } from "./types/work-drafts";

/** 화면의 직원과 현재 탭의 세션이 같을 때만 전체 저장 작업을 조회한다. */
function operatorToken(employeeId: string): string {
  const session = restoreOperatorSession();
  if (session?.employee_id === employeeId) return session.token;
  if (!session) requestOperatorLogin();
  throw new ApiError("작업자 인증을 다시 진행해 주세요.", 401, "OPERATOR_SESSION_INVALID");
}

export const workDraftsApi = {
  async list(employeeId: string, filters: WorkDraftFilters, options?: { signal?: AbortSignal }): Promise<WorkDraftList> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) query.set(key, String(value));
    }
    const suffix = query.size ? `?${query}` : "";
    return requestJson(`/api/work-drafts${suffix}`, operatorToken(employeeId), { signal: options?.signal, cache: "no-store" });
  },
  async getDetail(employeeId: string, selection: WorkDraftSelection, options?: { signal?: AbortSignal }): Promise<WorkDraftDetail> {
    return requestJson(`/api/work-drafts/${selection.kind}/${encodeURIComponent(selection.id)}`, operatorToken(employeeId), {
      signal: options?.signal, cache: "no-store",
    });
  },
};
