"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CheckCircle2, CircleDashed, ClipboardCheck } from "lucide-react";
import type { StocktakeTarget } from "@/lib/api/types/stocktake";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { ReadEmpty } from "../common/ReadState";
import { SkeletonBlock } from "../common/LoadingSkeleton";
import { InventoryTable, InventoryTableRow, type InventoryTableColumn } from "../_inventory_sections/InventoryTable";
import { InventoryStockSummary } from "../_inventory_sections/InventoryStockSummary";
import { StocktakeItemPhoto } from "./StocktakeItemPhoto";
import type { StocktakeVariant } from "./StocktakeLayout";
import styles from "./StocktakeTargetList.module.css";
import { stocktakeItemStatus } from "./stocktakeTargetFilter";
import { ownedWaitingLocations } from "./stocktakeSelection";

export const STOCKTAKE_STATUS_LABEL: Record<StocktakeTarget["status"], string> = {
  UNCOUNTED: "미확인", DRAFT: "계수 중", CONFIRMED: "대기", APPLIED: "완료", ABANDONED: "미확인", CLOSED_UNAPPLIED: "미반영 종료",
};
const TONES: Record<StocktakeTarget["status"], string> = {
  UNCOUNTED: LEGACY_COLORS.muted2, DRAFT: LEGACY_COLORS.blue, CONFIRMED: LEGACY_COLORS.yellow,
  APPLIED: LEGACY_COLORS.green, ABANDONED: LEGACY_COLORS.muted2, CLOSED_UNAPPLIED: LEGACY_COLORS.muted2,
};

/** Keep item rows and their work sheet on the same status color. */
export function stocktakeStatusTone(status: StocktakeTarget["status"]): string | undefined {
  return ["DRAFT", "CONFIRMED", "APPLIED"].includes(status) ? TONES[status] : undefined;
}
const DESKTOP_COLUMNS: InventoryTableColumn[] = [
  { label: "상태", width: "90px", center: true, nowrap: true },
  { label: "이미지", width: "60px", center: true, nowrap: true, className: styles.photo },
  { label: "품목명", minWidth: "140px" },
  { label: "품목 코드", width: "160px", center: true, className: styles.code },
  { label: "현재 부서별 재고", width: "220px", center: true, className: styles.stock },
  { label: "조사 위치", width: "104px", center: true },
  { label: "확인자", width: "144px", center: true, className: styles.owner },
];
const MOBILE_COLUMNS: InventoryTableColumn[] = [
  { label: "상태", width: "72px", center: true },
  { label: "품목명", minWidth: "100px" },
  { label: "현재 재고", width: "104px", center: true },
];
type Props = {
  variant: StocktakeVariant; rows: StocktakeTarget[]; waiting: boolean; loading: boolean;
  selectedTargetId?: string; waitingOwnerId?: string; selection: Record<string, StocktakeTarget>; busy: boolean;
  selectionTotal?: number; onToggleAll?: (selected: boolean) => void;
  hasNextPage: boolean; fetchingNextPage: boolean; filtered: boolean; imageManifest: Record<string, string>;
  onSelect: (target: StocktakeTarget) => void; onToggle: (target: StocktakeTarget, selected: boolean) => void;
  onMore: () => void; onReset: () => void; searchHeader?: ReactNode;
  skeletonRowCount?: number;
};

/** Use the dashboard's value tokens with the target table's responsive column slots. */
function TargetSkeletonValue({ mobile, className }: { mobile: boolean; className: string }): ReactNode {
  return mobile ? <SkeletonBlock className={className} />
    : <span className={`block rounded motion-safe:animate-pulse ${className}`} style={{ background: LEGACY_COLORS.borderStrong }} />;
}

