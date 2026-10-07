"use client";

import { useEffect, useRef, useState } from "react";
import type { Item } from "@/lib/api";
import { SlidePanel } from "../common";
import { DesktopPanelCloseButton, DesktopRightPanel } from "../DesktopRightPanel";
import { InventoryDetailPanel } from "./InventoryDetailPanel";
import { InventoryRecentHistoryPanel } from "./InventoryRecentHistoryPanel";
import type { IoEntryIntent } from "../_warehouse_v2/types";
import { ReadFailure, ReadLoading } from "../common/ReadState";

const INVENTORY_DETAIL_TITLE_ID = "desktop-inventory-detail-title";
const INVENTORY_DETAIL_TAB_ID = "desktop-inventory-detail-tab";
const INVENTORY_HISTORY_TAB_ID = "desktop-inventory-history-tab";
const INVENTORY_DETAIL_PANEL_ID = "desktop-inventory-detail-panel";
const INVENTORY_HISTORY_PANEL_ID = "desktop-inventory-history-panel";
const INVENTORY_TABS = ["detail", "history"] as const;
type InventoryTab = (typeof INVENTORY_TABS)[number];

/**
 * Round-13 (#9) 추출 — DesktopInventoryView 우측 슬라이딩 상세 패널.
 *
 * 선택 품목과 열림을 분리하여 닫힌 상세의 선택도 복원한다.
 * `displayItem` 은 조회 실패나 닫힘 애니메이션에도 마지막 상세 정보를 유지한다.
 * `onClose` — 선택 ID를 유지하며 패널만 닫는다. ESC와 카드 헤더의 닫기 버튼을 사용한다.
 * (history 패널과 동일 패턴 — 기본 X 버튼은 숨긴다.)
 */
export interface DesktopInventoryRightPanelProps {
  open?: boolean;
  selectedItem: Item | null;
  displayItem: Item | null;
  headerBadge: React.ReactNode;
  onClose: () => void;
  onGoToWarehouse: (item: Item, intent?: IoEntryIntent) => void;
  canReceive?: boolean;
  imageFilename?: string;
  detailLoading?: boolean;
  detailError?: string | null;
  onRetryDetail?: () => void;
  actionsDisabled?: boolean;
}

export function DesktopInventoryRightPanel({
  selectedItem,
  displayItem,
  headerBadge,
  onClose,
  onGoToWarehouse,
  canReceive,
  imageFilename,
  open = !!selectedItem,
  detailLoading = false,
  detailError,
  onRetryDetail = () => {},
  actionsDisabled = false,
}: DesktopInventoryRightPanelProps) {
  const [activeTab, setActiveTab] = useState<InventoryTab>("detail");
  const detailTabRef = useRef<HTMLButtonElement>(null);
  const historyTabRef = useRef<HTMLButtonElement>(null);

  function selectTab(nextTab: InventoryTab, moveFocus = false) {
    setActiveTab(nextTab);
    if (moveFocus) (nextTab === "detail" ? detailTabRef : historyTabRef).current?.focus();
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = INVENTORY_TABS.indexOf(activeTab);
    const nextTab = event.key === "ArrowRight"
      ? INVENTORY_TABS[(currentIndex + 1) % INVENTORY_TABS.length]
      : event.key === "ArrowLeft"
        ? INVENTORY_TABS[(currentIndex - 1 + INVENTORY_TABS.length) % INVENTORY_TABS.length]
        : event.key === "Home"
          ? INVENTORY_TABS[0]
          : event.key === "End"
            ? INVENTORY_TABS[INVENTORY_TABS.length - 1]
            : null;
    if (!nextTab) return;
    event.preventDefault();
    selectTab(nextTab, true);
  }

  useEffect(() => {
    setActiveTab("detail");
  }, [selectedItem?.item_id, open]);

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      hideCloseButton
      labelledBy={INVENTORY_DETAIL_TITLE_ID}
    >
      {(displayItem || open) && (
        <DesktopRightPanel
          bodyScrollbarOutset
          title={displayItem?.item_name ?? "품목 상세"}
          titleId={INVENTORY_DETAIL_TITLE_ID}
          subtitle={displayItem?.legacy_part ? `${displayItem.mes_code} · ${displayItem.legacy_part}` : (displayItem?.mes_code ?? undefined)}
          subtitleBadge={headerBadge}
          topContent={
            <div className="mb-4 flex items-center gap-2">
              <div
                aria-label="재고 상세 보기"
                className="flex min-w-0 flex-1 w-full gap-1 rounded-[12px] p-1"
                role="tablist"
                style={{ background: "color-mix(in srgb, var(--c-blue) 8%, transparent)" }}
              >
                <button
                  ref={detailTabRef}
                  id={INVENTORY_DETAIL_TAB_ID}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "detail"}
                  aria-controls={INVENTORY_DETAIL_PANEL_ID}
                  tabIndex={activeTab === "detail" ? 0 : -1}
                  onClick={() => selectTab("detail")}
                  onKeyDown={handleTabKeyDown}
                  className="min-h-9 flex-1 rounded-[10px] px-3 text-sm font-bold transition-colors hover:brightness-110"
                  style={{
                    background: activeTab === "detail" ? "var(--c-s1)" : "transparent",
                    color: activeTab === "detail" ? "var(--c-text)" : "var(--c-muted2)",
                  }}
                >
                  상세 정보
                </button>
                <button
                  ref={historyTabRef}
                  id={INVENTORY_HISTORY_TAB_ID}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "history"}
                  aria-controls={INVENTORY_HISTORY_PANEL_ID}
                  tabIndex={activeTab === "history" ? 0 : -1}
                  onClick={() => selectTab("history")}
                  onKeyDown={handleTabKeyDown}
                  className="min-h-9 flex-1 rounded-[10px] px-3 text-sm font-bold transition-colors hover:brightness-110"
                  style={{
                    background: activeTab === "history" ? "var(--c-s1)" : "transparent",
                    color: activeTab === "history" ? "var(--c-text)" : "var(--c-muted2)",
                  }}
                >
                  최근 내역
                </button>
              </div>
              <DesktopPanelCloseButton onClick={onClose} />
            </div>
          }
        >
          {detailLoading && <ReadLoading label="품목 상세를 불러오는 중" variant="card" />}
          {detailError && <ReadFailure message={detailError} onRetry={onRetryDetail} refresh={!!displayItem} />}
          {displayItem?.deleted_at && activeTab === "history" && <p role="status" className="mb-3 text-sm font-bold" style={{ color: "var(--c-red)" }}>
            삭제된 품목입니다. 입출고 작업을 할 수 없습니다.
          </p>}
          {activeTab === "detail" ? (
            <div id={INVENTORY_DETAIL_PANEL_ID} role="tabpanel" aria-labelledby={INVENTORY_DETAIL_TAB_ID}>
              {displayItem && <InventoryDetailPanel
                item={displayItem}
                onGoToWarehouse={onGoToWarehouse}
                canReceive={canReceive}
                imageFilename={imageFilename}
                actionsDisabled={actionsDisabled}
              />}
            </div>
          ) : selectedItem && displayItem && selectedItem.item_id === displayItem.item_id ? (
            <div id={INVENTORY_HISTORY_PANEL_ID} role="tabpanel" aria-labelledby={INVENTORY_HISTORY_TAB_ID} className="flex h-full min-h-0 flex-col">
              <InventoryRecentHistoryPanel key={selectedItem.item_id} item={selectedItem} />
            </div>
          ) : null}
        </DesktopRightPanel>
      )}
    </SlidePanel>
  );
}
