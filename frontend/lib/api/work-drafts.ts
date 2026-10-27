import { ApiError } from "../api-core";
import { requestOperatorLogin } from "../auth/login-recovery";
import { restoreOperatorSession, validateTabOwnership } from "../auth/operator-session";
import { requestJson } from "./stocktake";
import type { WorkDraftCount, WorkDraftDetail, WorkDraftFilters, WorkDraftList, WorkDraftSelection } from "./types/work-drafts";
import type { IoBatch } from "./types/io";

/** 새 문서의 탭 소유권 확인을 마친 뒤 같은 직원의 인증으로만 조회한다. */
async function operatorToken(employeeId: string): Promise<string> {
  let session = restoreOperatorSession();
  if (!session) {
    await validateTabOwnership();
    session = restoreOperatorSession();
  }
  if (session?.employee_id === employeeId) return session.token;
  if (!session) requestOperatorLogin();
  throw new ApiError("작업자 인증을 다시 진행해 주세요.", 401, "OPERATOR_SESSION_INVALID");
}

export const workDraftsApi = {
  async count(employeeId: string, options?: { signal?: AbortSignal }): Promise<WorkDraftCount> {
    return requestJson("/api/work-drafts/count", await operatorToken(employeeId), { signal: options?.signal, cache: "no-store" });
  },
  async getOwnedIo(employeeId: string, batchId: string, options?: { signal?: AbortSignal }): Promise<IoBatch> {
    return requestJson(`/api/work-drafts/owned-io/${encodeURIComponent(batchId)}`, await operatorToken(employeeId), { signal: options?.signal, cache: "no-store" });
  },
  async list(employeeId: string, filters: WorkDraftFilters, options?: { signal?: AbortSignal }): Promise<WorkDraftList> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) query.set(key, String(value));
    }
    const suffix = query.size ? `?${query}` : "";
    return requestJson(`/api/work-drafts${suffix}`, await operatorToken(employeeId), { signal: options?.signal, cache: "no-store" });
  },
  async getDetail(employeeId: string, selection: WorkDraftSelection, options?: { signal?: AbortSignal }): Promise<WorkDraftDetail> {
    return requestJson(`/api/work-drafts/${selection.kind}/${encodeURIComponent(selection.id)}`, await operatorToken(employeeId), {
      signal: options?.signal, cache: "no-store",
    });
  },
};
