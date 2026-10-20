import type { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-core";
import { queryKeys } from "./keys";

/** 예약 변경 후 같은 세션의 재고·작업·관리자 조회를 함께 만료시킨다. */
export async function invalidateWorkReservationQueries(client: QueryClient, options?: { throwOnError?: boolean }): Promise<void> {
  if (options?.throwOnError) await client.cancelQueries({ queryKey: queryKeys.items.all });
  await Promise.all([
    queryKeys.items.all,
    queryKeys.inventory.all,
    queryKeys.stockRequests.all,
    queryKeys.admin.workReservationsAll,
  ].map((queryKey) => client.invalidateQueries({ queryKey }, options)));
}

/** 충돌·부족은 최신 상태를 조회하며, 확정된 실패도 성공과 같이 갱신한다. */
export function shouldRefreshWorkReservations(error: unknown): boolean {
  return error instanceof ApiError && (
    error.status === 409 || error.status === 422 || error.extra?.state_committed === true
  );
}
