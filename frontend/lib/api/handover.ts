/**
 * 인수인계서 도메인 API — `@/lib/api/handover`.
 */

import { fetcher, postJson, toApiUrl } from "../api-core";
import type { Handover, HandoverCreatePayload, HandoverReceivePayload } from "./types";

export const handoverApi = {
  createHandover: (payload: HandoverCreatePayload) =>
    postJson<Handover>(toApiUrl("/api/handovers"), payload),

  listHandovers: (params: { authorEmployeeId?: string; toDepartment?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.authorEmployeeId) q.set("author_employee_id", params.authorEmployeeId);
    if (params.toDepartment) q.set("to_department", params.toDepartment);
    const s = q.toString();
    return fetcher<Handover[]>(toApiUrl(`/api/handovers${s ? `?${s}` : ""}`));
  },

  listHandoverInbox: (actorEmployeeId: string) =>
    fetcher<Handover[]>(
      toApiUrl(`/api/handovers/inbox?actor_employee_id=${encodeURIComponent(actorEmployeeId)}`),
    ),

  countHandoverInbox: (actorEmployeeId: string) =>
    fetcher<{ count: number }>(
      toApiUrl(
        `/api/handovers/inbox/count?actor_employee_id=${encodeURIComponent(actorEmployeeId)}`,
      ),
    ),

  receiveHandover: (handoverId: string, payload: HandoverReceivePayload) =>
    postJson<Handover>(
      toApiUrl(`/api/handovers/${encodeURIComponent(handoverId)}/receive`),
      payload,
    ),

  getHandover: (handoverId: string) =>
    fetcher<Handover>(toApiUrl(`/api/handovers/${encodeURIComponent(handoverId)}`)),
};
