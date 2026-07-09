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
import type { HistoryTableFocusTarget } from "./HistoryTable";

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
  onSelectLog: (log: TransactionLog) => void;
  /** 드릴(BOM 세부) 스택이 있으면 "← 뒤로" 노출. */
  canGoBack: boolean;
  onBack: () => void;
  onLogUpdated: (updated: TransactionLog) => void;
  onBatchCancelled: (batchId: string) => void;
  onFocusLineInList: (target: Omit<HistoryTableFocusTarget, "nonce">) => void;
  /** 패널 닫기 (선택 해제). */
  onClose: () => void;
}

export function DesktopHistoryRightPanel({
  selection,
  displaySelection,
  batchCache,
  setBatchCache,
  onSelectLog,
  canGoBack,
  onBack,
  onLogUpdated,
  onBatchCancelled,
  onFocusLineInList,
  onClose,
}: DesktopHistoryRightPanelProps) {
  const backButtonNode = canGoBack ? (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors hover:brightness-110"
      style={{
        background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 15%, transparent)`,
        color: LEGACY_COLORS.blue,
      }}
    >
      <ChevronLeft className="h-3.5 w-3.5" /> 뒤로
    </button>
  ) : undefined;

  return (
    <SlidePanel open={!!selection} onClose={onClose} hideCloseButton>
      {displaySelection?.kind === "log" && (
        <DesktopRightPanel
          title={displaySelection.log.item_name}
          backButton={backButtonNode}
          onClose={onClose}
        >
          <HistoryDetailPanel
            key={displaySelection.log.log_id}
            selected={displaySelection.log}
            onSelectLog={onSelectLog}
            onLogUpdated={onLogUpdated}
            variant="desktop"
          />
        </DesktopRightPanel>
      )}

      {displaySelection?.kind === "batch" && (() => {
        const batch = batchCache.get(displaySelection.batchId) ?? null;
        const first = displaySelection.logs[0];
        // 재작업(DISASSEMBLE 포함) batch 는 헤더 행과 동일하게 부모 품목명으로 표기.
        // bundles[0].title 은 created_at 정렬에 따라 자식 부품명이 올 수 있어 헷갈림.
        const disassembleLog = displaySelection.logs.find((l) => l.transaction_type === "DISASSEMBLE");
        const titleText = disassembleLog
          ? `${disassembleLog.item_name} 재작업`
          : batch && batch.bundles.length > 0
          ? (batch.bundles.length > 1
              ? `${batch.bundles[0].title} 외 ${batch.bundles.length - 1}건`
              : batch.bundles[0].title)
          : `${first.item_name} 외 ${displaySelection.logs.length - 1}건`;
        return (
          <DesktopRightPanel
            title={titleText}
            backButton={backButtonNode}
            onClose={onClose}
          >
            <HistoryBatchDetailPanel
              key={displaySelection.batchId}
              batchId={displaySelection.batchId}
              logs={displaySelection.logs}
              batchCache={batchCache}
              setBatchCache={setBatchCache}
              onBatchCancelled={onBatchCancelled}
              onFocusLineInList={onFocusLineInList}
              variant="desktop"
            />
          </DesktopRightPanel>
        );
      })()}
    </SlidePanel>
  );
}
