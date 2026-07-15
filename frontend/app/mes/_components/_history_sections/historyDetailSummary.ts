import type { TransactionLog } from "@/lib/api";
import type { IoBatch, IoLine } from "@/lib/api/types/io";
import {
  toInventoryEffectRows,
  type InventoryEffectRow,
} from "./historyInventoryEffect";
import {
  getBatchLineStats,
  getHistoryRowPresentation,
  type HistoryBatchLineStats,
} from "./historyPresentation";

export type HistoryDetailSummaryTone = "success" | "warning" | "danger" | "muted";

export type HistoryDetailStatus = {
  label: string;
  tone: HistoryDetailSummaryTone;
  reason: string | null;
};

export type HistoryImpactGroup = {
  key: "actual" | "output" | "component" | "other";
  label: string | null;
  effects: HistoryDetailImpact[];
};

export type HistoryDetailImpact = InventoryEffectRow & {
  mesCode: string | null;
  role: string | null;
  mismatchLabel: string | null;
};

type HistoryConversionEndpoint = {
  itemId: string;
  itemName: string;
  mesCode: string | null;
};

export type HistoryDetailSummary = {
  target: {
    itemId: string;
    itemName: string;
    mesCode: string | null;
  };
  operationLabel: string;
  status: HistoryDetailStatus;
  impactGroups: HistoryImpactGroup[];
  conversion: {
    source: HistoryConversionEndpoint;
    target: HistoryConversionEndpoint;
  } | null;
  requester: {
    name: string;
    at: string;
  };
  flow: {
    label: string;
    from: string | null;
    to: string | null;
  } | null;
  composition: HistoryBatchLineStats | null;
};

function mergeEffects(effects: InventoryEffectRow[]): InventoryEffectRow[] {
  const byIdentity = new Map<string, InventoryEffectRow>();
  for (const effect of effects) {
    const existing = byIdentity.get(effect.key);
    if (!existing) {
      byIdentity.set(effect.key, effect);
      continue;
    }
    const delta = existing.delta + effect.delta;
    byIdentity.set(effect.key, {
      ...existing,
      delta,
      deltaLabel: delta > 0 ? `+${delta}` : String(delta),
    });
  }
  return Array.from(byIdentity.values()).filter((effect) => effect.delta !== 0);
}

function effectsFromLogs(logs: TransactionLog[]): InventoryEffectRow[] {
  return mergeEffects(
    logs.flatMap((log) =>
      toInventoryEffectRows(log.inventory_effect, {
        itemId: log.item_id,
        itemName: log.item_name,
        unit: log.item_unit?.trim() ?? "",
      }),
    ),
  );
}

function withoutDuplicatedWarehouseBoxEffects(effects: InventoryEffectRow[]): InventoryEffectRow[] {
  const warehouseTotals = new Set(
    effects
      .filter((effect) => effect.scope === "warehouse")
      .map((effect) => `${effect.itemId}:${effect.unit}:${effect.delta}`),
  );
  return effects.filter((effect) => (
    effect.scope !== "warehouse_box"
    || !warehouseTotals.has(`${effect.itemId}:${effect.unit}:${effect.delta}`)
  ));
}

type BomImpactMetadata = {
  itemName: string;
  mesCode: string | null;
  role: string;
  expectedQuantity: number;
};

function getBomImpactMetadata(batch: IoBatch | null): Map<string, BomImpactMetadata> {
  const metadata = new Map<string, BomImpactMetadata>();
  if (!batch) return metadata;

  for (const bundle of batch.bundles) {
    for (const line of bundle.lines) {
      const existing = metadata.get(line.item_id);
      const role = getBomRole(batch, bundle.source_item_id, line);
      metadata.set(line.item_id, {
        itemName: line.item_name,
        mesCode: line.mes_code,
        role,
        expectedQuantity: (existing?.expectedQuantity ?? 0) + Math.abs(line.quantity),
      });
    }
  }
  return metadata;
}

function getBomRole(batch: IoBatch, sourceItemId: string | null, line: IoLine): string {
  const isSource = sourceItemId === line.item_id;
  if (batch.sub_type === "disassemble") return isSource ? "분해 대상" : "회수 부품";
  if (batch.sub_type === "produce") return isSource ? "완제품" : "부품";
  return line.direction === "in" ? "입고품" : "구성품";
}

