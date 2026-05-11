import { deleteJson, fetcher, postJson, putJson, toApiUrl } from "../api-core";
import type {
  IoBatch,
  IoDraftPayload,
  IoPreviewPayload,
  IoPreviewResponse,
  IoSubmitResponse,
  IoWorkType,
} from "./types";

export const ioApi = {
  preview: (payload: IoPreviewPayload) =>
    postJson<IoPreviewResponse>(toApiUrl("/api/io/preview"), payload),

  saveDraft: (payload: IoDraftPayload) =>
    putJson<IoBatch>(toApiUrl("/api/io/draft"), payload),

  getDraft: (employeeId: string, workType: IoWorkType, subType?: string) => {
    const query = new URLSearchParams({
      requester_employee_id: employeeId,
      work_type: workType,
    });
    if (subType) query.set("sub_type", subType);
    return fetcher<IoBatch | null>(toApiUrl(`/api/io/draft?${query.toString()}`));
  },

  listDrafts: (employeeId: string) =>
    fetcher<IoBatch[]>(
      toApiUrl(`/api/io/drafts?requester_employee_id=${encodeURIComponent(employeeId)}`),
    ),

  deleteDraft: (batchId: string, employeeId: string) =>
    deleteJson<void>(
      toApiUrl(
        `/api/io/draft/${batchId}?requester_employee_id=${encodeURIComponent(employeeId)}`,
      ),
    ),

  submit: (payload: IoDraftPayload) =>
    postJson<IoSubmitResponse>(toApiUrl("/api/io/submit"), payload),

  getBatch: (batchId: string) =>
    fetcher<IoBatch>(toApiUrl(`/api/io/${encodeURIComponent(batchId)}`)),
};
