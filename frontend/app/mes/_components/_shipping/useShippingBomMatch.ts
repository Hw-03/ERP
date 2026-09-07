"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  api,
  type ShippingBomLineInput,
  type ShippingBomMatchResponse,
  type ShippingRequestCreatePayload,
} from "@/lib/api";

export type ShippingBomMatchPayload = {
  base_pf_item_id: string;
  bom_lines: ShippingBomLineInput[];
};

export type ShippingBomMatchOutcome = {
  fingerprint: string;
  status: "success" | "aborted" | "error";
  result?: ShippingBomMatchResponse;
  error?: unknown;
};

type ShippingRequestDraftPayload = ShippingRequestCreatePayload & {
  base_pf_item_id: string;
};

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalBomLines(lines: ShippingBomLineInput[] | null | undefined) {
  return (lines ?? [])
    .map((line) => ({
      parent_stage: line.parent_stage,
      child_item_id: line.child_item_id,
      quantity: Number(line.quantity),
      unit: line.unit?.trim() || "EA",
      included: line.included ?? true,
      origin: line.origin ?? "CUSTOM",
    }))
    .sort((left, right) => compareText(
      `${left.parent_stage}\u0000${left.child_item_id}\u0000${left.quantity}\u0000${left.unit}\u0000${left.included}\u0000${left.origin}`,
      `${right.parent_stage}\u0000${right.child_item_id}\u0000${right.quantity}\u0000${right.unit}\u0000${right.included}\u0000${right.origin}`,
    ));
}

function normalizedText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/** BOM matching freshness follows only the payload the server actually evaluates. */
export function shippingBomMatchFingerprint(payload: ShippingBomMatchPayload): string {
  return JSON.stringify({
    base_pf_item_id: payload.base_pf_item_id,
    bom_lines: canonicalBomLines(payload.bom_lines),
  });
}

/** Dirty comparison mirrors every editable field persisted by a shipping request save. */
export function shippingRequestDraftFingerprint(payload: ShippingRequestDraftPayload): string {
  const companionLines = (payload.companion_lines ?? [])
    .map((line) => ({
      item_id: line.item_id,
      quantity: Number(line.quantity),
      unit: line.unit?.trim() || "EA",
    }))
    .sort((left, right) => compareText(
      `${left.item_id}\u0000${left.quantity}\u0000${left.unit}`,
      `${right.item_id}\u0000${right.quantity}\u0000${right.unit}`,
    ));

  return JSON.stringify({
    base_pf_item_id: payload.base_pf_item_id,
    request_quantity: Number(payload.request_quantity ?? 1),
    invoice_number: normalizedText(payload.invoice_number),
    requested_by_name: normalizedText(payload.requested_by_name),
    custom_pa_name: normalizedText(payload.custom_pa_name),
    custom_pf_name: normalizedText(payload.custom_pf_name),
    notes: normalizedText(payload.notes),
    finalization_mode: payload.finalization_mode ?? "KEEP_BASE",
    reuse_pf_item_id: payload.reuse_pf_item_id ?? null,
    companion_lines: companionLines,
    bom_lines: canonicalBomLines(payload.bom_lines),
  });
}

/** Owns one BOM match request at a time and classifies superseded work as silent aborts. */
export function useShippingBomMatch() {
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancel();
    };
  }, [cancel]);

  const run = useCallback(async (payload: ShippingBomMatchPayload): Promise<ShippingBomMatchOutcome> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    const generation = generationRef.current + 1;
    const fingerprint = shippingBomMatchFingerprint(payload);
    generationRef.current = generation;
    controllerRef.current = controller;

    try {
      const result = await api.matchShippingBom(payload, { signal: controller.signal });
      if (!mountedRef.current || controller.signal.aborted || generationRef.current !== generation) {
        return { fingerprint, status: "aborted" };
      }
      return { fingerprint, status: "success", result };
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted || generationRef.current !== generation) {
        return { fingerprint, status: "aborted" };
      }
      return { fingerprint, status: "error", error };
    } finally {
      if (generationRef.current === generation) controllerRef.current = null;
    }
  }, []);

  return { cancel, run };
}
