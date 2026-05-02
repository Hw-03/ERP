/**
 * Admin / Settings 도메인 API — `@/lib/api/admin`.
 *
 * Round-6 (R6-D3) 분리. 3 메소드:
 *   - verifyAdminPin / updateAdminPin / resetDatabase
 */

import { parseError, toApiUrl } from "../api-core";

export const adminApi = {
  verifyAdminPin: async (pin: string) => {
    const res = await fetch(toApiUrl("/api/settings/verify-pin"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<{ message: string }>;
  },

  resetDatabase: async (pin: string) => {
    const res = await fetch(toApiUrl("/api/settings/reset"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<{ message: string }>;
  },

  updateAdminPin: async (payload: { current_pin: string; new_pin: string }) => {
    const res = await fetch(toApiUrl("/api/settings/admin-pin"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<{ message: string }>;
  },
};
