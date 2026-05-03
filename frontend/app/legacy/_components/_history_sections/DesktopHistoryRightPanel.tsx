"use client";

import type { TransactionLog } from "@/lib/api";
import { DesktopRightPanel } from "../DesktopRightPanel";
import { HistoryDetailPanel } from "./HistoryDetailPanel";
import { formatHistoryDate } from "./historyShared";

/**
 * Round-13 (#15) 추출 — DesktopHistoryView 우측 슬라이딩 상세 패널.
 */
export interface DesktopHistoryRightPanelProps {
  selected: TransactionLog | null;
  displaySelected: TransactionLog | null;
  itemRecentLogs: TransactionLog[];
  onSelectLog: (log: TransactionLog) => void;
  onLogUpdated: (updated: TransactionLog) => void;
  onLogCorrected: (result: { original: TransactionLog; correction: TransactionLog }) => void;
}

export function DesktopHistoryRightPanel({
  selected,
  displaySelected,
  itemRecentLogs,
  onSelectLog,
  onLogUpdated,
  onLogCorrected,
}: DesktopHistoryRightPanelProps) {
  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{
        width: selected ? 436 : 0,
        transition: "width 160ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <div
        className="h-full pl-4"
        style={{
          opacity: selected ? 1 : 0,
          transform: selected ? "translateX(0)" : "translateX(18px)",
          transition: "opacity 260ms ease, transform 260ms ease",
          willChange: "transform, opacity",
        }}
      >
        {displaySelected && (
          <DesktopRightPanel
            title={displaySelected.item_name}
            subtitle={`${displaySelected.erp_code ?? "-"} · ${formatHistoryDate(displaySelected.created_at)}`}
          >
            <HistoryDetailPanel
              selected={displaySelected}
              itemRecentLogs={itemRecentLogs}
              onSelectLog={onSelectLog}
              onLogUpdated={onLogUpdated}
              onLogCorrected={onLogCorrected}
            />
          </DesktopRightPanel>
        )}
      </div>
    </div>
  );
}
