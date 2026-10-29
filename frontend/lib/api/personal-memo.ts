import { ApiError } from "../api-core";
import { restoreOperatorSession } from "../auth/operator-session";
import { requestOperatorLogin } from "../auth/login-recovery";
import { requestJson } from "./stocktake";

export interface PersonalMemo {
  content: string;
  updated_at: string | null;
}

/** Bind each callback to its editor owner before reading the current credential. */
function ownerToken(employeeId: string): string {
  const session = restoreOperatorSession();
  if (!session) {
    requestOperatorLogin();
    throw new ApiError("다시 로그인한 뒤 메모를 저장해 주세요.", 401, "OPERATOR_SESSION_INVALID");
  }
  if (session.employee_id !== employeeId) {
    throw new ApiError("로그인한 직원이 변경되었습니다.", 409, "OPERATOR_SESSION_CHANGED");
  }
  return session.token;
}

export const personalMemoApi = {
  async get(employeeId: string, signal?: AbortSignal): Promise<PersonalMemo> {
    return requestJson("/api/personal-memo", ownerToken(employeeId), { cache: "no-store", signal });
  },
  async save(employeeId: string, content: string): Promise<PersonalMemo> {
    return requestJson("/api/personal-memo", ownerToken(employeeId), {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }),
    });
  },
};
