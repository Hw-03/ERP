---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/io/dept/_dept_steps/ItemsStep.tsx
status: active
updated: 2026-04-27
source_sha: 582ef673b8a0
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# ItemsStep.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/io/dept/_dept_steps/ItemsStep.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `14713` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/io/dept/_dept_steps/_dept_steps|frontend/app/legacy/_components/mobile/io/dept/_dept_steps]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

> 전체 375줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````tsx
"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { PackageSearch, Package as PackageIcon, ScanLine, Trash2 } from "lucide-react";
import type { Item, ShipPackage } from "@/lib/api";
import { BarcodeScannerModal } from "../../../../BarcodeScannerModal";
import { LEGACY_COLORS, formatNumber } from "../../../../legacyUi";
import type { ToastState } from "../../../../Toast";
import { TYPO } from "../../../tokens";
import {
  EmptyState,
  FilterChip,
  FilterChipRow,
  IconButton,
  InlineSearch,
  StickyFooter,
} from "../../../primitives";
import { useDeptWizard } from "../context";
import { ITEM_CATEGORIES, type ItemCategoryId, StepHeading } from "./_shared";

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
      if (category === "RM" && item.category !== "RM") return false;
      if (category === "A" && !["TA", "HA", "VA", "AA"].includes(item.category)) return false;
      if (category === "F" && !["TF", "HF", "VF", "AF"].includes(item.category)) return false;
      if (category === "FG" && item.category !== "FG") return false;
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

function PackagePicker({ packages, loading }: { packages: ShipPackage[]; loading: boolean }) {
  const { state, dispatch } = useDeptWizard();
  if (loading) {
    return (
      <div className={`${TYPO.body} py-6 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
        패키지를 불러오는 중…
      </div>
    );
  }
  if (packages.length === 0) {
    return <EmptyState icon={PackageIcon} title="등록된 출하 패키지가 없습니다" />;
  }
  const qty = state.items.get("__PACKAGE__") ?? 1;
  return (
    <div className="flex flex-col gap-2">
      {packages.map((pkg) => {
        const selected = state.packageId === pkg.package_id;
        return (
          <button
            key={pkg.package_id}
            type="button"
            onClick={() => {
              dispatch({ type: "SET_PACKAGE", packageId: pkg.package_id });
              dispatch({ type: "SET_QTY", itemId: "__PACKAGE__", qty: 1 });
            }}
            className="flex flex-col gap-1 rounded-[20px] border px-4 py-3 text-left active:scale-[0.99]"
            style={{
              background: selected ? `${LEGACY_COLORS.purple as string}14` : LEGACY_COLORS.s2,
              borderColor: selected ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className={`${TYPO.body} font-black`} style={{ color: LEGACY_COLORS.text }}>
                {pkg.name}
              </div>
              <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                {pkg.package_code}
              </div>
            </div>
            <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
              {pkg.items.length}개 구성
            </div>
          </button>
        );
      })}

      {state.packageId ? (
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
