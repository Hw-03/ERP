import type { ReactElement, ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import styles from "./HistoryMobileDetail.module.css";

/** 입출고 내역과 품목 최근 상세가 공유하는 품목명·역할·코드·재고 카드. */
export function HistoryItemStockCard({ itemName, mesCode, role, cancelled = false, onSelect, stock, children }: {
  itemName: string;
  mesCode?: string | null;
  role: string;
  cancelled?: boolean;
  onSelect?: () => void;
  stock: ReactNode;
  children?: ReactNode;
}): ReactElement {
  const name = <span className="min-w-0 text-left">
    <span className={`${styles.name}${cancelled ? " line-through opacity-55" : ""}`}>{itemName}</span>
    <span className={styles.itemMetadata} style={{ color: LEGACY_COLORS.muted2 }}>
      <span className="text-xs font-medium">{role}</span>
      {mesCode && <span className={styles.code}>{mesCode}</span>}
    </span>
  </span>;
  return <div className="rounded-[16px] border p-3" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
    <div className={styles.compositionRow}>
      {onSelect ? <button type="button" onClick={onSelect} className={styles.informationRow} aria-label={`${role} ${itemName} ${mesCode ?? ""} 상세`}>{name}</button>
        : <div className="min-w-0 break-words">{name}</div>}
      <div className={styles.stockChange}>{stock}</div>
    </div>
    {children}
  </div>;
}
