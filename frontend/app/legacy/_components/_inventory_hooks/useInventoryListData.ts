"use client";

import { useDeferredValue, useMemo } from "react";
import type { Item } from "@/lib/api";
import { getStockState } from "../legacyUi";
import { useItems } from "../mobile/hooks/useItems";
import type { InventoryFilters } from "../mobile/screens/InventoryFilterSheet";

/**
 * mobile InventoryScreen 의 derivation chain.
 *
 * Round-10B (#3) 추출. search + filters 입력에 대해 useItems → filtered →
 * grouped rows → totals 까지 한 번에 정리. 컴포넌트는 상태(useState) 만
 * 갖고 있으면 되고, 본 hook 의 반환값으로 화면을 그린다.
 *
 * fetch/필터 동작 변화 0 — 기존 useState/useMemo/useDeferredValue 호출
 * 순서 그대로 보존.
 */

const R_SUFFIX = (code: string | null) => code?.endsWith("R") ?? false;
const A_SUFFIX = (code: string | null) => code?.endsWith("A") ?? false;
const F_SUFFIX = (code: string | null) => code?.endsWith("F") ?? false;

export type InventoryDisplayRow = {
  key: string;
  item: Item;
  quantity: number;
  available: number;
  count: number;
};

export interface InventoryListTotals {
  count: number;
  normal: number;
  low: number;
  zero: number;
}

export interface UseInventoryListDataResult {
  items: Item[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
  rows: InventoryDisplayRow[];
  totals: InventoryListTotals;
}

export function useInventoryListData(
  search: string,
  filters: InventoryFilters,
): UseInventoryListDataResult {
  const deferredSearch = useDeferredValue(search);

  const { items, loading, error, hasMore, loadMore, refetch } = useItems({
    search: deferredSearch,
    department: filters.department,
    legacyModel: filters.legacyModel,
  });

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const avail = Number(item.available_quantity ?? item.quantity);
      const min = item.min_stock == null ? null : Number(item.min_stock);
      if (filters.kpi === "OK" && !(avail > 0 && !(min != null && avail < min))) return false;
      if (filters.kpi === "LOW" && !(avail > 0 && min != null && avail < min)) return false;
      if (filters.kpi === "ZERO" && !(avail <= 0)) return false;
      if (filters.itemType === "RM" && !R_SUFFIX(item.process_type_code)) return false;
      if (filters.itemType === "SEMI" && !A_SUFFIX(item.process_type_code)) return false;
      if (filters.itemType === "FIXED" && !F_SUFFIX(item.process_type_code)) return false;
      return true;
    });
  }, [items, filters.kpi, filters.itemType]);

  const rows: InventoryDisplayRow[] = useMemo(() => {
    if (!filters.grouped) {
      return filtered.map((item) => ({
        key: item.item_id,
        item,
        quantity: Number(item.quantity),
        available: Number(item.available_quantity ?? item.quantity),
        count: 1,
      }));
    }
    const map = new Map<string, InventoryDisplayRow>();
    filtered.forEach((item) => {
      const key = item.item_name.trim().toLowerCase();
      const q = Number(item.quantity);
      const a = Number(item.available_quantity ?? item.quantity);
      const prev = map.get(key);
      if (prev) {
        prev.quantity += q;
        prev.available += a;
        prev.count += 1;
      } else {
        map.set(key, { key, item, quantity: q, available: a, count: 1 });
      }
    });
    return Array.from(map.values());
  }, [filtered, filters.grouped]);

  const totals = useMemo<InventoryListTotals>(() => {
    const normal = rows.filter((r) => {
      const min = r.item.min_stock == null ? null : Number(r.item.min_stock);
      return getStockState(r.available, min).label === "정상";
    }).length;
    const low = rows.filter((r) => {
      const min = r.item.min_stock == null ? null : Number(r.item.min_stock);
      return getStockState(r.available, min).label === "부족";
    }).length;
    const zero = rows.filter((r) => r.available <= 0).length;
    return { count: rows.length, normal, low, zero };
  }, [rows]);

  return { items, loading, error, hasMore, loadMore, refetch, rows, totals };
}
