import {
  deleteJson,
  deleteJsonWithoutAuthBoundary,
  fetcher,
  fetcherWithAuthBoundaryReason,
  fetcherWithoutAuthBoundary,
  postJsonWithoutAuthBoundary,
  toApiUrl,
  type AuthRequiredReason,
} from "../api-core";
import type { OperatorSessionResponse } from "./types/operator-session";

let logoutInFlight: Promise<void> | null = null;

function stampSessionReceipt(session: OperatorSessionResponse): OperatorSessionResponse {
  return { ...session, client_received_at_ms: Date.now() };
}

async function waitForLogoutBoundary(): Promise<void> {
  if (!logoutInFlight) return;
  try {
    await logoutInFlight;
  } catch {
    // 서버 revoke 실패도 다음 명시 로그인 시도 자체를 영구 차단하지 않는다.
  }
}

async function createOperatorSession(
  employeeId: string,
  pin: string,
): Promise<OperatorSessionResponse> {
  await waitForLogoutBoundary();
  return postJsonWithoutAuthBoundary<OperatorSessionResponse>(
    toApiUrl("/api/operator-session"),
    { employee_id: employeeId, pin },
  ).then(stampSessionReceipt);
}

function deleteOperatorSession(employeeCode?: string): Promise<void> {
  if (logoutInFlight) return logoutInFlight;
  const headers = employeeCode
    ? { "X-MES-Employee-Code": employeeCode }
    : undefined;
  const tracked = deleteJson<void>(
    toApiUrl("/api/operator-session"),
    undefined,
    undefined,
    headers,
  ).finally(() => {
    if (logoutInFlight === tracked) logoutInFlight = null;
  });
  logoutInFlight = tracked;
  return tracked;
}

async function cancelPinChangeChallenge(employeeId: string): Promise<void> {
  await waitForLogoutBoundary();
    return deleteJsonWithoutAuthBoundary<void>(
      `${toApiUrl("/api/operator-session")}?pin_change_employee_id=${encodeURIComponent(employeeId)}`,
    );
}

export const operatorSessionApi = {
  createOperatorSession,

  getOperatorSession: (
    signal?: AbortSignal,
    authRequiredReason: AuthRequiredReason = "server",
  ) => authRequiredReason === "server"
    ? fetcher<OperatorSessionResponse>(toApiUrl("/api/operator-session"), signal)
        .then(stampSessionReceipt)
    : fetcherWithAuthBoundaryReason<OperatorSessionResponse>(
        toApiUrl("/api/operator-session"),
        signal,
        authRequiredReason,
      ).then(stampSessionReceipt),

  getOperatorSessionForIdleCheck: (signal?: AbortSignal) =>
    fetcherWithoutAuthBoundary<OperatorSessionResponse>(
      toApiUrl("/api/operator-session"),
      signal,
    ).then(stampSessionReceipt),

  renewOperatorSession: (signal?: AbortSignal) =>
    postJsonWithoutAuthBoundary<OperatorSessionResponse>(
      toApiUrl("/api/operator-session/activity"),
      undefined,
      signal,
    ).then(stampSessionReceipt),

  completeOperatorPinChange: (employeeId: string, newPin: string) =>
    postJsonWithoutAuthBoundary<void>(toApiUrl("/api/operator-session/complete-pin-change"), {
      employee_id: employeeId,
      new_pin: newPin,
    }),

  cancelPinChangeChallenge,
  deleteOperatorSession,
};
