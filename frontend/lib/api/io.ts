import { deleteJson, fetcher, postJson, putJson, toApiUrl } from "../api-core";
import type {
  ItemConversionPayload,
  ItemConversionPreview,
  ItemConversionResult,
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

  getItemConversionPreview: (
    params: Omit<ItemConversionPayload, "memo">,
    opts?: { signal?: AbortSignal },
  ) => {
    const qs = new URLSearchParams();
    qs.set("source_item_id", params.source_item_id);
    qs.set("target_item_id", params.target_item_id);
    qs.set("quantity", String(params.quantity));
    if (params.requested_mode) qs.set("requested_mode", params.requested_mode);
    return fetcher<ItemConversionPreview>(
      toApiUrl(`/api/io/item-conversion-preview?${qs.toString()}`),
      opts?.signal,
    );
  },

  executeItemConversion: (payload: ItemConversionPayload) =>
    postJson<ItemConversionResult>(toApiUrl("/api/io/item-conversion"), payload),

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

  submitDraft: (batchId: string, employeeId: string) =>
    postJson<IoSubmitResponse>(
      toApiUrl(
        `/api/io/draft/${encodeURIComponent(batchId)}/submit?requester_employee_id=${encodeURIComponent(employeeId)}`,
      ),
      {},
    ),

  getBatch: (batchId: string, opts?: { signal?: AbortSignal }) =>
    fetcher<IoBatch>(
      toApiUrl(`/api/io/${encodeURIComponent(batchId)}`),
      opts?.signal,
    ),
};
