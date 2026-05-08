"use client";

import { Copy } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getTransactionLabel, transactionColor } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";
import { TYPO } from "../../tokens";

/**
 * mobile HistoryScreen 의 거래 로그 1줄 렌더.
 *
 * Round-10B (#5) 추출. 기존 HistoryScreen 내부에 있던 LogRow 함수를
 * 별도 파일로 분리. desktop 의 _history_sections/HistoryLogRow.tsx 와 이름이
 * 같지만 디렉터리가 달라 import 충돌 없음.
 */
interface Props {
  log: TransactionLog;
  copiedRef: string | null;
  onCopy: (ref: string) => void;
  onSelect?: (log: TransactionLog) => void;
}

export function HistoryLogRow({ log, copiedRef, onCopy, onSelect }: Props) {
  const interactive = !!onSelect;
  const wrapperProps = interactive
    ? {
        role: "button" as const,
        tabIndex: 0,
        onClick: () => onSelect!(log),
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect!(log);
          }
        },
      }
    : {};
  return (
    <div
      {...wrapperProps}
      className={`flex w-full items-start gap-3 px-3 py-3 text-left ${interactive ? "active:bg-black/10 cursor-pointer" : ""}`}
    >
      <span
        className={`${TYPO.caption} shrink-0 rounded-[8px] px-2 py-[2px] font-bold`}
        style={{
          background:
            log.transaction_type === "RECEIVE"
              ? `${LEGACY_COLORS.green as string}22`
              : log.transaction_type === "SHIP"
                ? `${LEGACY_COLORS.red as string}22`
                : `${LEGACY_COLORS.blue as string}22`,
          color: transactionColor(log.transaction_type),
        }}
      >
        {getTransactionLabel(log.transaction_type)}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`${TYPO.body} truncate font-black`} style={{ color: LEGACY_COLORS.text }}>
          {log.item_name}
        </div>
        <div className={`${TYPO.caption} mt-[1px]`} style={{ color: LEGACY_COLORS.muted2 }}>
          {new Date(log.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
          {" · "}
          <span>{log.erp_code}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {log.reference_no ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCopy(log.reference_no!);
              }}
              className={`${TYPO.caption} flex items-center gap-1 rounded-[8px] px-2 py-[2px] font-semibold`}
              style={{
                background: LEGACY_COLORS.s3,
                color: copiedRef === log.reference_no ? LEGACY_COLORS.green : LEGACY_COLORS.blue,
              }}
            >
              <Copy size={10} />
              <span>
                {copiedRef === log.reference_no ? "복사됨" : log.reference_no}
              </span>
            </button>
          ) : null}
          {log.produced_by ? (
            <span className={TYPO.caption} style={{ color: LEGACY_COLORS.muted }}>
              {log.produced_by}
            </span>
          ) : null}
        </div>
        {log.notes ? (
          <div className={`${TYPO.caption} mt-1`} style={{ color: LEGACY_COLORS.muted }}>
            {log.notes}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <div
          className={`${TYPO.body} font-black`}
          style={{ color: transactionColor(log.transaction_type) }}
        >
          {log.quantity_change >= 0 ? "+" : ""}
          {formatQty(log.quantity_change)}
        </div>
        <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
          → {formatQty(log.quantity_after)}
        </div>
        {log.edit_count != null && log.edit_count > 0 ? (
          <div
            className={`${TYPO.caption} mt-1 inline-block rounded-full px-2 py-[1px] font-bold`}
            style={{
              background: `${LEGACY_COLORS.yellow as string}22`,
              color: LEGACY_COLORS.yellow as string,
            }}
          >
            수정 {log.edit_count}
          </div>
        ) : null}
      </div>
    </div>
  );
}
