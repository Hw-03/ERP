"use client";

import { useId, useRef, useState, type JSX, type ReactNode } from "react";
import type { Item } from "@/lib/api";
import type { IoEntryIntent } from "../../_warehouse_v2/types";
import { InventoryDetailPanel } from "../../_inventory_sections/InventoryDetailPanel";
import { InventoryRecentHistoryPanel } from "../../_inventory_sections/InventoryRecentHistoryPanel";
import styles from "./MobileInventoryDetailContent.module.css";

/** 품목별로 마운트하여 닫기·품목 변경 후 상세 탭부터 시작한다. */
export function MobileInventoryDetailContent({ item, headerBadge, onGoToWarehouse, canReceive, imageFilename }: {
  item: Item;
  headerBadge: ReactNode;
  onGoToWarehouse: (item: Item, intent?: IoEntryIntent) => void;
  canReceive?: boolean;
  imageFilename?: string;
}): JSX.Element {
  const [active, setActive] = useState<"detail" | "history">("detail");
  const [historyVisited, setHistoryVisited] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  function selectTab(next: "detail" | "history", focus = false): void {
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
          {(["detail", "history"] as const).map((tab) => (
            <button key={tab} id={`${id}-${tab}`} role="tab" type="button" aria-selected={active === tab} aria-controls={`${id}-${tab}-panel`}
              tabIndex={active === tab ? 0 : -1} onClick={() => selectTab(tab)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                selectTab(event.key === "Home" ? "detail" : event.key === "End" ? "history" : tab === "detail" ? "history" : "detail", true);
              }}>
              {tab === "detail" ? "상세 정보" : "최근 내역"}
            </button>
          ))}
        </div>
      </div>
      <div id={`${id}-detail-panel`} role="tabpanel" aria-labelledby={`${id}-detail`} hidden={active !== "detail"}>
        <InventoryDetailPanel item={item} onGoToWarehouse={onGoToWarehouse} canReceive={canReceive} quickActionVariant="mobile" imageFilename={imageFilename} />
      </div>
      {historyVisited && <div id={`${id}-history-panel`} role="tabpanel" aria-labelledby={`${id}-history`} hidden={active !== "history"} className={styles.history}>
        <InventoryRecentHistoryPanel item={item} mobilePresentation />
      </div>}
    </div>
  );
}
