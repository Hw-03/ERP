"use client";

/**
 * Settings / Admin 도메인 React Query hook — W7-7.
 *
 * adminApi 기반. verifyPin / updatePin / resetDatabase / auditCsv 묶음.
 * 인터페이스 ≤ 6: useAuditCsvListQuery + useVerifyPinMutation +
 *   useUpdatePinMutation + useResetDatabaseMutation + useTriggerAuditBackfillMutation
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import { queryKeys } from "./keys";

/** 감사 CSV 파일 목록 조회 */
export function useAuditCsvListQuery() {
  return useQuery({
    queryKey: queryKeys.settings.auditCsvList(),
    queryFn: () => adminApi.listAuditCsvFiles(),
  });
}

/** PIN 검증 (mutation — side-effect 없음, 로컬 state 갱신용) */
export function useVerifyPinMutation() {
  return useMutation({
    mutationFn: (pin: string) => adminApi.verifyAdminPin(pin),
  });
}

/** PIN 변경 */
export function useUpdatePinMutation() {
  return useMutation({
    mutationFn: (payload: { current_pin: string; new_pin: string }) =>
      adminApi.updateAdminPin(payload),
  });
}

/** DB 초기화 */
export function useResetDatabaseMutation() {
  return useMutation({
    mutationFn: (pin: string) => adminApi.resetDatabase(pin),
  });
}

/** 감사 CSV 백필 트리거 */
export function useTriggerAuditBackfillMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => adminApi.triggerAuditCsvBackfill(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.settings.all }),
  });
}
