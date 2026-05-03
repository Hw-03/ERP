"use client";

import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getTransactionLabel, transactionColor } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";
export interface ItemDetailHistoryListProps {
  logs: TransactionLog[];
}

/**
 * ItemDetailSheet 의 "최근 입출고" 이력 리스트.
 * Round-9 (R9-3) 분리. 동작/스타일 변화 0.
 */
export function ItemDetailHistoryList({ logs }: ItemDetailHistoryListProps) {
  return (
    <>
      <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted }}>
        📋 최근 입출고
      </div>
      <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        {logs.length === 0 ? (
          <div className="px-[14px] py-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            최근 이력이 없습니다.
          </div>
        ) : (
          logs.map((log, index) => (
            <div
              key={log.log_id}
              className="flex items-start gap-2 px-[14px] py-[10px]"
              style={{
                borderBottom: index === logs.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              <span
                className="rounded px-[6px] py-[2px] text-[10px] font-bold"
                style={{
                  background:
                    log.transaction_type === "RECEIVE" ? "rgba(31,209,122,.15)" : "rgba(242,95,92,.15)",
                  color: transactionColor(log.transaction_type),
                }}
              >
                {getTransactionLabel(log.transaction_type)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  {new Date(log.created_at).toLocaleString("ko-KR")}
                </div>
                {log.produced_by ? (
                  <div className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
                    👤 {log.produced_by}
                  </div>
                ) : null}
                {log.notes ? (
                  <div className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
                    {log.notes}
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <div
                  className="text-sm font-bold"
                  style={{ color: transactionColor(log.transaction_type) }}
                >
                  {log.quantity_change >= 0 ? "+" : ""}
                  {formatQty(log.quantity_change)}
                </div>
                <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  → {formatQty(log.quantity_after)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
