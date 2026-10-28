import type { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-core";
import { queryKeys } from "./keys";

/** 변경 전에 시작한 최초 응답도 취소하여 예약 변경 후 다시 조회한다. */
export async function cancelWorkInventoryQueries(client: QueryClient, options?: { skipItems?: boolean }): Promise<void> {
  await Promise.all([
    ...(options?.skipItems ? [] : [client.cancelQueries({ queryKey: queryKeys.items.all })]),
    client.cancelQueries({ queryKey: queryKeys.inventory.workStatusAll }),
  ]);
}

/** 예약 변경 후 같은 세션의 재고·작업·관리자 조회를 함께 만료시킨다. */
export async function invalidateWorkReservationQueries(client: QueryClient, options?: { throwOnError?: boolean }): Promise<void> {
  await cancelWorkInventoryQueries(client);
  await Promise.all([
    queryKeys.items.all,
    queryKeys.inventory.all,
    queryKeys.stockRequests.all,
    queryKeys.admin.workReservationsAll,
  ].map((queryKey) => options === undefined
    ? client.invalidateQueries({ queryKey })
    : client.invalidateQueries({ queryKey }, options)));
}

/** 충돌·부족은 최신 상태를 조회하며, 확정된 실패도 성공과 같이 갱신한다. */
export function shouldRefreshWorkReservations(error: unknown): boolean {
  return error instanceof ApiError && (
    error.status === 409 || error.status === 422 || error.extra?.state_committed === true
  );
}
