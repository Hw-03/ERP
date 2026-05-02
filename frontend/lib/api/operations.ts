/**
 * Operations 도메인 API — `@/lib/api/operations`.
 *
 * Round-6 (R6-D5) 분리. 운영 보조 영역 통합:
 *   - Scrap / Loss / Variance (5 메소드)
 *   - Alerts (3 메소드)
 *   - PhysicalCounts (2 메소드)
 *
 * 총 10 메소드.
 */

import { fetcher, postJson, toApiUrl } from "../api-core";
import type {
  AlertKind,
  LossLogRow,
  PhysicalCount,
  ScrapLogRow,
  StockAlert,
  VarianceLogRow,
} from "./types";

export const operationsApi = {
  // Scrap / Loss / Variance --------------------------------------------------
  recordScrap: (payload: {
    item_id: string;
    quantity: number;
    reason: string;
    process_stage?: string;
    operator?: string;
  }) => postJson<ScrapLogRow>(toApiUrl("/api/scrap/"), payload),

  listScrap: (params?: { itemId?: string; batchId?: string }) => {
    const query = new URLSearchParams();
    if (params?.itemId) query.set("item_id", params.itemId);
    if (params?.batchId) query.set("batch_id", params.batchId);
    return fetcher<ScrapLogRow[]>(toApiUrl(`/api/scrap/?${query}`));
  },

  recordLoss: (
    payload: { item_id: string; quantity: number; reason: string; operator?: string },
    deduct = false,
  ) => postJson<LossLogRow>(toApiUrl(`/api/loss/?deduct=${deduct}`), payload),

  listLoss: (params?: { itemId?: string; batchId?: string }) => {
    const query = new URLSearchParams();
    if (params?.itemId) query.set("item_id", params.itemId);
    if (params?.batchId) query.set("batch_id", params.batchId);
    return fetcher<LossLogRow[]>(toApiUrl(`/api/loss/?${query}`));
  },

  listVariance: (params?: { itemId?: string; batchId?: string }) => {
    const query = new URLSearchParams();
    if (params?.itemId) query.set("item_id", params.itemId);
    if (params?.batchId) query.set("batch_id", params.batchId);
    return fetcher<VarianceLogRow[]>(toApiUrl(`/api/variance/?${query}`));
  },

  // Alerts -------------------------------------------------------------------
  scanSafetyAlerts: () => postJson<StockAlert[]>(toApiUrl("/api/alerts/scan")),

  listAlerts: (params?: {
    kind?: AlertKind;
    includeAcknowledged?: boolean;
    itemId?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.kind) query.set("kind", params.kind);
    if (params?.includeAcknowledged !== undefined)
      query.set("include_acknowledged", String(params.includeAcknowledged));
    if (params?.itemId) query.set("item_id", params.itemId);
    return fetcher<StockAlert[]>(toApiUrl(`/api/alerts/?${query}`));
  },

  acknowledgeAlert: (alertId: string, acknowledgedBy?: string) =>
    postJson<StockAlert>(toApiUrl(`/api/alerts/${alertId}/acknowledge`), {
      acknowledged_by: acknowledgedBy ?? null,
    }),

  // Physical counts ---------------------------------------------------------
  submitPhysicalCount: (payload: {
    item_id: string;
    counted_qty: number;
    reason?: string;
    operator?: string;
  }) => postJson<PhysicalCount>(toApiUrl("/api/counts/"), payload),

  listPhysicalCounts: (itemId?: string) => {
    const query = new URLSearchParams();
    if (itemId) query.set("item_id", itemId);
    return fetcher<PhysicalCount[]>(toApiUrl(`/api/counts/?${query}`));
  },
};
