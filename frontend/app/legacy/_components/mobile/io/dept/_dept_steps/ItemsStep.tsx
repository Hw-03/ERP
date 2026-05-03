"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { ScanLine } from "lucide-react";
import type { Item, ShipPackage } from "@/lib/api";
import { BarcodeScannerModal } from "../../../../BarcodeScannerModal";
import { LEGACY_COLORS } from "../../../../legacyUi";
import type { ToastState } from "@/lib/ui/Toast";
import { TYPO } from "../../../tokens";
import {
  FilterChip,
  FilterChipRow,
  IconButton,
  InlineSearch,
  StickyFooter,
} from "../../../primitives";
import { useDeptWizard } from "../context";
import { ITEM_CATEGORIES, type ItemCategoryId, StepHeading } from "./_shared";
import { PackagePicker } from "./PackagePicker";
import { ItemPicker } from "./ItemPicker";

export function StepItems({
  items,
  itemsLoading,
  packages,
  packagesLoading,
  onNext,
  showToast,
}: {
  items: Item[];
  itemsLoading: boolean;
  packages: ShipPackage[];
  packagesLoading: boolean;
  onNext: () => void;
  showToast?: (toast: ToastState) => void;
}) {
  const { state, dispatch } = useDeptWizard();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ItemCategoryId>("ALL");
  const [scanOpen, setScanOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const canUsePackage = state.direction === "out";

  const filtered = useMemo(() => {
    const k = deferredSearch.trim().toLowerCase();
    return items.filter((item) => {
      if (category === "R" && !item.process_type_code?.endsWith("R")) return false;
      if (category === "A" && !item.process_type_code?.endsWith("A")) return false;
      if (category === "F" && !item.process_type_code?.endsWith("F")) return false;
      if (!k) return true;
      const hay = `${item.item_name} ${item.erp_code ?? ""} ${item.barcode ?? ""}`.toLowerCase();
      return hay.includes(k);
    });
  }, [items, category, deferredSearch]);

  const selectedCount = state.usePackage ? (state.packageId ? 1 : 0) : state.items.size;

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
      <StepHeading
        title={
          state.usePackage
            ? "출하할 패키지를 선택합니다"
            : "처리할 품목과 수량을 결정합니다"
        }
        hint={canUsePackage ? "개별 품목과 출하 패키지 중 하나로 처리할 수 있습니다" : undefined}
      />

      {canUsePackage ? (
        <FilterChipRow>
          <FilterChip
            label="개별 품목"
            active={!state.usePackage}
            onClick={() => dispatch({ type: "SET_USE_PACKAGE", value: false })}
          />
          <FilterChip
            label="출하 패키지"
            active={state.usePackage}
            onClick={() => dispatch({ type: "SET_USE_PACKAGE", value: true })}
            color={LEGACY_COLORS.purple}
          />
        </FilterChipRow>
      ) : null}

      {state.usePackage ? (
        <PackagePicker packages={packages} loading={packagesLoading} />
      ) : (
        <>
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

          <ItemPicker items={filtered} loading={itemsLoading} />
        </>
      )}

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

      <StickyFooter>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className={`${TYPO.caption} font-semibold`} style={{ color: LEGACY_COLORS.muted2 }}>
              {state.usePackage ? "패키지" : "선택됨"}
            </div>
            <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
              {selectedCount}건
            </div>
          </div>
          <button
            type="button"
            onClick={onNext}
            disabled={selectedCount === 0}
            className={`${TYPO.body} flex-1 rounded-[14px] py-3 font-black disabled:opacity-40`}
            style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
          >
            다음
          </button>
        </div>
      </StickyFooter>

      {scanOpen ? (
        <BarcodeScannerModal onDetected={handleScanned} onClose={() => setScanOpen(false)} />
      ) : null}
    </div>
  );
}