/** Placeholder rows never carry target identities or accept selection. */
function TargetSkeletonRow({ mobile, waiting, cell }: { mobile: boolean; waiting: boolean; cell: string }): ReactNode {
  const value = (className: string): ReactNode => <TargetSkeletonValue mobile={mobile} className={className} />;
  return <tr aria-hidden="true" className={mobile ? "h-[98px]" : undefined}>
    {!mobile && <td aria-hidden={!waiting || undefined} className={`${styles.selectionSlot} ${cell} text-center`} style={{ borderColor: LEGACY_COLORS.border }}>
      <div className={`${styles.selectionContent} min-h-11`}>{value("h-4 w-4")}</div>
    </td>}
    <td className={`${mobile ? cell : "border-b px-2 py-5 align-middle"} text-center`} style={{ borderColor: LEGACY_COLORS.border }}><div className="flex flex-col items-center">
      {waiting && mobile && <div className="mb-1 flex min-h-11 min-w-11 items-center justify-center">{value("h-4 w-4")}</div>}
      {mobile ? value("h-6 w-14 !rounded-full") : <span className="inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-bold motion-safe:animate-pulse" style={{ background: LEGACY_COLORS.borderStrong }}>
        <span className="h-3.5 w-3.5 shrink-0" /><span className="invisible">계수 중</span>
      </span>}
      <span className="mt-1 flex h-4 items-center justify-center">{value("h-3 w-10")}</span>
    </div></td>
    {!mobile && <td className={`${styles.photo} border-b px-1 py-5 text-center align-middle`} style={{ borderColor: LEGACY_COLORS.border }}>{value("mx-auto h-[46px] w-[46px] rounded-lg")}</td>}
    <td className={cell} style={{ borderColor: LEGACY_COLORS.border }}>
      <div className={mobile ? "flex min-h-10 items-center" : ""}>{value("block h-5 w-2/3")}</div>
      {mobile ? <SkeletonBlock className="mt-2 block h-1 w-full rounded-full" />
        : <div className="mt-[20px] h-[6px] w-full rounded-full motion-safe:animate-pulse" style={{ background: LEGACY_COLORS.border }} />}
      {!mobile && <>
        <div className={`${styles.stockMeta} mt-2`}>{value("h-[22px] w-14 !rounded-full")}</div>
        <span className={`${styles.codeMeta} mt-2 block`}><span className="flex h-4 items-center">{value("h-3 w-20")}</span></span>
        <span className={`${styles.ownerMeta} mt-1 block`}><span className="flex h-4 items-center">{value("h-3 w-12")}</span></span>
      </>}
    </td>
    {!mobile && <td className={`${styles.code} ${cell} text-center`} style={{ borderColor: LEGACY_COLORS.border }}>{value("mx-auto h-4 w-20")}</td>}
    {!mobile && <td className={`${styles.stock} ${cell} text-center`} style={{ borderColor: LEGACY_COLORS.border }}>{value("mx-auto h-[22px] w-14 !rounded-full")}</td>}
    <td className={`${cell} text-center`} style={{ borderColor: LEGACY_COLORS.border }}>{mobile ? value("h-5 w-16 !rounded-full") : <div className="flex flex-wrap justify-center gap-1">{value("h-[22px] w-10 !rounded-full")}{value("h-[22px] w-10 !rounded-full")}</div>}</td>
    {!mobile && <td className={`${styles.owner} ${cell} text-center`} style={{ borderColor: LEGACY_COLORS.border }}>{value("mx-auto h-4 w-12")}</td>}
  </tr>;
}

