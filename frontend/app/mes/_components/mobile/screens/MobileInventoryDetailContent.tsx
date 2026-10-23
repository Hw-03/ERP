"use client";

import { useId, useRef, useState, type JSX, type ReactNode } from "react";
import type { Item } from "@/lib/api";
import type { IoEntryIntent } from "../../_warehouse_v2/types";
import { InventoryDetailPanel } from "../../_inventory_sections/InventoryDetailPanel";
import { InventoryRecentHistoryPanel } from "../../_inventory_sections/InventoryRecentHistoryPanel";
import { ItemSearchAliases } from "../../common/ItemSearchAliases";
import styles from "./MobileInventoryDetailContent.module.css";

const DETAIL_TABS = ["detail", "history", "aliases"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

/** 품목별로 마운트하여 닫기·품목 변경 후 상세 탭부터 시작한다. */
export function MobileInventoryDetailContent({ item, headerBadge, onGoToWarehouse, canReceive, imageFilename, actionsDisabled, refreshing }: {
  item: Item;
  headerBadge: ReactNode;
  onGoToWarehouse: (item: Item, intent?: IoEntryIntent) => void;
  canReceive?: boolean;
  actionsDisabled?: boolean;
  refreshing?: boolean;
  imageFilename?: string;
}): JSX.Element {
  const [active, setActive] = useState<DetailTab>("detail");
  const [historyVisited, setHistoryVisited] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  function selectTab(next: DetailTab, focus = false): void {
    setActive(next);
    if (next === "history") setHistoryVisited(true);
    const sheet = root.current?.closest<HTMLElement>('[data-anim="sheetUp"]');
    if (sheet) sheet.scrollTop = 0;
    if (focus) root.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${id}-${next}`)}`)?.focus();
  }

  return (
    <div ref={root} className={styles.root}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-snug [overflow-wrap:anywhere]">{item.item_name}</h2>
            <p className={styles.code}>{item.legacy_part ? `${item.mes_code} · ${item.legacy_part}` : item.mes_code ?? "-"}</p>
          </div>
          <div className="shrink-0 whitespace-nowrap">{headerBadge}</div>
        </div>
        <div role="tablist" aria-label="품목 상세 보기" className={styles.tabs}>
          {DETAIL_TABS.map((tab, index) => (
            <button key={tab} id={`${id}-${tab}`} role="tab" type="button" aria-selected={active === tab} aria-controls={`${id}-${tab}-panel`}
              tabIndex={active === tab ? 0 : -1} onClick={() => selectTab(tab)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? DETAIL_TABS.length - 1
                  : (index + (event.key === "ArrowRight" ? 1 : -1) + DETAIL_TABS.length) % DETAIL_TABS.length;
                selectTab(DETAIL_TABS[nextIndex], true);
              }}>
              {tab === "detail" ? "상세 정보" : tab === "history" ? "최근 내역" : "검색용 이름"}
            </button>
          ))}
        </div>
      </div>
      {item.deleted_at && active !== "detail" && <p role="status" className="mb-3 text-sm font-bold" style={{ color: "var(--c-red)" }}>
        삭제된 품목입니다. 입출고 작업을 할 수 없습니다.
      </p>}
      <div id={`${id}-detail-panel`} role="tabpanel" aria-labelledby={`${id}-detail`} hidden={active !== "detail"}>
        <InventoryDetailPanel item={item} onGoToWarehouse={onGoToWarehouse} canReceive={canReceive} actionsDisabled={actionsDisabled} refreshing={refreshing} quickActionVariant="mobile" imageFilename={imageFilename} />
      </div>
      {historyVisited && <div id={`${id}-history-panel`} role="tabpanel" aria-labelledby={`${id}-history`} hidden={active !== "history"} className={styles.history}>
        <InventoryRecentHistoryPanel item={item} mobilePresentation />
      </div>}
      <div id={`${id}-aliases-panel`} role="tabpanel" aria-labelledby={`${id}-aliases`} hidden={active !== "aliases"}>
        <ItemSearchAliases key={item.item_id} itemId={item.item_id} disabled={actionsDisabled || !!item.deleted_at} />
      </div>
    </div>
  );
}
