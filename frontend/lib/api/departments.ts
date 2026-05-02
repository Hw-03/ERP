/**
 * Departments 도메인 API — `@/lib/api/departments`.
 *
 * Round-6 (R6-D9) 분리. 5 메소드 + getAppSession 1 (관련 헬퍼).
 */

import { fetcher, parseError, toApiUrl } from "../api-core";
import type { DepartmentMaster } from "./types";

export const departmentsApi = {
  getAppSession: (): Promise<{ boot_id: string; started_at: string }> =>
    fetcher(toApiUrl("/api/app-session")),

  getDepartments: (params?: { isActive?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.isActive !== undefined) query.set("is_active", String(params.isActive));
    return fetcher<DepartmentMaster[]>(toApiUrl(`/api/departments?${query}`));
  },

  createDepartment: async (payload: { name: string; display_order?: number; pin: string; color_hex?: string }) => {
    const res = await fetch(toApiUrl("/api/departments"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<DepartmentMaster>;
  },

  updateDepartment: async (id: number, payload: { name?: string; display_order?: number; is_active?: boolean; color_hex?: string | null; pin: string }) => {
    const res = await fetch(toApiUrl(`/api/departments/${id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<DepartmentMaster>;
  },

  deleteDepartment: async (id: number, pin: string) => {
    const res = await fetch(toApiUrl(`/api/departments/${id}?pin=${encodeURIComponent(pin)}`), { method: "DELETE" });
    if (!res.ok) throw new Error(await parseError(res));
  },

  reorderDepartments: async (payload: { items: { id: number; display_order: number }[]; pin: string }) => {
    const res = await fetch(toApiUrl("/api/departments/reorder"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<{ ok: boolean }>;
  },
};
