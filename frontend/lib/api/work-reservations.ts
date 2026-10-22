import { fetcher, postJson, toApiUrl } from "./core";
import type {
  AdminWorkReservationCancelPayload,
  AdminWorkReservationDetail,
  AdminWorkReservationFilters,
  AdminWorkReservationList,
  InventoryWorkStatus,
} from "./types/work-reservations";

/** 공통 fetch 경계가 PIN·감사 세션을 전달한다. 관리자 PIN을 URL/본문에 넣지 않는다. */
export const workReservationsApi = {
  getItemWorkStatus: (itemId: string, opts?: { signal?: AbortSignal }): Promise<InventoryWorkStatus> =>
    fetcher<InventoryWorkStatus>(
      toApiUrl(`/api/inventory/work-status?${new URLSearchParams({ item_id: itemId })}`),
      opts?.signal,
    ),

  listAdmin: (params?: AdminWorkReservationFilters, opts?: { signal?: AbortSignal }): Promise<AdminWorkReservationList> => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) query.set(key, String(value));
    }
    const suffix = query.size ? `?${query}` : "";
    return fetcher<AdminWorkReservationList>(toApiUrl(`/api/admin/work-reservations${suffix}`), opts?.signal);
  },

  getAdminDetail: (batchId: string, opts?: { signal?: AbortSignal }): Promise<AdminWorkReservationDetail> =>
    fetcher<AdminWorkReservationDetail>(
      toApiUrl(`/api/admin/work-reservations/${encodeURIComponent(batchId)}`), opts?.signal,
    ),

  cancelAdmin: (batchId: string, payload: AdminWorkReservationCancelPayload): Promise<AdminWorkReservationDetail> =>
    postJson<AdminWorkReservationDetail>(
      toApiUrl(`/api/admin/work-reservations/${encodeURIComponent(batchId)}/cancel`), payload,
    ),
};
