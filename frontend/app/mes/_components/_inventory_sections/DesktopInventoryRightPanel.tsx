"use client";

import type { Item } from "@/lib/api";
import { SlidePanel } from "../common";
import { DesktopRightPanel } from "../DesktopRightPanel";
import { InventoryDetailPanel } from "./InventoryDetailPanel";
import type { IoEntryIntent } from "../_warehouse_v2/types";

const INVENTORY_DETAIL_TITLE_ID = "desktop-inventory-detail-title";

/**
 * Round-13 (#9) 추출 — DesktopInventoryView 우측 슬라이딩 상세 패널.
 *
 * `selectedItem` 가 null 이어도 lastSelected 표시를 유지해야 하므로 `displayItem` 을 별도로 받음.
 * `onClose` — 패널 닫기(행 선택 해제). SlidePanel 의 ESC 처리와 카드 헤더의 닫기 버튼을 사용한다.
 * (history 패널과 동일 패턴 — 기본 X 버튼은 숨긴다.)
 */
export interface DesktopInventoryRightPanelProps {
  selectedItem: Item | null;
  displayItem: Item | null;
  headerBadge: React.ReactNode;
  onClose: () => void;
  onGoToWarehouse: (item: Item, intent?: IoEntryIntent) => void;
  canReceive?: boolean;
  imageFilename?: string;
}

export function DesktopInventoryRightPanel({
  selectedItem,
  displayItem,
  headerBadge,
  onClose,
  onGoToWarehouse,
  canReceive,
  imageFilename,
}: DesktopInventoryRightPanelProps) {
  return (
    <SlidePanel
      open={!!selectedItem}
      onClose={onClose}
      hideCloseButton
      labelledBy={INVENTORY_DETAIL_TITLE_ID}
    >
      {displayItem && (
        <DesktopRightPanel
          title={displayItem.item_name}
          titleId={INVENTORY_DETAIL_TITLE_ID}
          subtitle={displayItem.legacy_part ? `${displayItem.mes_code} · ${displayItem.legacy_part}` : (displayItem.mes_code ?? undefined)}
          subtitleBadge={headerBadge}
          onClose={onClose}
        >
          <InventoryDetailPanel
            item={displayItem}
            onGoToWarehouse={onGoToWarehouse}
            canReceive={canReceive}
            imageFilename={imageFilename}
          />
        </DesktopRightPanel>
      )}
    </SlidePanel>
  );
}
