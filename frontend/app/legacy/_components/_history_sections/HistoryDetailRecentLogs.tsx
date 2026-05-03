"use client";

import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getTransactionLabel, transactionColor } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";
import { formatHistoryDate } from "./historyShared";

/**
 * Round-13 (#3) 추출 — HistoryDetailPanel 의 "이 품목의 최근 거래" 리스트.
 */
export function HistoryDetailRecentLogs({
  itemRecentLogs,
  onSelectLog,
}: {
  itemRecentLogs: TransactionLog[];
  onSelectLog: (log: TransactionLog) => void;
}) {
  return (
    <div
      className="rounded-[24px] border p-4"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="mb-3 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
        이 품목의 최근 거래
      </div>
      {itemRecentLogs.length === 0 ? (
        <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>최근 거래 없음</div>
      ) : (
        <div className="space-y-2">
          {itemRecentLogs.map((log) => (
            <button
              key={log.log_id}
              onClick={() => onSelectLog(log)}
              className="flex w-full items-center justify-between rounded-[14px] border p-3 text-left transition-all hover:brightness-110"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="flex-1 min-w-0">
                <span
                  className="inline-flex rounded px-2 py-0.5 text-xs font-bold"
                  style={{
                    background: `color-mix(in srgb, ${transactionColor(log.transaction_type)} 14%, transparent)`,
                    color: transactionColor(log.transaction_type),
                  }}
                >
                  {getTransactionLabel(log.transaction_type)}
                </span>
                <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  {formatHistoryDate(log.created_at)}
                </div>
                {(log.quantity_before != null || log.quantity_after != null) && (
                  <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                    {log.quantity_before != null ? formatQty(log.quantity_before) : "-"} →{" "}
                    {log.quantity_after != null ? formatQty(log.quantity_after) : "-"}
                  </div>
                )}
              </div>
              <div
                className="shrink-0 ml-2 text-base font-bold text-right"
                style={{ color: transactionColor(log.transaction_type) }}
              >
                {Number(log.quantity_change) >= 0 ? "+" : ""}
                {formatQty(log.quantity_change)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
