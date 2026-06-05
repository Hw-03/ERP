"use client";

import type { Item, TransactionLog } from "@/lib/api";
import { SlidePanel } from "../common";
import { DesktopRightPanel } from "../DesktopRightPanel";
import { InventoryDetailPanel } from "./InventoryDetailPanel";

/**
 * Round-13 (#9) 추출 — DesktopInventoryView 우측 슬라이딩 상세 패널.
 *
 * `selectedItem` 가 null 이어도 lastSelected 표시를 유지해야 하므로 `displayItem` 을 별도로 받음.
 * `onClose` — 패널 닫기(행 선택 해제). SlidePanel 의 X 버튼 / ESC / focus-trap / role=dialog 로 처리
 * (history 패널과 동일 패턴 — 헤더 중복 X 버튼 제거).
 */
export interface DesktopInventoryRightPanelProps {
  selectedItem: Item | null;
  displayItem: Item | null;
  itemLogs: TransactionLog[];
  headerBadge: React.ReactNode;
  onClose: () => void;
  onGoToWarehouse: (item: Item) => void;
  imageFilename?: string;
}

export function DesktopInventoryRightPanel({
  selectedItem,
  displayItem,
  itemLogs,
  headerBadge,
  onClose,
  onGoToWarehouse,
  imageFilename,
}: DesktopInventoryRightPanelProps) {
  return (
    <SlidePanel open={!!selectedItem} onClose={onClose}>
      {displayItem && (
        <DesktopRightPanel
          title={displayItem.item_name}
          subtitle={displayItem.legacy_part ? `${displayItem.mes_code} · ${displayItem.legacy_part}` : (displayItem.mes_code ?? undefined)}
          headerBadge={headerBadge}
        >
          <InventoryDetailPanel
            item={displayItem}
            logs={itemLogs}
            onGoToWarehouse={onGoToWarehouse}
            imageFilename={imageFilename}
          />
        </DesktopRightPanel>
      )}
    </SlidePanel>
  );
}
