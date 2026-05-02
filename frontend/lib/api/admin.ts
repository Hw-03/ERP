/**
 * Admin / Settings 도메인 API — `@/lib/api/admin`.
 *
 * Round-6 (R6-D3) 분리. 3 메소드:
 *   - verifyAdminPin / updateAdminPin / resetDatabase
 */

import { postJson, putJson, toApiUrl } from "../api-core";

export const adminApi = {
  verifyAdminPin: (pin: string) =>
    postJson<{ message: string }>(toApiUrl("/api/settings/verify-pin"), { pin }),

  resetDatabase: (pin: string) =>
    postJson<{ message: string }>(toApiUrl("/api/settings/reset"), { pin }),

  updateAdminPin: (payload: { current_pin: string; new_pin: string }) =>
    putJson<{ message: string }>(toApiUrl("/api/settings/admin-pin"), payload),
};
