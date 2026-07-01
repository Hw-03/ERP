import type { TransactionLog } from "@/lib/api/types/production";
import { formatQty } from "@/lib/mes/format";

export interface ReworkItemSummary {
  itemId: string;
  mesCode: string | null;
  itemName: string;
  unit: string;
  scrapQty: number;
  recoverQty: number;
  excluded: boolean;
  resultLabel: string;
}

export function buildReworkItemSummaries(logs: TransactionLog[]): ReworkItemSummary[] {
  const summaries = new Map<string, ReworkItemSummary>();

  for (const log of logs) {
    const key = log.item_id || log.mes_code || log.log_id;
    const current = summaries.get(key) ?? {
      itemId: log.item_id,
      mesCode: log.mes_code,
      itemName: log.item_name,
      unit: log.item_unit?.trim() || "EA",
      scrapQty: 0,
      recoverQty: 0,
      excluded: false,
      resultLabel: "",
    };

    const qty = getMovedQty(log);
    if (log.transaction_type === "DEFECT_SCRAP") {
      current.scrapQty += qty;
      current.excluded = false;
    } else if (log.transaction_type === "RECEIVE") {
      current.recoverQty += qty;
      current.excluded = false;
    } else if (current.scrapQty === 0 && current.recoverQty === 0) {
      current.excluded = true;
    }

    summaries.set(key, current);
  }

  return Array.from(summaries.values()).map((summary) => ({
    ...summary,
    resultLabel: formatReworkResult(summary),
  }));
}

function getMovedQty(log: TransactionLog): number {
  const raw = log.transfer_qty != null ? Number(log.transfer_qty) : Math.abs(Number(log.quantity_change));
  return Number.isFinite(raw) ? Math.abs(raw) : 0;
}

function formatReworkResult(summary: Pick<ReworkItemSummary, "scrapQty" | "recoverQty" | "unit" | "excluded">): string {
  if (summary.excluded) return "처리 제외";
  const unit = summary.unit ? ` ${summary.unit}` : "";
  const parts: string[] = [];
  if (summary.scrapQty > 0) parts.push(`폐기 ${formatQty(summary.scrapQty)}${unit}`);
  if (summary.recoverQty > 0) parts.push(`회수 ${formatQty(summary.recoverQty)}${unit}`);
  return parts.length > 0 ? parts.join(" · ") : "처리 제외";
}