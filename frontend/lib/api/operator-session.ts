import { deleteJson, fetcher, postJson, toApiUrl } from "../api-core";
import type { OperatorSessionResponse } from "./types/operator-session";

let logoutInFlight: Promise<void> | null = null;

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
  return postJson<OperatorSessionResponse>(toApiUrl("/api/operator-session"), {
    employee_id: employeeId,
    pin,
  });
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
  return deleteJson<void>(
    `${toApiUrl("/api/operator-session")}?pin_change_employee_id=${encodeURIComponent(employeeId)}`,
  );
}

export const operatorSessionApi = {
  createOperatorSession,

  getOperatorSession: () =>
    fetcher<OperatorSessionResponse>(toApiUrl("/api/operator-session")),

  completeOperatorPinChange: (employeeId: string, newPin: string) =>
    postJson<void>(toApiUrl("/api/operator-session/complete-pin-change"), {
      employee_id: employeeId,
      new_pin: newPin,
    }),

  cancelPinChangeChallenge,
  deleteOperatorSession,
};
