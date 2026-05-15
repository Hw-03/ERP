"use client";

import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { SlidePanel } from "../common";
import { DesktopRightPanel } from "../DesktopRightPanel";
import { HistoryDetailPanel } from "./HistoryDetailPanel";
import { HistoryBatchDetailPanel } from "./HistoryBatchDetailPanel";
import {
  formatHistoryDate,
  getHistoryActor,
  getHistoryFlowLabel,
  type HistorySelection,
} from "./historyShared";

/**
 * Round-13 (#15) 추출 — DesktopHistoryView 우측 슬라이딩 상세 패널.
 * history-batch-detail-2026-05-15: selection union 분기 (kind="log" | "batch").
 */
export interface DesktopHistoryRightPanelProps {
  selection: HistorySelection | null;
  /** 닫히는 동안에도 패널 내용을 유지하기 위한 마지막 selection. */
  displaySelection: HistorySelection | null;
  batchCache: Map<string, IoBatch>;
  setBatchCache: React.Dispatch<React.SetStateAction<Map<string, IoBatch>>>;
  itemRecentLogs: TransactionLog[];
  onSelectLog: (log: TransactionLog) => void;
  onLogUpdated: (updated: TransactionLog) => void;
  onLogCorrected: (result: { original: TransactionLog; correction: TransactionLog }) => void;
}

export function DesktopHistoryRightPanel({
  selection,
  displaySelection,
  batchCache,
  setBatchCache,
  itemRecentLogs,
  onSelectLog,
  onLogUpdated,
  onLogCorrected,
}: DesktopHistoryRightPanelProps) {
  return (
    <SlidePanel open={!!selection}>
      {displaySelection?.kind === "log" && (
        <DesktopRightPanel
          title={displaySelection.log.item_name}
          subtitle={`${displaySelection.log.erp_code ?? "-"} · ${formatHistoryDate(displaySelection.log.created_at)}`}
        >
          <HistoryDetailPanel
            selected={displaySelection.log}
            itemRecentLogs={itemRecentLogs}
            onSelectLog={onSelectLog}
            onLogUpdated={onLogUpdated}
            onLogCorrected={onLogCorrected}
          />
        </DesktopRightPanel>
      )}

      {displaySelection?.kind === "batch" && (() => {
        const batch = batchCache.get(displaySelection.batchId) ?? null;
        const first = displaySelection.logs[0];
        const titleText = batch && batch.bundles.length > 0
          ? (batch.bundles.length > 1
              ? `${batch.bundles[0].title} 외 ${batch.bundles.length - 1}건`
              : batch.bundles[0].title)
          : `${first.item_name} 외 ${displaySelection.logs.length - 1}건`;
        const subtitleText = `${getHistoryFlowLabel(first, batch)} · ${formatHistoryDate(first.created_at)} · ${getHistoryActor(first)}`;
        return (
          <DesktopRightPanel title={titleText} subtitle={subtitleText}>
            <HistoryBatchDetailPanel
              batchId={displaySelection.batchId}
              logs={displaySelection.logs}
              batchCache={batchCache}
              setBatchCache={setBatchCache}
              onSelectLog={onSelectLog}
            />
          </DesktopRightPanel>
        );
      })()}
    </SlidePanel>
  );
}