function enrichActualEffects(
  effects: InventoryEffectRow[],
  batch: IoBatch | null,
): HistoryDetailImpact[] {
  const metadata = getBomImpactMetadata(batch);
  const actualQuantities = new Map<string, number>();
  for (const effect of effects) {
    actualQuantities.set(
      effect.itemId,
      (actualQuantities.get(effect.itemId) ?? 0) + Math.abs(effect.delta),
    );
  }

  const labelledMismatch = new Set<string>();
  return effects.map((effect) => {
    const bom = metadata.get(effect.itemId);
    const differs = bom && actualQuantities.get(effect.itemId) !== bom.expectedQuantity;
    const mismatchLabel = differs && !labelledMismatch.has(effect.itemId)
      ? `BOM ${bom.expectedQuantity} ${effect.unit}`.trim()
      : null;
    if (mismatchLabel) labelledMismatch.add(effect.itemId);
    return {
      ...effect,
      itemName: bom?.itemName ?? effect.itemName,
      mesCode: bom?.mesCode ?? null,
      role: bom?.role ?? null,
      mismatchLabel,
    };
  });
}

function buildImpactGroups(logs: TransactionLog[], batch: IoBatch | null): HistoryImpactGroup[] {
  const effects = enrichActualEffects(withoutDuplicatedWarehouseBoxEffects(effectsFromLogs(logs)), batch);
  return effects.length > 0 ? [{ key: "actual", label: null, effects }] : [];
}

function toConversionEndpoint(log: TransactionLog): HistoryConversionEndpoint {
  return {
    itemId: log.item_id,
    itemName: log.item_name,
    mesCode: log.mes_code,
  };
}

function getItemConversion(logs: TransactionLog[]): HistoryDetailSummary["conversion"] {
  if (!logs.some((log) => log.shipping_phase === "COMPONENT_CHANGE")) return null;
  const source = logs.find((log) => log.notes?.includes("품목 전환 소스"))
    ?? logs.find((log) => log.transaction_type === "BACKFLUSH" && log.quantity_change < 0);
  const target = logs.find((log) => log.notes?.includes("품목 전환 대상"))
    ?? logs.find((log) => (
      (log.transaction_type === "PRODUCE" || log.transaction_type === "RECEIVE")
      && log.quantity_change > 0
    ));
  return source && target
    ? { source: toConversionEndpoint(source), target: toConversionEndpoint(target) }
    : null;
}

function getPrimaryLog(logs: TransactionLog[], batch: IoBatch | null): TransactionLog {
  if (batch?.sub_type === "produce") {
    const sourceItemId = batch.bundles[0]?.source_item_id;
    return logs.find(
      (log) => log.transaction_type === "PRODUCE" && log.item_id === sourceItemId,
    ) ?? logs.find((log) => log.transaction_type === "PRODUCE") ?? logs[0];
  }
  return logs.find((log) => log.transaction_type !== "BACKFLUSH") ?? logs[0];
}

function getStatus(logs: TransactionLog[], batch: IoBatch | null): HistoryDetailStatus {
  const cancelledCount = logs.filter((log) => log.cancelled).length;
  const reason = logs.find((log) => log.cancel_reason?.trim())?.cancel_reason?.trim() ?? null;
  if (batch?.status === "cancelled" || cancelledCount === logs.length) {
    return { label: "취소됨", tone: "danger", reason };
  }
  if (cancelledCount > 0) {
    return { label: "일부 취소", tone: "warning", reason };
  }
  switch (batch?.status) {
    case "draft":
      return { label: "임시 저장", tone: "muted", reason: null };
    case "submitted":
    case "reserved":
      return { label: "처리 중", tone: "warning", reason: null };
    case "rejected":
    case "failed":
      return { label: "처리 실패", tone: "danger", reason: null };
    default:
      return { label: "완료", tone: "success", reason: null };
  }
}

export function buildHistoryDetailSummary(
  logs: TransactionLog[],
  batch: IoBatch | null,
): HistoryDetailSummary {
  const primary = getPrimaryLog(logs, batch);
  const presentation = getHistoryRowPresentation(primary, batch);

  return {
    target: {
      itemId: primary.item_id,
      itemName: presentation.target.title,
      mesCode: presentation.target.code,
    },
    operationLabel: presentation.operation.label,
    status: getStatus(logs, batch),
    impactGroups: buildImpactGroups(logs, batch),
    conversion: getItemConversion(logs),
    requester: {
      name: batch?.requester_name?.trim() || presentation.people.requester,
      at: batch?.submitted_at ?? primary.requested_at ?? primary.created_at,
    },
    flow: presentation.flow.label
      ? {
        label: presentation.flow.label,
        from: presentation.flow.from ?? null,
        to: presentation.flow.to ?? null,
      }
      : null,
    composition: batch ? getBatchLineStats(batch) : null,
  };
}
