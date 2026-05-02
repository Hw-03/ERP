"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Minus, Plus, PackageSearch, ScanLine, Trash2 } from "lucide-react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { BarcodeScannerModal } from "../../../BarcodeScannerModal";
import type { ToastState } from "@/features/mes/shared/Toast";
import { TYPO } from "../../tokens";
import {
  EmptyState,
  FilterChip,
  FilterChipRow,
  IconButton,
  InlineSearch,
  PrimaryActionButton,
  StickyFooter,
} from "../../primitives";
import { useWarehouseWizard } from "./context";
import { StepHeading } from "./wizardStepShared";

const ITEM_CATEGORIES = [
  { id: "ALL", label: "전체" },
  { id: "R", label: "원자재" },
  { id: "A", label: "중간공정" },
  { id: "F", label: "공정완료" },
] as const;

/**
 * Round-11A (#1) 추출 — WarehouseWizard Step 3 (품목/수량 선택).
 */
export function StepItems({
  items,
  loading,
  onNext,
  showToast,
}: {
  items: Item[];
  loading: boolean;
  onNext: () => void;
  showToast?: (toast: ToastState) => void;
}) {
  const { state, dispatch } = useWarehouseWizard();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof ITEM_CATEGORIES)[number]["id"]>("ALL");
  const [scanOpen, setScanOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const filteredItems = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase();
    return items.filter((item) => {
      if (category === "R" && !item.process_type_code?.endsWith("R")) return false;
      if (category === "A" && !item.process_type_code?.endsWith("A")) return false;
      if (category === "F" && !item.process_type_code?.endsWith("F")) return false;
      if (!keyword) return true;
      const haystack = `${item.item_name} ${item.erp_code ?? ""} ${item.barcode ?? ""}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [items, category, deferredSearch]);

  const selectedList = useMemo(
    () =>
      Array.from(state.items.entries())
        .map(([id, qty]) => ({ item: items.find((i) => i.item_id === id), qty }))
        .filter((e): e is { item: Item; qty: number } => !!e.item),
    [state.items, items],
  );

  const handleScanned = (raw: string) => {
    const hit = items.find(
      (it) => it.barcode === raw || it.erp_code === raw || it.erp_code?.replace(/^0+/, "") === raw,
    );
    if (!hit) {
      dispatch({ type: "SET_ERROR", error: `스캔 값 ${raw} 에 해당하는 품목을 찾지 못했습니다.` });
      return;
    }
    const current = state.items.get(hit.item_id) ?? 0;
    dispatch({ type: "SET_QTY", itemId: hit.item_id, qty: current + 1 });
    showToast?.({ type: "info", message: `${hit.item_name} +1 (${current + 1})` });
  };

  return (
    <div className="flex flex-col gap-3 px-4 pb-28 pt-4">
      <StepHeading title="처리할 품목과 수량을 결정합니다" hint="검색, 바코드 스캔, 카테고리로 빠르게 찾을 수 있습니다" />

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <InlineSearch value={search} onChange={setSearch} placeholder="품명 · 코드 · 바코드" />
        </div>
        <IconButton
          icon={ScanLine}
          label="바코드 스캔"
          size="md"
          color={LEGACY_COLORS.blue}
          onClick={() => setScanOpen(true)}
        />
      </div>

      <FilterChipRow>
        {ITEM_CATEGORIES.map((c) => (
          <FilterChip
            key={c.id}
            label={c.label}
            active={category === c.id}
            onClick={() => setCategory(c.id)}
            color={LEGACY_COLORS.purple}
          />
        ))}
      </FilterChipRow>

      {state.error ? (
        <div
          className={`${TYPO.caption} rounded-[14px] border px-3 py-2`}
          style={{
            background: "rgba(242,95,92,.12)",
            borderColor: "rgba(242,95,92,.28)",
            color: LEGACY_COLORS.red,
          }}
        >
          {state.error}
        </div>
      ) : null}

      {loading ? (
        <div className={`${TYPO.body} py-6 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
          불러오는 중…
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState icon={PackageSearch} title="품목이 없습니다" description="검색어나 분류를 조정해 보세요." />
      ) : (
        <div
          className="overflow-hidden rounded-[14px] border"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          {filteredItems.slice(0, 200).map((item, idx) => {
            const selected = state.items.has(item.item_id);
            const qty = state.items.get(item.item_id) ?? 0;
            return (
              <div
                key={item.item_id}
                style={{
                  borderBottom: idx === Math.min(filteredItems.length, 200) - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                  borderLeft: selected ? `3px solid ${LEGACY_COLORS.blue}` : "3px solid transparent",
                  background: selected ? `${LEGACY_COLORS.blue as string}0d` : "transparent",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (selected) dispatch({ type: "REMOVE_ITEM", itemId: item.item_id });
                    else dispatch({ type: "SET_QTY", itemId: item.item_id, qty: 1 });
                  }}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left"
                >
                  <div
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                    style={{
                      background: selected ? LEGACY_COLORS.blue : "transparent",
                      borderColor: selected ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                    }}
                  >
                    {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`${TYPO.body} truncate font-black`} style={{ color: LEGACY_COLORS.text }}>
                      {item.item_name}
                    </div>
                    <div className={`${TYPO.caption} truncate`} style={{ color: LEGACY_COLORS.muted }}>
                      {item.erp_code ?? "-"}
                    </div>
                  </div>
                  <div className={`${TYPO.caption} shrink-0 tabular-nums`} style={{ color: LEGACY_COLORS.cyan }}>
                    {formatQty(item.quantity)} {item.unit}
                  </div>
                </button>

                {selected ? (
                  <div className="flex items-center gap-2 px-3 pb-3">
                    <MiniStepper value={qty} onChange={(n) => dispatch({ type: "SET_QTY", itemId: item.item_id, qty: n })} />
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "REMOVE_ITEM", itemId: item.item_id })}
                      className={`${TYPO.caption} ml-auto flex items-center gap-1 rounded-[10px] px-2 py-1 font-semibold`}
                      style={{ color: LEGACY_COLORS.red }}
                    >
                      <Trash2 size={12} /> 제거
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <StickyFooter>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className={`${TYPO.caption} font-semibold`} style={{ color: LEGACY_COLORS.muted2 }}>
              선택됨
            </div>
            <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
              {selectedList.length}건
            </div>
          </div>
          <button
            type="button"
            onClick={onNext}
            disabled={selectedList.length === 0}
            className={`${TYPO.body} flex-1 rounded-[14px] py-3 font-black disabled:opacity-40`}
            style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
          >
            다음
          </button>
        </div>
      </StickyFooter>

      {scanOpen ? (
        <BarcodeScannerModal
          onDetected={handleScanned}
          onClose={() => setScanOpen(false)}
        />
      ) : null}
    </div>
  );
}

function MiniStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const step = (delta: number) => onChange(Math.max(1, value + delta));
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => step(-10)}
        className={`${TYPO.caption} rounded-[10px] px-2 py-1 font-bold`}
        style={{ background: `${LEGACY_COLORS.red as string}22`, color: LEGACY_COLORS.red }}
      >
        -10
      </button>
      <button
        type="button"
        onClick={() => step(-1)}
        className="flex h-8 w-8 items-center justify-center rounded-[10px]"
        style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
      >
        <Minus size={14} />
      </button>
      <div
        className={`${TYPO.body} min-w-[54px] rounded-[10px] px-2 py-1 text-center font-black tabular-nums`}
        style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.blue }}
      >
        {value}
      </div>
      <button
        type="button"
        onClick={() => step(1)}
        className="flex h-8 w-8 items-center justify-center rounded-[10px]"
        style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
      >
        <Plus size={14} />
      </button>
      <button
        type="button"
        onClick={() => step(10)}
        className={`${TYPO.caption} rounded-[10px] px-2 py-1 font-bold`}
        style={{ background: `${LEGACY_COLORS.green as string}22`, color: LEGACY_COLORS.green }}
      >
        +10
      </button>
    </div>
  );
}
