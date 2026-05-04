"use client";

import type { TransactionLog } from "@/lib/api";
import { SlidePanel } from "../common";
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
    <SlidePanel open={!!selected}>
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
    </SlidePanel>
  );
}
