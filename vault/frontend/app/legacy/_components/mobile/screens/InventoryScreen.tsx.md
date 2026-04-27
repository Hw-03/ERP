---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/screens/InventoryScreen.tsx
status: active
updated: 2026-04-27
source_sha: 41a34dfa5568
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# InventoryScreen.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/screens/InventoryScreen.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `14344` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/screens/screens|frontend/app/legacy/_components/mobile/screens]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

> 전체 403줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````tsx
"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { CheckSquare, Filter, History, PackageSearch, X } from "lucide-react";
import type { Item } from "@/lib/api";
import { ItemDetailSheet } from "../../ItemDetailSheet";
import { LEGACY_COLORS, formatNumber, getStockState } from "../../legacyUi";
import { ELEVATION, TYPO } from "../tokens";
import { useItems } from "../hooks/useItems";
import { useModels } from "../hooks/useModels";
import type { ToastState } from "../../Toast";
import {
  AsyncState,
  AsyncSkeletonRows,
  EmptyState,
  IconButton,
  InlineSearch,
  ItemRow,
  KpiCard,
  PrimaryActionButton,
  StickyFooter,
  SummaryChipBar,
} from "../primitives";
import {
  DEFAULT_INVENTORY_FILTERS,
  InventoryFilterSheet,
  buildActiveFilterChips,
  countActiveFilters,
  type InventoryFilters,
} from "./InventoryFilterSheet";

const SEMI_CATS = new Set(["TA", "HA", "VA", "AA"]);
const FIXED_CATS = new Set(["TF", "HF", "VF", "AF"]);

type DisplayRow = { key: string; item: Item; quantity: number; available: number; count: number };

export function InventoryScreen({
  showToast,
  onOpenHistory,
  onBulkIO,
}: {
  showToast: (toast: ToastState) => void;
  onOpenHistory: () => void;
  onBulkIO: (items: Item[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_INVENTORY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const deferredSearch = useDeferredValue(search);
  const { models } = useModels();

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
      if (filters.itemType === "RM" && item.category !== "RM") return false;
      if (filters.itemType === "SEMI" && !SEMI_CATS.has(item.category ?? "")) return false;
      if (filters.itemType === "FIXED" && !FIXED_CATS.has(item.category ?? "")) return false;
      if (filters.itemType === "FG" && item.category !== "FG") return false;
      return true;
    });
  }, [items, filters.kpi, filters.itemType]);

  const rows: DisplayRow[] = useMemo(() => {
    if (!filters.grouped) {
      return filtered.map((item) => ({
        key: item.item_id,
        item,
        quantity: Number(item.quantity),
        available: Number(item.available_quantity ?? item.quantity),
        count: 1,
      }));
    }
    const map = new Map<string, DisplayRow>();
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

  const totals = useMemo(() => {
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

  const activeFilterCount = countActiveFilters(filters);
  const activeChips = useMemo(
    () => buildActiveFilterChips(filters, setFilters),
    [filters],
  );
  const toggleKpi = (next: InventoryFilters["kpi"]) =>
    setFilters((cur) => ({ ...cur, kpi: cur.kpi === next ? "ALL" : next }));

  const toggleCheck = (id: string) =>
    setChecked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const checkedItems = useMemo(
    () => rows.filter((r) => checked.has(r.item.item_id)).map((r) => r.item),
    [rows, checked],
  );
  const exitSelecting = () => {
    setSelecting(false);
    setChecked(new Set());
  };

  const listEmpty = rows.length === 0 && !loading && !error;

  return (
    <div className="relative flex flex-col pb-24">
      {/* Sticky top region — swaps between normal view and selection banner */}
      <div
        className="sticky top-0 z-20"
        style={{
          background: LEGACY_COLORS.bg,
          boxShadow: ELEVATION.sticky,
        }}
      >
        {selecting ? (
          <div
            className="flex items-center justify-between gap-3 px-4 py-3"
            style={{
              background: `${LEGACY_COLORS.blue as string}14`,
              borderBottom: `1px solid ${LEGACY_COLORS.blue as string}44`,
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-full"
                style={{ background: LEGACY_COLORS.blue }}
              >
                <CheckSquare size={13} strokeWidth={2.5} color="#fff" />
              </span>
              <div className="min-w-0">
                <div
                  className={`${TYPO.overline} font-bold uppercase tracking-[2px]`}
                  style={{ color: LEGACY_COLORS.blue }}
                >
                  선택 모드
                </div>
                <div
                  className={`${TYPO.body} font-black tabular-nums`}
                  style={{ color: LEGACY_COLORS.text }}
                >
                  {checkedItems.length}개 선택됨
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={exitSelecting}
              className={`${TYPO.caption} flex items-center gap-1 rounded-full border px-3 py-[6px] font-semibold active:scale-95`}
              style={{
                background: LEGACY_COLORS.s2,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.text,
              }}
            >
              <X size={13} /> 취소
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 px-4 pt-3 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <InlineSearch
                  value={search}
                  onChange={setSearch}
                  placeholder="품명 · 코드 · 모델 · 공급처"
                />
              </div>
              <IconButton
                icon={History}
                label="이력"
                size="md"
                onClick={onOpenHistory}
                color={LEGACY_COLORS.muted2}
              />
              <IconButton
                icon={Filter}
                label="필터"
                size="md"
                onClick={() => setFilterOpen(true)}
                color={activeFilterCount > 0 ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2}
                badge={activeFilterCount}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
