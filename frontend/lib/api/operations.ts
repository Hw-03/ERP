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

import { fetcher, parseError, toApiUrl } from "../api-core";
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
  recordScrap: async (payload: {
    item_id: string;
    quantity: number;
    reason: string;
    process_stage?: string;
    operator?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/scrap/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ScrapLogRow>;
  },

  listScrap: (params?: { itemId?: string; batchId?: string }) => {
    const query = new URLSearchParams();
    if (params?.itemId) query.set("item_id", params.itemId);
    if (params?.batchId) query.set("batch_id", params.batchId);
    return fetcher<ScrapLogRow[]>(toApiUrl(`/api/scrap/?${query}`));
  },

  recordLoss: async (
    payload: { item_id: string; quantity: number; reason: string; operator?: string },
    deduct = false,
  ) => {
    const res = await fetch(toApiUrl(`/api/loss/?deduct=${deduct}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<LossLogRow>;
  },

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
  scanSafetyAlerts: async () => {
    const res = await fetch(toApiUrl("/api/alerts/scan"), { method: "POST" });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<StockAlert[]>;
  },

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

  acknowledgeAlert: async (alertId: string, acknowledgedBy?: string) => {
    const res = await fetch(toApiUrl(`/api/alerts/${alertId}/acknowledge`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledged_by: acknowledgedBy ?? null }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<StockAlert>;
  },

  // Physical counts ---------------------------------------------------------
  submitPhysicalCount: async (payload: {
    item_id: string;
    counted_qty: number;
    reason?: string;
    operator?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/counts/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<PhysicalCount>;
  },

  listPhysicalCounts: (itemId?: string) => {
    const query = new URLSearchParams();
    if (itemId) query.set("item_id", itemId);
    return fetcher<PhysicalCount[]>(toApiUrl(`/api/counts/?${query}`));
  },
};
