"use client";

import { ChevronDown } from "lucide-react";
import { useState, useMemo } from "react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "../legacyUi";
import { EmptyState } from "../common/EmptyState";
import { formatHistoryDate } from "./historyShared";
import { HistoryLogRow } from "./HistoryLogRow";
import { BatchHeader, buildGroups } from "./historyTableHelpers";

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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const groups = useMemo(() => buildGroups(filteredLogs), [filteredLogs]);

  const batchKeys = useMemo(
    () => groups.flatMap((g) => (g.type === "batch" ? [g.refNo] : [])),
    [groups],
  );

  function toggleGroup(refNo: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(refNo)) next.delete(refNo);
      else next.add(refNo);
      return next;
    });
  }

  const allExpanded = batchKeys.length > 0 && batchKeys.every((k) => expandedGroups.has(k));

  function toggleAll() {
    if (allExpanded) setExpandedGroups(new Set());
    else setExpandedGroups(new Set(batchKeys));
  }

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
        {batchKeys.length > 0 && (
          <button
            onClick={toggleAll}
            className="ml-auto rounded-full border px-3 py-1 text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          >
            {allExpanded ? "전체 접기" : "전체 펼치기"}
          </button>
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
              {groups.map((group) => {
                if (group.type === "solo") {
                  return (
                    <HistoryLogRow
                      key={group.log.log_id}
                      log={group.log}
                      selected={selectedLogId === group.log.log_id}
                      copiedRef={copiedRef}
                      onSelect={onSelectLog}
                      onCopyRef={onCopyRef}
                    />
                  );
                }
                const expanded = expandedGroups.has(group.refNo);
                return (
                  <>
                    <BatchHeader
                      key={`hdr-${group.refNo}`}
                      group={group}
                      expanded={expanded}
                      onToggle={() => toggleGroup(group.refNo)}
                      colSpan={COLUMNS.length}
                    />
                    {expanded &&
                      group.logs.map((log) => (
                        <HistoryLogRow
                          key={log.log_id}
                          log={log}
                          selected={selectedLogId === log.log_id}
                          copiedRef={copiedRef}
                          onSelect={onSelectLog}
                          onCopyRef={onCopyRef}
                        />
                      ))}
                  </>
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
