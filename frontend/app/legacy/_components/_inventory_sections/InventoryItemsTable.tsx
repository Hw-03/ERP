"use client";

import { PackageSearch } from "lucide-react";
import type { Item } from "@/lib/api";
import {
  LEGACY_COLORS,
  employeeColor,
  erpCodeDept,
  formatNumber,
  getStockState,
} from "../legacyUi";
import { EmptyState } from "../common/EmptyState";
import { LoadFailureCard } from "../common/LoadFailureCard";

const PAGE_SIZE = 100;

function safeQty(item: Item) {
  const n = Number(item.quantity);
  return isNaN(n) ? 0 : n;
}

function getMinStock(item: Item) {
  return item.min_stock == null ? 0 : Number(item.min_stock);
}

type Props = {
  error: string | null;
  loading: boolean;
  filteredItems: Item[];
  displayLimit: number;
  setDisplayLimit: (updater: (prev: number) => number) => void;
  selectedItem: Item | null;
  onSelectItem: (item: Item | null) => void;
  activeFilterCount: number;
  hasKpiFilter: boolean;
  onRetry: () => void;
  onResetAllFilters: () => void;
};

export function InventoryItemsTable({
  error,
  loading,
  filteredItems,
  displayLimit,
  setDisplayLimit,
  selectedItem,
  onSelectItem,
  activeFilterCount,
  hasKpiFilter,
  onRetry,
  onResetAllFilters,
}: Props) {
  if (error) {
    return <LoadFailureCard message={error} onRetry={onRetry} />;
  }
  if (loading) {
    return (
      <div
        className="rounded-[24px] border px-4 py-4 text-base"
        style={{
          borderColor: LEGACY_COLORS.border,
          background: LEGACY_COLORS.s2,
          color: LEGACY_COLORS.muted2,
        }}
      >
        재고 데이터를 불러오는 중입니다...
      </div>
    );
  }
  if (filteredItems.length === 0) {
    return (
      <EmptyState
        variant={activeFilterCount > 0 || hasKpiFilter ? "filtered-out" : "no-search-result"}
        icon={<PackageSearch className="h-8 w-8" />}
        title="검색 결과가 없습니다."
        description="검색어 또는 필터를 초기화해 전체 품목을 다시 확인하세요."
        action={
          activeFilterCount > 0 || hasKpiFilter
            ? { label: "필터 초기화", onClick: onResetAllFilters }
            : undefined
        }
      />
    );
  }
  return (
    <>
      <div className="overflow-x-auto rounded-[24px] border" style={{ borderColor: LEGACY_COLORS.border }}>
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10">
            <tr style={{ background: LEGACY_COLORS.s2 }}>
              {(
                [
                  { label: "상태", nowrap: true, width: "80px" },
                  { label: "품목명", nowrap: false, minWidth: "180px" },
                  { label: "ERP코드", nowrap: true, width: "100px" },
                  { label: "부서", nowrap: true, width: "120px" },
                  { label: "현재고", nowrap: true, width: "84px" },
                  { label: "안전재고", nowrap: true, width: "80px" },
                ] as { label: string; nowrap: boolean; width?: string; minWidth?: string }[]
              ).map(({ label, nowrap, width, minWidth }) => (
                <th
                  key={label}
                  className={`border-b px-4 py-2.5 text-left text-sm font-bold${nowrap ? " whitespace-nowrap" : ""}`}
                  style={{
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.muted2,
                    width,
                    minWidth,
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredItems.slice(0, displayLimit).map((item) => {
              const minStock = getMinStock(item);
              const stock = getStockState(safeQty(item), minStock === 0 ? null : minStock);
              const selected = selectedItem?.item_id === item.item_id;
              const qty = safeQty(item);
              const isCritical = qty <= 0 || (minStock > 0 && qty < minStock);
              return (
                <tr
                  key={item.item_id}
                  onClick={() => onSelectItem(selected ? null : item)}
                  className="group cursor-pointer transition-all hover:bg-[rgba(101,169,255,0.09)] hover:[box-shadow:inset_3px_0_0_rgba(101,169,255,0.45)]"
                  style={{
                    background: selected ? "rgba(101,169,255,.10)" : "transparent",
                    boxShadow: selected ? `inset 3px 0 0 ${LEGACY_COLORS.blue}` : undefined,
                  }}
                >
                  <td
                    className="border-b px-4 py-2.5 align-middle whitespace-nowrap"
                    style={{ borderColor: LEGACY_COLORS.border }}
                  >
                    <span
                      className="inline-flex w-fit rounded-full px-2.5 py-1 text-sm font-bold"
                      style={{ color: stock.color, background: `color-mix(in srgb, ${stock.color} 12%, transparent)` }}
                    >
                      {stock.label}
                    </span>
                  </td>
                  <td className="border-b px-4 py-2.5 align-middle" style={{ borderColor: LEGACY_COLORS.border }}>
                    <div className="font-semibold">{item.item_name}</div>
                    <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                      {item.spec || "-"}
                    </div>
                    {(() => {
                      if (Number(item.quantity) === 0) {
                        return (
                          <div
                            className="mt-2 h-[5px] overflow-hidden rounded-full"
                            style={{ background: "#ef4444" }}
                            title="품절"
                          />
                        );
                      }
                      const total = Math.max(Number(item.quantity), 1);
                      const wh = Number(item.warehouse_qty);
                      const depts = (item.locations ?? []).filter((l) => Number(l.quantity) > 0);
                      const segments: { pct: number; color: string; label: string }[] = [];
                      let used = 0;
                      if (wh > 0) {
                        const pct = Math.min(100, (wh / total) * 100);
                        segments.push({ pct, color: "#3ac4b0", label: `창고 ${formatNumber(wh)}` });
                        used += pct;
                      }
                      for (const loc of depts) {
                        const pct = Math.min(100 - used, (Number(loc.quantity) / total) * 100);
                        if (pct <= 0) break;
                        segments.push({
                          pct,
                          color: employeeColor(loc.department),
                          label: `${loc.department} ${formatNumber(loc.quantity)}`,
                        });
                        used += pct;
                      }
                      return (
                        <div
                          className="mt-2 flex h-[5px] overflow-hidden rounded-full"
                          style={{ background: LEGACY_COLORS.s3 }}
                          title={segments.map((s) => s.label).join(" / ")}
                        >
                          {segments.map((s, i) => (
                            <div
                              key={i}
                              className="h-full shrink-0"
                              style={{ width: `${s.pct}%`, background: s.color }}
                            />
                          ))}
                        </div>
                      );
                    })()}
                  </td>
                  <td
                    className="border-b px-4 py-2.5 align-middle whitespace-nowrap text-sm"
                    style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
                  >
                    {item.erp_code ?? "-"}
                  </td>
                  <td
                    className="border-b px-4 py-2.5 align-middle whitespace-nowrap"
                    style={{ borderColor: LEGACY_COLORS.border }}
                  >
                    {(() => {
                      const badges: { key: string; label: string; color: string; dim?: boolean }[] = [];
                      if (Number(item.warehouse_qty) > 0)
                        badges.push({ key: "창고", label: "창고", color: "#3dd4a0" });
                      for (const l of item.locations.filter((l) => Number(l.quantity) > 0))
                        badges.push({ key: l.department, label: l.department, color: employeeColor(l.department) });
                      if (badges.length === 0) {
                        const dept = item.department ?? erpCodeDept(item.erp_code);
                        if (dept) badges.push({ key: dept, label: dept, color: employeeColor(dept), dim: true });
                      }
                      const visible = badges.slice(0, 2);
                      const extra = badges.length - 2;
                      return (
                        <div className="flex items-center gap-1.5">
                          {visible.map((b) => (
                            <span
                              key={b.key}
                              className={`text-sm font-bold${b.dim ? " opacity-50" : ""}`}
                              style={{ color: b.color }}
                            >
                              {b.label}
                            </span>
                          ))}
                          {extra > 0 && (
                            <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                              +{extra}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td
                    className="border-b px-4 py-2.5 text-center align-middle whitespace-nowrap text-sm font-bold"
                    style={{
                      borderColor: LEGACY_COLORS.border,
                      color: isCritical ? stock.color : LEGACY_COLORS.text,
                    }}
                  >
                    {formatNumber(item.quantity)}
                  </td>
                  <td
                    className="border-b px-4 py-2.5 text-center align-middle whitespace-nowrap text-sm font-bold"
                    style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                  >
                    {item.min_stock == null ? "-" : formatNumber(item.min_stock)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredItems.length > displayLimit && (
        <button
          onClick={() => setDisplayLimit((prev) => prev + PAGE_SIZE)}
          className="mt-4 w-full rounded-[24px] border py-4 text-base font-semibold"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.muted2,
          }}
        >
          100개 더 보기 (
          {formatNumber(Math.min(displayLimit + PAGE_SIZE, filteredItems.length))} /{" "}
          {formatNumber(filteredItems.length)})
        </button>
      )}
      {filteredItems.length > 0 && (
        <div className="mt-2 text-center text-xs" style={{ color: LEGACY_COLORS.muted }}>
          {formatNumber(Math.min(displayLimit, filteredItems.length))} / {formatNumber(filteredItems.length)}개 표시
        </div>
      )}
    </>
  );
}
