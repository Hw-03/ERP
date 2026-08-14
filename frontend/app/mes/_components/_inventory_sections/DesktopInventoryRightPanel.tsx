"use client";

import { useEffect, useState } from "react";
import type { Item } from "@/lib/api";
import { SlidePanel } from "../common";
import { DesktopRightPanel } from "../DesktopRightPanel";
import { InventoryDetailPanel } from "./InventoryDetailPanel";
import { InventoryRecentHistoryPanel } from "./InventoryRecentHistoryPanel";
import type { IoEntryIntent } from "../_warehouse_v2/types";

const INVENTORY_DETAIL_TITLE_ID = "desktop-inventory-detail-title";
const INVENTORY_DETAIL_TAB_ID = "desktop-inventory-detail-tab";
const INVENTORY_HISTORY_TAB_ID = "desktop-inventory-history-tab";
const INVENTORY_DETAIL_PANEL_ID = "desktop-inventory-detail-panel";
const INVENTORY_HISTORY_PANEL_ID = "desktop-inventory-history-panel";

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
  const [activeTab, setActiveTab] = useState<"detail" | "history">("detail");

  useEffect(() => {
    setActiveTab("detail");
  }, [selectedItem?.item_id]);

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
          <div className="px-1 pt-1">
            <div
              aria-label="재고 상세 보기"
              className="flex gap-1 rounded-[12px] p-1"
              role="tablist"
              style={{ background: "color-mix(in srgb, var(--c-blue) 8%, transparent)" }}
            >
              <button
                id={INVENTORY_DETAIL_TAB_ID}
                type="button"
                role="tab"
                aria-selected={activeTab === "detail"}
                aria-controls={INVENTORY_DETAIL_PANEL_ID}
                onClick={() => setActiveTab("detail")}
                className="min-h-9 flex-1 rounded-[10px] px-3 text-sm font-bold transition-colors hover:brightness-110"
                style={{
                  background: activeTab === "detail" ? "var(--c-s1)" : "transparent",
                  color: activeTab === "detail" ? "var(--c-text)" : "var(--c-muted2)",
                }}
              >
                상세 정보
              </button>
              <button
                id={INVENTORY_HISTORY_TAB_ID}
                type="button"
                role="tab"
                aria-selected={activeTab === "history"}
                aria-controls={INVENTORY_HISTORY_PANEL_ID}
                onClick={() => setActiveTab("history")}
                className="min-h-9 flex-1 rounded-[10px] px-3 text-sm font-bold transition-colors hover:brightness-110"
                style={{
                  background: activeTab === "history" ? "var(--c-s1)" : "transparent",
                  color: activeTab === "history" ? "var(--c-text)" : "var(--c-muted2)",
                }}
              >
                최근 내역
              </button>
            </div>
          </div>

          {activeTab === "detail" ? (
            <div id={INVENTORY_DETAIL_PANEL_ID} role="tabpanel" aria-labelledby={INVENTORY_DETAIL_TAB_ID}>
              <InventoryDetailPanel
                item={displayItem}
                onGoToWarehouse={onGoToWarehouse}
                canReceive={canReceive}
                imageFilename={imageFilename}
              />
            </div>
          ) : selectedItem?.item_id === displayItem.item_id ? (
            <div id={INVENTORY_HISTORY_PANEL_ID} role="tabpanel" aria-labelledby={INVENTORY_HISTORY_TAB_ID}>
              <InventoryRecentHistoryPanel key={selectedItem.item_id} item={selectedItem} />
            </div>
          ) : null}
        </DesktopRightPanel>
      )}
    </SlidePanel>
  );
}
