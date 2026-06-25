"use client";

/**
 * Admin 도메인 React Query hook — W7-10.
 *
 * adminApi 기반. PIN 인증·PIN 변경·DB 초기화·감사 CSV 묶음.
 * settings 도메인(W7-7)과 같은 API를 사용하되 admin-gate 진입 전용 hook.
 * 인터페이스 ≤ 6:
 *   useAuditCsvFilesQuery / useVerifyAdminPinMutation /
 *   useUpdateAdminPinMutation /
 *   useTriggerAuditCsvBackfillMutation
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import { queryKeys } from "./keys";

/** 감사 CSV 파일 목록 */
export function useAuditCsvFilesQuery() {
  return useQuery({
    queryKey: queryKeys.admin.auditCsvList(),
    queryFn: () => adminApi.listAuditCsvFiles(),
  });
}

/** 관리자 PIN 검증 */
export function useVerifyAdminPinMutation() {
  return useMutation({
    mutationFn: (pin: string) => adminApi.verifyAdminPin(pin),
  });
}

/** 관리자 PIN 변경 */
export function useUpdateAdminPinMutation() {
  return useMutation({
    mutationFn: (payload: { current_pin: string; new_pin: string }) =>
      adminApi.updateAdminPin(payload),
  });
}

/** DB 초기화 */
/** 감사 CSV 백필 트리거 */
export function useTriggerAuditCsvBackfillMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => adminApi.triggerAuditCsvBackfill(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.admin.all }),
  });
}
