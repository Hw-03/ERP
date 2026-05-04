"use client";

import type { Item, TransactionLog } from "@/lib/api";
import { SlidePanel } from "../common";
import { DesktopRightPanel } from "../DesktopRightPanel";
import { InventoryDetailPanel } from "./InventoryDetailPanel";

/**
 * Round-13 (#9) 추출 — DesktopInventoryView 우측 슬라이딩 상세 패널.
 *
 * `selectedItem` 가 null 이어도 lastSelected 표시를 유지해야 하므로 `displayItem` 을 별도로 받음.
 */
export interface DesktopInventoryRightPanelProps {
  selectedItem: Item | null;
  displayItem: Item | null;
  itemLogs: TransactionLog[];
  headerBadge: React.ReactNode;
  onGoToWarehouse: (item: Item) => void;
}

export function DesktopInventoryRightPanel({
  selectedItem,
  displayItem,
  itemLogs,
  headerBadge,
  onGoToWarehouse,
}: DesktopInventoryRightPanelProps) {
  return (
    <SlidePanel open={!!selectedItem}>
      {displayItem && (
        <DesktopRightPanel
          title={displayItem.item_name}
          subtitle={displayItem.legacy_part ? `${displayItem.erp_code} · ${displayItem.legacy_part}` : (displayItem.erp_code ?? undefined)}
          headerBadge={headerBadge}
        >
          <InventoryDetailPanel item={displayItem} logs={itemLogs} onGoToWarehouse={onGoToWarehouse} />
        </DesktopRightPanel>
      )}
    </SlidePanel>
  );
}
