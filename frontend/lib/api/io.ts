import { deleteJson, fetcher, patchJson, postJson, putJson, toApiUrl } from "../api-core";
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
  Supplier,
} from "./types";

export const ioApi = {
  listSuppliers: (employeeId: string, includeInactive = false) => {
    const query = new URLSearchParams({
      requester_employee_id: employeeId,
      include_inactive: String(includeInactive),
    });
    return fetcher<Supplier[]>(toApiUrl(`/api/suppliers?${query.toString()}`));
  },

  createSupplier: (employeeId: string, name: string) =>
    postJson<Supplier>(toApiUrl("/api/suppliers"), {
      requester_employee_id: employeeId,
      name,
    }),

  updateSupplier: (
    supplierId: string,
    employeeId: string,
    update: { name?: string; is_active?: boolean },
  ) =>
    patchJson<Supplier>(
      toApiUrl(`/api/suppliers/${encodeURIComponent(supplierId)}`),
      { requester_employee_id: employeeId, ...update },
    ),

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
    qs.set("requester_employee_id", params.requester_employee_id);
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
