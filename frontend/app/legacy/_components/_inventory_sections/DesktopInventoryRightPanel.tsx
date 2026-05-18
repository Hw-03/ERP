"use client";

import { X } from "lucide-react";
import type { Item, TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { SlidePanel } from "../common";
import { DesktopRightPanel } from "../DesktopRightPanel";
import { InventoryDetailPanel } from "./InventoryDetailPanel";

/**
 * Round-13 (#9) 추출 — DesktopInventoryView 우측 슬라이딩 상세 패널.
 *
 * `selectedItem` 가 null 이어도 lastSelected 표시를 유지해야 하므로 `displayItem` 을 별도로 받음.
 * `onClose` — 패널 닫기(행 선택 해제). headerBadge 옆에 X 버튼으로 표시.
 */
export interface DesktopInventoryRightPanelProps {
  selectedItem: Item | null;
  displayItem: Item | null;
  itemLogs: TransactionLog[];
  headerBadge: React.ReactNode;
  onClose: () => void;
  onGoToWarehouse: (item: Item) => void;
}

export function DesktopInventoryRightPanel({
  selectedItem,
  displayItem,
  itemLogs,
  headerBadge,
  onClose,
  onGoToWarehouse,
}: DesktopInventoryRightPanelProps) {
  const combinedHeaderBadge = (
    <div className="flex items-center gap-2">
      {headerBadge}
      <button
        type="button"
        onClick={onClose}
        aria-label="패널 닫기"
        className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:brightness-110"
        style={{
          background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 14%, transparent)`,
          color: LEGACY_COLORS.muted2,
        }}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <SlidePanel open={!!selectedItem}>
      {displayItem && (
        <DesktopRightPanel
          title={displayItem.item_name}
          subtitle={displayItem.legacy_part ? `${displayItem.erp_code} · ${displayItem.legacy_part}` : (displayItem.erp_code ?? undefined)}
          headerBadge={combinedHeaderBadge}
        >
          <InventoryDetailPanel item={displayItem} logs={itemLogs} onGoToWarehouse={onGoToWarehouse} />
        </DesktopRightPanel>
      )}
    </SlidePanel>
  );
}
