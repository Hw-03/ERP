import { ChevronRight } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { tint } from "@/lib/mes/colorUtils";
import type { IoBatch } from "@/lib/api/types/io";
import type { TransactionLog } from "@/lib/api/types/production";
import { getHistoryActor, parseTransactionNotes } from "./historyBatchInterpreter";
import { getHistoryGroupSummary, type LogGroup } from "./historyTableHelpers";

/** 대표 품목의 이동량만 사용하며, 양쪽 재고 효과와 창고 박스 효과를 중복 합산하지 않는다. */
function getWorkMovementQuantity(log: TransactionLog): number {
  const transferred = Math.abs(Number(log.transfer_qty ?? 0));
  if (Number.isFinite(transferred) && transferred > 0) return transferred;
  const changed = Math.abs(Number(log.quantity_change));
  if (Number.isFinite(changed) && changed > 0) return changed;
  const deltas = (log.inventory_effect ?? [])
    .filter((effect) => effect.scope === "warehouse" || effect.scope === "location")
    .map((effect) => Number(effect.delta)).filter(Number.isFinite);
  const incoming = deltas.reduce((total, delta) => total + Math.max(0, delta), 0);
  const outgoing = deltas.reduce((total, delta) => total + Math.max(0, -delta), 0);
  return Math.max(incoming, outgoing);
}

export function HistorySubmissionDetail({ group, batchCache, onSelectWork }: {
  group: Extract<LogGroup, { type: "submission" }>;
  batchCache?: ReadonlyMap<string, IoBatch>;
  onSelectWork: (group: LogGroup) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium" style={{ color: LEGACY_COLORS.muted2 }}>
        한 번에 제출한 {group.workGroups.length}개 작업입니다. 작업을 선택하면 상세 내역을 확인하고 해당 작업을 취소할 수 있습니다.
      </div>
      {group.workGroups.map((work, index) => {
        const batch = work.type === "op_batch" ? batchCache?.get(work.batchId) : undefined;
        const summary = getHistoryGroupSummary(work, batch);
        const logs = work.type === "solo" ? [work.log] : work.type === "defect_lifecycle" ? [work.parent, work.child] : work.logs;
        const cancelled = logs.every((log) => log.cancelled);
        const reason = logs.find((log) => log.reason_category) ?? summary.primaryLog;
        const category = reason.reason_category || batch?.reason_category;
        const memo = reason.reason_memo?.trim() || parseTransactionNotes(reason.notes || batch?.notes, reason.transaction_type).userMemo;
        const matched = logs.filter((log) => work.matchedLogIds?.includes(log.log_id));
        return (
          <button key={index} type="button" onClick={() => onSelectWork(work)}
            data-history-search-match={matched.length > 0 ? "true" : undefined}
            className="flex min-h-[64px] w-full items-center gap-3 rounded-[16px] border px-4 py-3 text-left transition active:scale-[0.98]"
            style={{ background: matched.length > 0 ? tint(LEGACY_COLORS.blue, 8) : LEGACY_COLORS.s1, borderColor: matched.length > 0 ? LEGACY_COLORS.blue : LEGACY_COLORS.border }}>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold" style={{ color: summary.color }}>{summary.label}{cancelled ? " · 취소됨" : ""}</div>
              <div className="mt-1 text-sm font-semibold" style={{ color: LEGACY_COLORS.text }}>{summary.title}{summary.additionalItemCount > 0 ? ` 외 ${summary.additionalItemCount}품목` : ""}</div>
              <div className="mt-2 space-y-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                <div>담당자 · {getHistoryActor(summary.primaryLog)}</div>
                {category && <div className="break-words">사유 · {category}</div>}
                {memo && <div className="whitespace-pre-wrap break-words">메모 · {memo}</div>}
                {matched.length > 0 && <div className="break-words font-semibold" style={{ color: LEGACY_COLORS.blue }}>
                  검색 일치 · {matched.map((log) => `${log.item_name}${log.mes_code ? ` (${log.mes_code})` : ""}`).join(", ")}
                </div>}
              </div>
            </div>
            <span className="text-sm font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>{formatQty(getWorkMovementQuantity(summary.primaryLog))} {summary.primaryLog.item_unit}</span>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
          </button>
        );
      })}
    </div>
  );
}
