/**
 * Queue 도메인 API — `@/lib/api/queue`.
 *
 * Round-6 (R6-D4) 분리. 9 메소드 (queue batch 흐름).
 */

import { fetcher, parseError, toApiUrl } from "../api-core";
import type {
  QueueBatch,
  QueueBatchStatus,
  QueueBatchType,
  QueueLineDirection,
} from "./types";

export const queueApi = {
  createQueueBatch: async (payload: {
    batch_type: QueueBatchType;
    parent_item_id?: string;
    parent_quantity?: number;
    owner_employee_id?: string;
    owner_name?: string;
    reference_no?: string;
    notes?: string;
    load_bom?: boolean;
  }) => {
    const res = await fetch(toApiUrl("/api/queue"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<QueueBatch>;
  },

  listQueueBatches: (params?: { status?: QueueBatchStatus; ownerEmployeeId?: string }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.ownerEmployeeId) query.set("owner_employee_id", params.ownerEmployeeId);
    return fetcher<QueueBatch[]>(toApiUrl(`/api/queue/?${query}`));
  },

  getQueueBatch: (batchId: string) => fetcher<QueueBatch>(toApiUrl(`/api/queue/${batchId}`)),

  overrideQueueLine: async (batchId: string, lineId: string, quantity: number) => {
    const res = await fetch(toApiUrl(`/api/queue/${batchId}/lines/${lineId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<QueueBatch>;
  },

  toggleQueueLine: async (
    batchId: string,
    lineId: string,
    payload: { included: boolean; new_direction?: QueueLineDirection },
  ) => {
    const res = await fetch(toApiUrl(`/api/queue/${batchId}/lines/${lineId}/toggle`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<QueueBatch>;
  },

  addQueueLine: async (
    batchId: string,
    payload: {
      item_id: string;
      direction: QueueLineDirection;
      quantity: number;
      reason?: string;
      process_stage?: string;
    },
  ) => {
    const res = await fetch(toApiUrl(`/api/queue/${batchId}/lines`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<QueueBatch>;
  },

  deleteQueueLine: async (batchId: string, lineId: string) => {
    const res = await fetch(toApiUrl(`/api/queue/${batchId}/lines/${lineId}`), {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<QueueBatch>;
  },

  confirmQueueBatch: async (batchId: string) => {
    const res = await fetch(toApiUrl(`/api/queue/${batchId}/confirm`), { method: "POST" });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<QueueBatch>;
  },

  cancelQueueBatch: async (batchId: string) => {
    const res = await fetch(toApiUrl(`/api/queue/${batchId}/cancel`), { method: "POST" });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<QueueBatch>;
  },
};
