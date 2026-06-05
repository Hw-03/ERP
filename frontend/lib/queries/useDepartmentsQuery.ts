"use client";

/**
 * Departments 도메인 React Query hook — W7-1.
 *
 * 1 query + 4 mutation. mutation 성공 시 `queryKeys.departments.all` invalidate.
 *
 * useModelsQuery.ts 패턴을 그대로 따른다.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { departmentsApi } from "@/lib/api/departments";
import { STALE_TIME } from "./client";
import { queryKeys } from "./keys";

export function useDepartmentsQuery(params?: { isActive?: boolean }) {
  return useQuery({
    queryKey: queryKeys.departments.list(params),
    queryFn: () => departmentsApi.getDepartments(params),
    // 마스터 데이터: 변경이 드물어 재요청을 더 아낀다 (R2-1).
    staleTime: STALE_TIME.MASTER,
  });
}

export function useCreateDepartmentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof departmentsApi.createDepartment>[0]) =>
      departmentsApi.createDepartment(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.departments.all }),
  });
}

export function useUpdateDepartmentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: Parameters<typeof departmentsApi.updateDepartment>[1];
    }) => departmentsApi.updateDepartment(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.departments.all }),
  });
}

export function useDeleteDepartmentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pin }: { id: number; pin: string }) =>
      departmentsApi.deleteDepartment(id, pin),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.departments.all }),
  });
}

export function useReorderDepartmentsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof departmentsApi.reorderDepartments>[0]) =>
      departmentsApi.reorderDepartments(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.departments.all }),
  });
}
