import type { TransactionLog } from "@/lib/api/types/production";
import type { IoBatch } from "@/lib/api/types/io";
import { formatQty } from "@/lib/mes/format";
import {
  getBatchFlowEndpoints,
  getHistoryActor,
  getHistoryBomParentLine,
  getHistoryDisplayLabel,
  getHistoryDisplaySubLabel,
  getHistoryFlowLabel,
  getHistoryMovementSummary,
  getSingleLogMovement,
  parseTransactionNotes,
  type MovementSummary,
} from "./historyBatchInterpreter";

export type HistoryPresentationTone = "primary" | "success" | "info" | "warning" | "danger" | "muted";

export interface HistoryStatusChip {
  label: string;
  tone: HistoryPresentationTone;
  title?: string;
}

export interface HistoryBatchLineStats {
  bundleCount: number;
  bomBundleCount: number;
  directBundleCount: number;
  lineCount: number;
  includedCount: number;
  excludedCount: number;
  shortageCount: number;
}

export interface HistoryTargetPresentation {
  title: string;
  code: string | null;
  meta: string[];
}

export interface HistoryFlowPresentation {
  label: string;
  from?: string;
  to?: string;
  mixed?: boolean;
  hint?: string;
}

export interface HistoryStockPresentation {
  label: string;
  before: number | null;
  after: number | null;
  unit: string;
}

export interface HistoryRowPresentation {
  operation: {
    label: string;
    hint?: string;
  };
  target: HistoryTargetPresentation;
  flow: HistoryFlowPresentation;
  movement: MovementSummary;
  stock: HistoryStockPresentation | null;
  people: {
    requester: string;
    approver: string;
  };
  statusChips: HistoryStatusChip[];
  batchStats: HistoryBatchLineStats | null;
}

export type ReferenceBatchKind = "shipment" | "outbound" | "batch";

export interface ReferenceBatchPresentation {
  kind: ReferenceBatchKind;
  operationLabel: string;
  targetTitle: string;
  targetCode: string | null;
  targetMeta: string[];
  movement: MovementSummary;
}

export function isShippingReference(input: {
  reference_no?: string | null;
  notes?: string | null;
} | null | undefined): boolean {
  const ref = input?.reference_no?.trim() ?? "";
  if (ref.startsWith("SHIP-")) return true;
  const notes = input?.notes?.trim() ?? "";
  return /^출하\s/.test(notes);
}

export function getReferenceBatchPresentation(logs: TransactionLog[]): ReferenceBatchPresentation {
  const first = logs[0];
  const hasShip = logs.some((log) => log.transaction_type === "SHIP");
  const shipment = logs.some((log) => isShippingReference(log));
  const outbound = hasShip && !shipment;
  const kind: ReferenceBatchKind = shipment ? "shipment" : outbound ? "outbound" : "batch";
  const operationLabel = shipment ? "출하" : outbound ? "출고 구성" : "묶음";
  const titlePrefix = shipment ? "출하 구성" : outbound ? "출고 구성" : "묶음";
  const homogeneous = logs.length > 0 && logs.every((log) => log.item_id === first.item_id);
  const movementVerb = shipment ? "출하" : outbound ? "출고" : "하위";
  const movementTone = shipment || outbound ? "danger" : "muted";

  return {
    kind,
    operationLabel,
    targetTitle: `${titlePrefix} ${logs.length}건`,
    targetCode: homogeneous ? first.mes_code : null,
    targetMeta: homogeneous ? [] : [`${logs.length}라인`],
    movement: summarizeReferenceLogs(logs, movementVerb, movementTone),
  };
}

function summarizeReferenceLogs(
  logs: TransactionLog[],
  verb: string,
  tone: MovementSummary["parts"][number]["tone"],
): MovementSummary {
  if (logs.length === 0) return { parts: [{ label: `${verb} 0건`, tone }] };
  const itemCount = new Set(logs.map((log) => log.item_id)).size;
  let total = 0;
  const units = new Set<string>();
  for (const log of logs) {
    const moved = log.transfer_qty != null ? Number(log.transfer_qty) : Math.abs(Number(log.quantity_change));
    if (Number.isFinite(moved)) total += Math.abs(moved);
    const unit = log.item_unit?.trim();
    if (unit) units.add(unit);
  }
  const unit = units.size === 1 ? Array.from(units)[0] : null;
  const qtyLabel = total > 0
    ? unit
      ? ` · ${formatQty(total)} ${unit}`
      : ` · ${formatQty(total)}`
    : "";
  return { parts: [{ label: `${verb} ${itemCount}품목${qtyLabel}`, tone }] };
}

