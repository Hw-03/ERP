/**
 * Queue 도메인 API — `@/lib/api/queue`.
 *
 * Round-6 (R6-D4) 분리. 9 메소드 (queue batch 흐름).
 */

import { deleteJson, fetcher, postJson, putJson, toApiUrl } from "../api-core";
import type {
  QueueBatch,
  QueueBatchStatus,
  QueueBatchType,
  QueueLineDirection,
} from "./types";

export const queueApi = {
  createQueueBatch: (payload: {
    batch_type: QueueBatchType;
    parent_item_id?: string;
    parent_quantity?: number;
    owner_employee_id?: string;
    owner_name?: string;
    reference_no?: string;
    notes?: string;
    load_bom?: boolean;
  }) => postJson<QueueBatch>(toApiUrl("/api/queue"), payload),

  listQueueBatches: (params?: { status?: QueueBatchStatus; ownerEmployeeId?: string }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.ownerEmployeeId) query.set("owner_employee_id", params.ownerEmployeeId);
    return fetcher<QueueBatch[]>(toApiUrl(`/api/queue/?${query}`));
  },

  getQueueBatch: (batchId: string) => fetcher<QueueBatch>(toApiUrl(`/api/queue/${batchId}`)),

  overrideQueueLine: (batchId: string, lineId: string, quantity: number) =>
    putJson<QueueBatch>(toApiUrl(`/api/queue/${batchId}/lines/${lineId}`), { quantity }),

  toggleQueueLine: (
    batchId: string,
    lineId: string,
    payload: { included: boolean; new_direction?: QueueLineDirection },
  ) => postJson<QueueBatch>(toApiUrl(`/api/queue/${batchId}/lines/${lineId}/toggle`), payload),

  addQueueLine: (
    batchId: string,
    payload: {
      item_id: string;
      direction: QueueLineDirection;
      quantity: number;
      reason?: string;
      process_stage?: string;
    },
  ) => postJson<QueueBatch>(toApiUrl(`/api/queue/${batchId}/lines`), payload),

  deleteQueueLine: (batchId: string, lineId: string) =>
    deleteJson<QueueBatch>(toApiUrl(`/api/queue/${batchId}/lines/${lineId}`)),

  confirmQueueBatch: (batchId: string) =>
    postJson<QueueBatch>(toApiUrl(`/api/queue/${batchId}/confirm`)),

  cancelQueueBatch: (batchId: string) =>
    postJson<QueueBatch>(toApiUrl(`/api/queue/${batchId}/cancel`)),
};
