"use client";

/**
 * Employees 도메인 React Query hook — W7-2.
 *
 * 1 query + 4 mutation. mutation 성공 시 `queryKeys.employees.all` invalidate.
 *
 * useModelsQuery.ts 패턴을 그대로 따른다.
 * Pin 관련 (verify/reset/change) 은 캐시 무효화 불필요하므로 별도 mutation 으로
 * 노출하되 invalidate 없이 통과시킨다.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { employeesApi } from "@/lib/api/employees";
import { STALE_TIME } from "./client";
import { queryKeys } from "./keys";

export function useEmployeesQuery(params?: Parameters<typeof employeesApi.getEmployees>[0]) {
  return useQuery({
    queryKey: queryKeys.employees.list(
      params
        ? { department: params.department, activeOnly: params.activeOnly }
        : undefined,
    ),
    queryFn: () => employeesApi.getEmployees(params),
    // 마스터 데이터: 변경이 드물어 재요청을 더 아낀다 (R2-1).
    staleTime: STALE_TIME.MASTER,
  });
}

export function useCreateEmployeeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof employeesApi.createEmployee>[0]) =>
      employeesApi.createEmployee(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.employees.all }),
  });
}

export function useUpdateEmployeeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      employeeId,
      payload,
    }: {
      employeeId: string;
      payload: Parameters<typeof employeesApi.updateEmployee>[1];
    }) => employeesApi.updateEmployee(employeeId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.employees.all }),
  });
}

export function useDeleteEmployeeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (employeeId: string) => employeesApi.deleteEmployee(employeeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.employees.all }),
  });
}

export function useResetEmployeePinMutation() {
  return useMutation({
    mutationFn: ({ employeeId, adminPin }: { employeeId: string; adminPin: string }) =>
      employeesApi.resetEmployeePin(employeeId, adminPin),
  });
}
