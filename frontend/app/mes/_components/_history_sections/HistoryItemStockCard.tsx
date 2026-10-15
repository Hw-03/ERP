import type { ReactElement, ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import styles from "./HistoryMobileDetail.module.css";

/** 입출고 내역과 품목 최근 상세가 공유하는 품목명·역할·코드·재고 카드. */
export function HistoryItemStockCard({ itemName, mesCode, role = "", cancelled = false, onSelect, stock, stockDetails, children, variant = "card" }: {
  itemName: string;
  mesCode?: string | null;
  role?: string;
  cancelled?: boolean;
  onSelect?: () => void;
  stock: ReactNode;
  stockDetails?: ReactNode;
  children?: ReactNode;
  variant?: "card" | "plain";
}): ReactElement {
  const name = <span className="min-w-0 text-left">
    <span className={`${variant === "plain" ? "block break-words text-sm font-bold" : styles.name}${cancelled ? " line-through opacity-55" : ""}`}>{itemName}</span>
    <span className={styles.itemMetadata} style={{ color: LEGACY_COLORS.muted2 }}>
      {role && <span className="text-xs font-medium">{role}</span>}
      {mesCode && <span className={styles.code}>{mesCode}</span>}
    </span>
  </span>;
  return <div className={variant === "plain" ? "min-w-0 py-3" : "rounded-[16px] border p-3"} style={variant === "plain" ? undefined : { borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
    <div className={styles.compositionRow} style={variant === "plain" ? { alignItems: "start", gridTemplateColumns: "minmax(0, 1fr) fit-content(70%)" } : undefined}>
      {onSelect ? <button type="button" onClick={onSelect} className={styles.informationRow} aria-label={`${role} ${itemName} ${mesCode ?? ""} 상세`}>{name}</button>
        : <div className="min-w-0 break-words">{name}</div>}
      <div className={styles.stockChange} style={variant === "plain" ? { alignSelf: "start" } : undefined}>{stock}</div>
    </div>
    {stockDetails && <div className="mt-2 min-w-0">{stockDetails}</div>}
    {children}
  </div>;
}
