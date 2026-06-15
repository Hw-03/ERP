/**
 * 인수인계서 도메인 API — `@/lib/api/handover`.
 */

import { deleteJson, fetcher, postJson, putJson, toApiUrl } from "../api-core";
import type {
  Handover,
  HandoverCreatePayload,
  HandoverDraftPayload,
  HandoverReceivePayload,
  HandoverSubmitPayload,
} from "./types";

export const handoverApi = {
  createHandover: (payload: HandoverCreatePayload) =>
    postJson<Handover>(toApiUrl("/api/handovers"), payload),

  /** 임시저장 — handover_id 없으면 신규 draft, 있으면 기존 draft 갱신. */
  saveHandoverDraft: (payload: HandoverDraftPayload) =>
    putJson<Handover>(toApiUrl("/api/handovers/draft"), payload),

  /** 임시저장(draft) → 제출(submitted). */
  submitHandover: (handoverId: string, payload: HandoverSubmitPayload) =>
    postJson<Handover>(
      toApiUrl(`/api/handovers/${encodeURIComponent(handoverId)}/submit`),
      payload,
    ),

  /** 임시저장 폐기 — 본인 draft 만. */
  deleteHandoverDraft: (handoverId: string, authorEmployeeId: string) =>
    deleteJson<void>(
      toApiUrl(
        `/api/handovers/draft/${encodeURIComponent(handoverId)}?author_employee_id=${encodeURIComponent(authorEmployeeId)}`,
      ),
    ),

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
