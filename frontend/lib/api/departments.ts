/**
 * Departments 도메인 API — `@/lib/api/departments`.
 *
 * Round-6 (R6-D9) 분리. 5 메소드 + getAppSession 1 (관련 헬퍼).
 */

import { deleteJson, fetcher, patchJson, postJson, putJson, toApiUrl } from "../api-core";
import type { DepartmentMaster } from "./types";

export const departmentsApi = {
  getAppSession: (): Promise<{ boot_id: string; started_at: string }> =>
    fetcher(toApiUrl("/api/app-session")),

  getDepartments: (params?: { isActive?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.isActive !== undefined) query.set("is_active", String(params.isActive));
    return fetcher<DepartmentMaster[]>(toApiUrl(`/api/departments?${query}`));
  },

  createDepartment: (payload: {
    name: string;
    display_order?: number;
    pin: string;
    color_hex?: string;
  }) => postJson<DepartmentMaster>(toApiUrl("/api/departments"), payload),

  updateDepartment: (
    id: number,
    payload: {
      name?: string;
      display_order?: number;
      is_active?: boolean;
      color_hex?: string | null;
      pin: string;
    },
  ) => putJson<DepartmentMaster>(toApiUrl(`/api/departments/${id}`), payload),

  deleteDepartment: (id: number, pin: string) =>
    deleteJson<void>(toApiUrl(`/api/departments/${id}?pin=${encodeURIComponent(pin)}`)),

  reorderDepartments: (payload: {
    items: { id: number; display_order: number }[];
    pin: string;
  }) => patchJson<{ ok: boolean }>(toApiUrl("/api/departments/reorder"), payload),
};
