"use client";

import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getTransactionLabel, transactionColor } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";

/**
 * Round-13 (#8) 추출 — InventoryDetailPanel 의 "최근 이력" 섹션.
 */
export function InventoryDetailLogList({ logs }: { logs: TransactionLog[] }) {
  return (
    <section
      className="rounded-[28px] border p-5"
      style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
    >
      <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
        최근 이력
      </div>
      <div className="space-y-2">
        {logs.length === 0 ? (
          <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
            최근 거래 이력이 없습니다.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.log_id}
              className="rounded-[18px] border p-3"
              style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: transactionColor(log.transaction_type) }}>
                  {getTransactionLabel(log.transaction_type)}
                </span>
                <span className="text-sm">{formatQty(log.quantity_change)}</span>
              </div>
              <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                {log.notes || "메모 없음"}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
