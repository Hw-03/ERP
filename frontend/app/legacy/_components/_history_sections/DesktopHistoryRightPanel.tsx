"use client";

import { ChevronLeft } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { SlidePanel } from "../common";
import { DesktopRightPanel } from "../DesktopRightPanel";
import { HistoryDetailPanel } from "./HistoryDetailPanel";
import { HistoryBatchDetailPanel } from "./HistoryBatchDetailPanel";
import type { HistorySelection } from "./historyConstants";

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
  /** 드릴(BOM 하위·최근거래) 스택이 있으면 "← 뒤로" 노출. */
  canGoBack: boolean;
  onBack: () => void;
  onLogUpdated: (updated: TransactionLog) => void;
  onLogCorrected: (result: { original: TransactionLog; correction: TransactionLog }) => void;
  /** 패널 닫기 (선택 해제). */
  onClose: () => void;
}

export function DesktopHistoryRightPanel({
  selection,
  displaySelection,
  batchCache,
  setBatchCache,
  itemRecentLogs,
  onSelectLog,
  canGoBack,
  onBack,
  onLogUpdated,
  onLogCorrected,
  onClose,
}: DesktopHistoryRightPanelProps) {
  return (
    <SlidePanel open={!!selection} onClose={onClose}>
      {canGoBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-2 inline-flex items-center gap-1 rounded-[12px] border px-3 py-1.5 text-xs font-bold"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          뒤로
        </button>
      )}
      {displaySelection?.kind === "log" && (
        <DesktopRightPanel title={displaySelection.log.item_name}>
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
        return (
          <DesktopRightPanel title={titleText}>
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
