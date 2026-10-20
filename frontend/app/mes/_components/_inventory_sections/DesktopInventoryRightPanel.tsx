"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { Item } from "@/lib/api";
import { SlidePanel } from "../common";
import { DesktopPanelCloseButton, DesktopRightPanel } from "../DesktopRightPanel";
import { InventoryDetailPanel } from "./InventoryDetailPanel";
import { InventoryRecentHistoryPanel } from "./InventoryRecentHistoryPanel";
import type { IoEntryIntent } from "../_warehouse_v2/types";
import { ReadFailure, ReadLoading } from "../common/ReadState";
import { ItemSearchAliases } from "../common/ItemSearchAliases";

const INVENTORY_DETAIL_TITLE_ID = "desktop-inventory-detail-title";
const INVENTORY_DETAIL_TAB_ID = "desktop-inventory-detail-tab";
const INVENTORY_HISTORY_TAB_ID = "desktop-inventory-history-tab";
const INVENTORY_DETAIL_PANEL_ID = "desktop-inventory-detail-panel";
const INVENTORY_HISTORY_PANEL_ID = "desktop-inventory-history-panel";
const INVENTORY_ALIASES_TAB_ID = "desktop-inventory-aliases-tab";
const INVENTORY_ALIASES_PANEL_ID = "desktop-inventory-aliases-panel";
const INVENTORY_TABS = ["detail", "history", "aliases"] as const;
type InventoryTab = (typeof INVENTORY_TABS)[number];

/** HTTP 접속에서도 복사하며 임시 선택으로 바뀐 포커스와 선택 영역을 복원한다. */
function copyWithSelection(text: string): boolean {
  const focused = document.activeElement;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const inputSelection = focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement
    ? { start: focused.selectionStart, end: focused.selectionEnd, direction: focused.selectionDirection }
    : null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  // 상세 dialog 안에 두어 포커스 트랩이 임시 선택을 차단하지 않게 한다.
  (focused?.closest('[role="dialog"]') ?? document.body).appendChild(textarea);
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    return typeof document.execCommand === "function" && document.execCommand("copy");
  } finally {
    textarea.remove();
    if (focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      ranges.forEach((range) => selection.addRange(range));
    }
    if (inputSelection && inputSelection.start !== null && inputSelection.end !== null &&
      (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement)) {
      focused.setSelectionRange(inputSelection.start, inputSelection.end, inputSelection.direction ?? undefined);
    }
  }
}

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
  const aliasesTabRef = useRef<HTMLButtonElement>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const copyRequestRef = useRef(0);

  useEffect(() => {
    setCopyStatus("idle");
    copyRequestRef.current += 1;
    return () => { copyRequestRef.current += 1; };
  }, [displayItem?.item_id, displayItem?.item_name, open]);

  useEffect(() => {
    if (copyStatus !== "copied") return;
    const timer = window.setTimeout(() => setCopyStatus("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  /** 제목의 생략 표시와 관계없이 현재 표시 품목의 공식 이름 전체를 복사한다. */
  async function handleCopyName(): Promise<void> {
    if (!displayItem) return;
    const request = ++copyRequestRef.current;
    setCopyStatus("idle");
    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(displayItem.item_name);
          copied = true;
        } catch {
          // 권한 거부 시에도 같은 클릭에서 HTTP 호환 복사를 시도한다.
        }
      }
      if (request !== copyRequestRef.current) return;
      if (!copied) copied = copyWithSelection(displayItem.item_name);
      setCopyStatus(copied ? "copied" : "error");
    } catch {
      if (request === copyRequestRef.current) setCopyStatus("error");
    }
  }

  function selectTab(nextTab: InventoryTab, moveFocus = false) {
    setActiveTab(nextTab);
    if (moveFocus) (nextTab === "detail" ? detailTabRef : nextTab === "history" ? historyTabRef : aliasesTabRef).current?.focus();
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
          subtitleAction={displayItem ? <button
            type="button"
            aria-label="품목명 복사"
            onClick={handleCopyName}
            className="flex h-6 w-16 items-center justify-center gap-1 rounded-md text-sm font-bold transition-colors hover:brightness-110 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: "var(--c-blue)", background: "color-mix(in srgb, var(--c-blue) 8%, transparent)" }}
          >
            {copyStatus === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            <span aria-live="polite">{copyStatus === "copied" ? "완료" : "복사"}</span>
          </button> : undefined}
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
                  className="min-h-11 min-w-0 flex-1 whitespace-nowrap rounded-[10px] px-1 text-sm font-bold transition-colors hover:brightness-110"
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
                  className="min-h-11 min-w-0 flex-1 whitespace-nowrap rounded-[10px] px-1 text-sm font-bold transition-colors hover:brightness-110"
                  style={{
                    background: activeTab === "history" ? "var(--c-s1)" : "transparent",
                    color: activeTab === "history" ? "var(--c-text)" : "var(--c-muted2)",
                  }}
                >
                  최근 내역
                </button>
                <button
                  ref={aliasesTabRef}
                  id={INVENTORY_ALIASES_TAB_ID}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "aliases"}
                  aria-controls={INVENTORY_ALIASES_PANEL_ID}
                  tabIndex={activeTab === "aliases" ? 0 : -1}
                  onClick={() => selectTab("aliases")}
                  onKeyDown={handleTabKeyDown}
                  className="min-h-11 min-w-0 flex-1 whitespace-nowrap rounded-[10px] px-1 text-sm font-bold transition-colors hover:brightness-110"
                  style={{
                    background: activeTab === "aliases" ? "var(--c-s1)" : "transparent",
                    color: activeTab === "aliases" ? "var(--c-text)" : "var(--c-muted2)",
                  }}
                >
                  검색용 이름
                </button>
              </div>
              <DesktopPanelCloseButton onClick={onClose} />
            </div>
          }
        >
          {copyStatus === "error" && <p role="alert" className="mb-3 text-sm" style={{ color: "var(--c-red)" }}>품목명을 복사하지 못했습니다. 복사 버튼으로 다시 시도해 주세요.</p>}
          {detailLoading && <ReadLoading label="품목 상세를 불러오는 중" variant="card" />}
          {detailError && <ReadFailure message={detailError} onRetry={onRetryDetail} refresh={!!displayItem} />}
          {displayItem?.deleted_at && activeTab !== "detail" && <p role="status" className="mb-3 text-sm font-bold" style={{ color: "var(--c-red)" }}>
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
                showWorkStatus
              />}
            </div>
          ) : activeTab === "history" && selectedItem && displayItem && selectedItem.item_id === displayItem.item_id ? (
            <div id={INVENTORY_HISTORY_PANEL_ID} role="tabpanel" aria-labelledby={INVENTORY_HISTORY_TAB_ID} className="flex h-full min-h-0 flex-col">
              <InventoryRecentHistoryPanel key={selectedItem.item_id} item={selectedItem} />
            </div>
          ) : null}
          {displayItem && <div id={INVENTORY_ALIASES_PANEL_ID} role="tabpanel" aria-labelledby={INVENTORY_ALIASES_TAB_ID} hidden={activeTab !== "aliases"}>
            <ItemSearchAliases key={displayItem.item_id} itemId={displayItem.item_id} disabled={actionsDisabled || !!displayItem.deleted_at} />
          </div>}
        </DesktopRightPanel>
      )}
    </SlidePanel>
  );
}
