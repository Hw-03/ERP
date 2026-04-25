"use client";

import { ChevronDown } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS, employeeColor, formatNumber, transactionColor, transactionLabel } from "../legacyUi";
import { EmptyState } from "../common/EmptyState";
import { CATEGORY_META, formatHistoryDate, rowTint } from "./historyShared";

type Props = {
  loading: boolean;
  filteredLogs: TransactionLog[];
  selectedLogId: string | undefined;
  onSelectLog: (log: TransactionLog) => void;
  copiedRef: string | null;
  onCopyRef: (ref: string, e: React.MouseEvent) => void;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
};

const COLUMNS: { label: string; width?: string; minWidth?: string }[] = [
  { label: "일시", width: "140px" },
  { label: "구분", width: "80px" },
  { label: "품목명", minWidth: "160px" },
  { label: "코드", width: "90px" },
  { label: "분류", width: "60px" },
  { label: "수량", width: "70px" },
  { label: "재고 변화", width: "80px" },
  { label: "담당자", width: "90px" },
  { label: "참조번호", width: "90px" },
  { label: "메모", minWidth: "120px" },
];

export function HistoryTable({
  loading,
  filteredLogs,
  selectedLogId,
  onSelectLog,
  copiedRef,
  onCopyRef,
  canLoadMore,
  loadingMore,
  onLoadMore,
}: Props) {
  return (
    <section className="card" style={{ backgroundImage: "linear-gradient(rgba(101,169,255,.04), rgba(101,169,255,.04))" }}>
      <div
        className="sticky top-0 z-20 -mx-5 -mt-5 mb-4 flex items-center gap-3 rounded-t-[28px] px-5 pb-3 pt-5"
        style={{ background: LEGACY_COLORS.bg, backgroundImage: "linear-gradient(rgba(101,169,255,.04), rgba(101,169,255,.04))" }}
      >
        <div className="shrink-0 text-base font-bold">입출고 내역</div>
        <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{filteredLogs.length}건</span>
        {filteredLogs.length > 0 && (
          <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            {formatHistoryDate(filteredLogs[filteredLogs.length - 1].created_at)} ~ {formatHistoryDate(filteredLogs[0].created_at)}
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-base" style={{ color: LEGACY_COLORS.muted2 }}>
          내역을 불러오는 중...
        </div>
      ) : filteredLogs.length === 0 ? (
        <EmptyState
          variant="no-data"
          title="거래 이력이 없습니다."
          description="조건에 맞는 거래가 없거나 아직 기록이 없습니다."
        />
      ) : (
        <div className="overflow-x-auto rounded-[24px] border" style={{ borderColor: LEGACY_COLORS.border }}>
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10">
              <tr style={{ background: LEGACY_COLORS.s2 }}>
                {COLUMNS.map(({ label, width, minWidth }) => (
                  <th
                    key={label}
                    className="whitespace-nowrap border-b px-4 py-3 text-left text-xs font-bold"
                    style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, width, minWidth }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const isSelected = selectedLogId === log.log_id;
                const tcolor = transactionColor(log.transaction_type);
                const cat = CATEGORY_META[log.item_category] ?? {
                  label: log.item_category,
                  color: LEGACY_COLORS.muted2,
                  bg: "rgba(157,173,199,.16)",
                };
                return (
                  <tr
                    key={log.log_id}
                    onClick={() => onSelectLog(log)}
                    className="cursor-pointer transition-colors hover:brightness-110"
                    style={{
                      background: isSelected ? "rgba(101,169,255,.10)" : rowTint(log.transaction_type),
                      outline: isSelected ? `1.5px solid ${LEGACY_COLORS.blue}` : "none",
                    }}
                  >
                    <td
                      className="whitespace-nowrap border-b px-4 py-3 text-xs"
                      style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                    >
                      {formatHistoryDate(log.created_at)}
                    </td>
                    <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                      <span
                        className="inline-flex rounded-full px-2.5 py-1 text-xs font-bold"
                        style={{ background: `color-mix(in srgb, ${tcolor} 14%, transparent)`, color: tcolor }}
                      >
                        {transactionLabel(log.transaction_type)}
                      </span>
                    </td>
                    <td className="max-w-[180px] border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                      <div className="truncate font-semibold">{log.item_name}</div>
                    </td>
                    <td
                      className="whitespace-nowrap border-b px-4 py-3 text-xs"
                      style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                    >
                      {log.erp_code}
                    </td>
                    <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-xs font-bold"
                        style={{ background: cat.bg, color: cat.color }}
                      >
                        {cat.label}
                      </span>
                    </td>
                    <td
                      className="whitespace-nowrap border-b px-4 py-3 text-right font-bold"
                      style={{ borderColor: LEGACY_COLORS.border, color: tcolor }}
                    >
                      {Number(log.quantity_change) >= 0 ? "+" : ""}
                      {formatNumber(log.quantity_change)}
                    </td>
                    <td
                      className="whitespace-nowrap border-b px-4 py-3 text-xs"
                      style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                    >
                      {log.quantity_before != null ? formatNumber(log.quantity_before) : "-"}
                      <span className="mx-1">→</span>
                      {log.quantity_after != null ? formatNumber(log.quantity_after) : "-"}
                    </td>
                    <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                      {log.produced_by ? (
                        (() => {
                          const name = log.produced_by.split("(")[0]?.trim() ?? "-";
                          const dept = log.produced_by.match(/\(([^)]+)\)/)?.[1] ?? "";
                          const color = dept ? employeeColor(dept) : LEGACY_COLORS.muted2;
                          return (
                            <div className="flex items-center gap-1.5">
                              <span
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
                                style={{ background: color }}
                              >
                                {name[0] ?? "?"}
                              </span>
                              <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{name}</span>
                            </div>
                          );
                        })()
                      ) : (
                        <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                      {log.reference_no ? (
                        <button
                          onClick={(e) => onCopyRef(log.reference_no!, e)}
                          className="rounded border px-2 py-0.5 text-xs transition-all hover:brightness-110"
                          style={{
                            background: copiedRef === log.reference_no ? "rgba(67,211,157,.2)" : LEGACY_COLORS.s2,
                            borderColor: LEGACY_COLORS.border,
                            color: copiedRef === log.reference_no ? LEGACY_COLORS.green : LEGACY_COLORS.muted2,
                          }}
                          title="클릭해서 복사"
                        >
                          {copiedRef === log.reference_no ? "복사됨!" : log.reference_no}
                        </button>
                      ) : (
                        <span style={{ color: LEGACY_COLORS.muted2 }}>-</span>
                      )}
                    </td>
                    <td
                      className="max-w-[160px] border-b px-4 py-3"
                      style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                    >
                      <div className="truncate text-xs">{log.notes || "-"}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canLoadMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mt-4 flex w-full items-center justify-center gap-2 py-3 text-base font-bold disabled:opacity-50"
          style={{ color: LEGACY_COLORS.blue }}
        >
          <ChevronDown className="h-4 w-4" />
          {loadingMore ? "불러오는 중..." : "100건 더보기"}
        </button>
      )}
    </section>
  );
}