function getHistoryOperationPresentationLabel(
  log: TransactionLog,
  batch?: IoBatch | null,
): string {
  if (!batch && log.transaction_type === "SHIP" && isShippingReference(log)) return "출하";
  return getHistoryDisplayLabel(log, batch);
}
export function getBatchLineStats(batch: IoBatch | null | undefined): HistoryBatchLineStats {
  const stats: HistoryBatchLineStats = {
    bundleCount: 0,
    bomBundleCount: 0,
    directBundleCount: 0,
    lineCount: 0,
    includedCount: 0,
    excludedCount: 0,
    shortageCount: 0,
  };

  if (!batch) return stats;

  stats.bundleCount = batch.bundles.length;
  for (const bundle of batch.bundles) {
    if (bundle.source_kind === "bom_parent") stats.bomBundleCount += 1;
    else stats.directBundleCount += 1;

    const parent = getHistoryBomParentLine(bundle);
    for (const line of bundle.lines) {
      if (line === parent) continue;
      stats.lineCount += 1;
      if (line.included) stats.includedCount += 1;
      else stats.excludedCount += 1;
      if (line.included && line.shortage > 0) stats.shortageCount += 1;
    }
  }

  return stats;
}

export function getHistoryRowPresentation(
  log: TransactionLog,
  batch?: IoBatch | null,
): HistoryRowPresentation {
  const batchStats = batch ? getBatchLineStats(batch) : null;
  const operation = {
    label: getHistoryOperationPresentationLabel(log, batch),
    hint: getHistoryDisplaySubLabel(log, batch),
  };
  const target = getTargetPresentation(log, batch, batchStats);
  const flow = getFlowPresentation(log, batch, operation.hint);
  const movement = batch
    ? getHistoryMovementSummary(log, batch)
    : { parts: [getSingleLogMovement(log)] };
  const stock = getStockPresentation(log);
  const requester = batch?.requester_name ?? getHistoryActor(log);
  const approver = batch?.approver_name ?? log.approver_name ?? requester;

  return {
    operation,
    target,
    flow,
    movement,
    stock,
    people: { requester, approver },
    statusChips: getStatusChips(log, batch, batchStats),
    batchStats,
  };
}

function getTargetPresentation(
  log: TransactionLog,
  batch: IoBatch | null | undefined,
  stats: HistoryBatchLineStats | null,
): HistoryTargetPresentation {
  if (!batch || batch.bundles.length === 0) {
    return {
      title: log.item_name,
      code: log.mes_code,
      meta: [],
    };
  }

  const first = batch.bundles[0];
  const title = batch.bundles.length > 1
    ? `${first.title} 외 ${batch.bundles.length - 1}건`
    : first.title;
  const meta: string[] = [];
  if (stats) {
    if (stats.bomBundleCount > 0) meta.push(`BOM ${stats.bomBundleCount}묶음`);
    if (stats.directBundleCount > 0) meta.push(`단품 ${stats.directBundleCount}묶음`);
    if (stats.lineCount > 0) meta.push(`${stats.lineCount}라인`);
  }

  return {
    title,
    code: first.source_mes_code ?? log.mes_code,
    meta,
  };
}

function getFlowPresentation(
  log: TransactionLog,
  batch: IoBatch | null | undefined,
  hint?: string,
): HistoryFlowPresentation {
  if (batch) {
    const endpoints = getBatchFlowEndpoints(batch);
    if (endpoints) {
      return {
        label: endpoints.from === endpoints.to ? endpoints.from : `${endpoints.from} → ${endpoints.to}`,
        from: endpoints.from,
        to: endpoints.to,
        mixed: endpoints.mixed,
        hint,
      };
    }
  }
  return { label: getHistoryFlowLabel(log, batch), hint };
}

function getStockPresentation(log: TransactionLog): HistoryStockPresentation | null {
  const before = log.quantity_before;
  const after = log.quantity_after;
  if (before == null && after == null) return null;

  const unit = log.item_unit?.trim() ?? "";
  const suffix = unit ? ` ${unit}` : "";
  const afterLabel = after == null ? "-" : `${formatQty(after)}${suffix}`;

  return {
    label: `처리 후 ${afterLabel}`,
    before,
    after,
    unit,
  };
}

function getStatusChips(
  log: TransactionLog,
  batch: IoBatch | null | undefined,
  stats: HistoryBatchLineStats | null,
): HistoryStatusChip[] {
  const chips: HistoryStatusChip[] = [];
  if (log.cancelled || batch?.status === "cancelled") chips.push({ label: "취소", tone: "danger" });
  const editCount = log.edit_count ?? 0;
  if (editCount > 0) chips.push({ label: `수정 ${editCount}`, tone: "warning" });

  const memo = parseTransactionNotes(batch?.notes ?? log.notes).userMemo;
  if (memo) chips.push({ label: "메모", tone: "primary", title: memo });


  if (stats && stats.shortageCount > 0) chips.push({ label: `부족 ${stats.shortageCount}`, tone: "danger" });
  if (stats && stats.excludedCount > 0) chips.push({ label: `제외 ${stats.excludedCount}`, tone: "muted" });
  return chips;
}
