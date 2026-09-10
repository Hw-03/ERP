/**
 * Departments 도메인 API — `@/lib/api/departments`.
 *
 * Round-6 (R6-D9) 분리. 5 메소드 + getAppSession 1 (관련 헬퍼).
 */

import { deleteJson, fetcher, patchJson, postJson, putJson, toApiUrl } from "../api-core";
import type { components } from "./generated/openapi";
import type { DepartmentMaster } from "./types";

export type DepartmentCreatePayload = components["schemas"]["DepartmentCreate"];
export type DepartmentUpdatePayload = components["schemas"]["DepartmentUpdate"];

export const departmentsApi = {
  getAppSession: (signal?: AbortSignal): Promise<{ boot_id: string; started_at: string }> =>
    fetcher(toApiUrl("/api/app-session"), signal),

  getDepartments: (params?: { isActive?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.isActive !== undefined) query.set("is_active", String(params.isActive));
    return fetcher<DepartmentMaster[]>(toApiUrl(`/api/departments?${query}`));
  },

  createDepartment: (payload: DepartmentCreatePayload) =>
    postJson<DepartmentMaster>(toApiUrl("/api/departments"), payload),

  updateDepartment: (
    id: number,
    payload: DepartmentUpdatePayload,
  ) => putJson<DepartmentMaster>(toApiUrl(`/api/departments/${id}`), payload),

  deleteDepartment: (id: number, pin: string) =>
    deleteJson<void>(toApiUrl(`/api/departments/${id}`), { pin }),

  reorderDepartments: (payload: {
    items: { id: number; display_order: number }[];
    pin: string;
  }) => patchJson<{ ok: boolean }>(toApiUrl("/api/departments/reorder"), payload),
};