/** Use the dashboard table with target identities and server pagination intact. */
export function StocktakeTargetList({ variant, rows, waiting, loading, selectedTargetId, waitingOwnerId, selection, busy, selectionTotal, onToggleAll, hasNextPage, fetchingNextPage, filtered, imageManifest, onSelect, onToggle, onMore, onReset, searchHeader, skeletonRowCount = 8 }: Props): ReactNode {
  const selected = Object.values(selection);
  const selectedItems = new Set(selected.map(location => location.item_id)).size;
  const allSelected = !!selectionTotal && selectedItems === selectionTotal;
  const allCheckbox = useRef<HTMLInputElement>(null);
  useEffect(() => { if (allCheckbox.current) allCheckbox.current.indeterminate = selectedItems > 0 && !allSelected; }, [selectedItems, allSelected]);
  const mobile = variant === "mobile";
  const cell = mobile ? "border-b px-2 py-3 align-middle" : "border-b px-4 py-5 align-middle";
  const selectionColumn: InventoryTableColumn = {
    label: "전체", width: waiting ? "80px" : "0px", center: true, nowrap: true, ariaHidden: !waiting, className: styles.selectionSlot,
    header: <div className={mobile ? undefined : styles.selectionContent} inert={!waiting}>
      <label className={`flex items-center justify-center gap-1${mobile ? " min-h-11" : ""}`}>
      <input ref={allCheckbox} type="checkbox" aria-label="전체 선택" className="h-4 w-4 shrink-0 accent-[var(--c-blue)]" checked={allSelected}
        disabled={!waiting || busy || loading || !selectionTotal} onChange={event => onToggleAll?.(event.target.checked)} /><span>전체</span>
    </label></div>,
  };
  const columns = mobile ? MOBILE_COLUMNS.map((column, index) => index === 0 && waiting ? { ...column, header: selectionColumn.header } : column)
    : [selectionColumn, ...DESKTOP_COLUMNS];
  return <section aria-label="조사 대상 목록" data-selection-column={waiting} className={`${styles.list} ${mobile ? "flex min-w-0 flex-1 flex-col" : `${styles.desktop} card desktop-flat-surface flex min-w-0 flex-1 flex-col`}`}>
    {searchHeader}
    {loading && <span role="status" aria-busy="true" className="sr-only">대상을 불러오는 중입니다.</span>}
    {!loading && rows.length === 0 ?
      <ReadEmpty title="조건에 맞는 대상이 없습니다." hasFilters={filtered} onReset={onReset} className="py-8" /> :
      <InventoryTable columns={columns} compact={mobile} loading={loading} fillAvailableSpace stickyTop={mobile ? "var(--stocktake-header-top,68px)" : undefined}>
        {loading ? Array.from({ length: skeletonRowCount }, (_, index) => <TargetSkeletonRow key={index} mobile={mobile} waiting={waiting} cell={cell} />) : rows.map(row => {
          const locations = row.location_targets ?? [row];
          const status = stocktakeItemStatus(locations);
          const checkedLocations = locations.filter(location => selection[location.target_id]);
          const candidates = ownedWaitingLocations(row, waitingOwnerId ?? "");
          const confirmed = locations.filter(location => ["CONFIRMED", "APPLIED"].includes(location.status)).length;
          const confirmer = [...new Set(locations.filter(location => location.confirmation_revision_id && location.confirmed_name)
            .map(location => location.confirmed_name))].join(" · ");
          const name = row.current_item_name || row.item_name;
          const code = row.current_item_code || row.item_code;
          const filename = code ? imageManifest[code] : undefined;
          const StatusIcon = status === "APPLIED" ? CheckCircle2 : status === "CONFIRMED" ? ClipboardCheck : CircleDashed;
          const checkbox = (waiting || !mobile) && <label className={`${mobile ? "mb-1 " : ""}flex min-h-11 min-w-11 items-center justify-center`} onClick={event => event.stopPropagation()}>
            <input type="checkbox" className="h-4 w-4 accent-[var(--c-blue)]" aria-label={`${row.item_name} 선택`} checked={checkedLocations.length > 0}
              disabled={!waiting || busy || (!candidates.length && !checkedLocations.length)}
              onChange={event => onToggle(row, event.target.checked)} />
          </label>;
          return <InventoryTableRow key={row.item_id} compact={mobile} selected={locations.some(location => selectedTargetId === location.target_id)} targetId={row.target_id}
            tone={stocktakeStatusTone(status)} onSelect={() => onSelect(row)}>
            {!mobile && <td aria-hidden={!waiting || undefined} className={`${styles.selectionSlot} ${cell} text-center`} style={{ borderColor: LEGACY_COLORS.border }}><div className={styles.selectionContent} inert={!waiting}>{checkbox}</div></td>}
            <td className={`${mobile ? cell : "border-b px-2 py-5 align-middle"} whitespace-nowrap text-center`} style={{ borderColor: LEGACY_COLORS.border }}><div className="flex flex-col items-center">
              {mobile && checkbox}
              <span className={`inline-flex w-fit items-center gap-1 rounded-full py-1 ${mobile ? "px-2 text-xs font-medium" : "px-2.5 text-sm font-bold"}`} style={{ color: TONES[status], background: `color-mix(in srgb, ${TONES[status]} 12%, transparent)` }}><StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{STOCKTAKE_STATUS_LABEL[status]}</span>
              {locations.length > 1 && <span className="mt-1 block text-xs text-[var(--c-muted2)]">확인 {confirmed}/{locations.length}</span>}
            </div></td>
            {!mobile && <td className={`${styles.photo} border-b px-1 py-5 text-center align-middle`} style={{ borderColor: LEGACY_COLORS.border }}><StocktakeItemPhoto filename={filename} name={name} size="thumbnail" /></td>}
            <td className={cell} style={{ borderColor: LEGACY_COLORS.border }}>
              <div className={mobile ? "flex min-h-10 items-center" : ""}><span className={mobile ? "line-clamp-2 min-w-0 break-words text-[15px] font-bold leading-5" : "block break-words font-semibold"}>{name}</span></div>
              {mobile && waiting && <p className="mt-1 text-xs text-[var(--c-muted2)]">{locations.map(location => `${location.scope_name} ${STOCKTAKE_STATUS_LABEL[location.status]}`).join(" · ")}</p>}
              {row.current_inventory && <InventoryStockSummary item={row.current_inventory} compact={mobile} mode="bar" />}
              {!mobile && <div className={`${styles.stockMeta} mt-2`}>
                {row.current_inventory ? <InventoryStockSummary item={row.current_inventory} compact={mobile} /> : <span className="text-xs text-[var(--c-muted2)]">현재 재고 확인 필요</span>}
              </div>}
              {!mobile && <span className={`${styles.codeMeta} mt-2 block break-all text-xs text-[var(--c-muted2)]`}>{code ?? "코드 없음"}</span>}
              {confirmer && <span className={`${mobile ? "" : styles.ownerMeta} mt-1 block text-xs text-[var(--c-muted2)]`}>{confirmer}</span>}
            </td>
            {!mobile && <td className={`${styles.code} ${cell} whitespace-nowrap text-center text-[var(--c-muted)]`} style={{ borderColor: LEGACY_COLORS.border }}>{code ?? "—"}</td>}
            {!mobile && <td className={`${styles.stock} ${cell}`} style={{ borderColor: LEGACY_COLORS.border }}>
              {row.current_inventory ? <InventoryStockSummary item={row.current_inventory} /> : <span className="block text-center text-xs text-[var(--c-muted2)]">현재 재고 확인 필요</span>}
            </td>}
            <td className={`${cell} text-center`} style={{ borderColor: LEGACY_COLORS.border }}>
              {mobile ? row.current_inventory ? <InventoryStockSummary item={row.current_inventory} compact /> : <span className="text-xs text-[var(--c-muted2)]">현재 재고 확인 필요</span>
                : <div className="flex flex-wrap justify-center gap-1">{locations.map(location => <span key={location.target_id} className="inline-flex whitespace-nowrap rounded-full border border-[var(--c-border)] bg-[var(--c-s2)] px-2 py-0.5 text-xs font-bold text-[var(--c-muted2)]">{location.scope_name}{waiting ? ` ${STOCKTAKE_STATUS_LABEL[location.status]}` : ""}</span>)}</div>}
            </td>
            {!mobile && <td className={`${styles.owner} ${cell} whitespace-nowrap text-center font-bold text-[var(--c-muted2)]`} style={{ borderColor: LEGACY_COLORS.border }}>{confirmer || "—"}</td>}
          </InventoryTableRow>;
        })}
      </InventoryTable>}
    {!loading && hasNextPage && <button type="button" className="mt-4 w-full shrink-0 rounded-[24px] border py-4 text-base font-semibold disabled:opacity-50"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      disabled={fetchingNextPage} onClick={onMore}>{fetchingNextPage ? "불러오는 중…" : "더 불러오기"}</button>}
  </section>;
}
