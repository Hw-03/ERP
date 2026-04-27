---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/io/warehouse/WarehouseWizardSteps.tsx
status: active
updated: 2026-04-27
source_sha: b858f8aec1a9
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# WarehouseWizardSteps.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/io/warehouse/WarehouseWizardSteps.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `20879` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/io/warehouse/warehouse|frontend/app/legacy/_components/mobile/io/warehouse]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

> 전체 545줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````tsx
"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { ChevronRight, Minus, Plus, PackageSearch, ScanLine, Trash2 } from "lucide-react";
import type { Employee, Item } from "@/lib/api";
import { LEGACY_COLORS, formatNumber, normalizeDepartment } from "../../../legacyUi";
import { BarcodeScannerModal } from "../../../BarcodeScannerModal";
import type { ToastState } from "../../../Toast";
import { TYPO } from "../../tokens";
import {
  EmptyState,
  FilterChip,
  FilterChipRow,
  IconButton,
  InlineSearch,
  PersonAvatar,
  PrimaryActionButton,
  SectionCard,
  SectionCardRow,
  StickyFooter,
} from "../../primitives";
import { WAREHOUSE_MODE_META, type WarehouseMode } from "./warehouseWizardConfig";
import { useWarehouseWizard } from "./context";

/* -------------------------------------------------------------------------- */
/* Step 1 — 유형 선택                                                          */
/* -------------------------------------------------------------------------- */

export function StepType() {
  const { state, dispatch } = useWarehouseWizard();
  const current = state.mode as WarehouseMode | null;

  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      <StepHeading title="이 작업의 유형을 결정합니다" hint="선택하면 바로 다음 단계로 넘어갑니다" />
      <div className="flex flex-col gap-2">
        {(Object.keys(WAREHOUSE_MODE_META) as WarehouseMode[]).map((mode) => {
          const meta = WAREHOUSE_MODE_META[mode];
          const Icon = meta.icon;
          const active = current === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => {
                dispatch({ type: "SET_MODE", mode });
                dispatch({ type: "NEXT" });
              }}
              className="flex items-center gap-3 rounded-[20px] border px-4 py-4 text-left active:scale-[0.99]"
              style={{
                background: active ? `${LEGACY_COLORS.blue as string}14` : LEGACY_COLORS.s2,
                borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
              }}
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
                style={{ background: `${LEGACY_COLORS.blue as string}22`, color: LEGACY_COLORS.blue }}
              >
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
                  {meta.label}
                </div>
                <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                  {meta.description}
                </div>
              </div>
              <ChevronRight size={20} color={LEGACY_COLORS.muted} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2 — 담당자 선택                                                        */
/* -------------------------------------------------------------------------- */

export function StepPerson({ employees, loading }: { employees: Employee[]; loading: boolean }) {
  const { state, dispatch } = useWarehouseWizard();

  const grouped = useMemo(() => {
    const map = new Map<string, Employee[]>();
    employees.forEach((e) => {
      const key = normalizeDepartment(e.department);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    });
    return Array.from(map.entries());
  }, [employees]);

  if (loading) {
    return (
      <div className={`${TYPO.body} py-10 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
        직원 목록을 불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <StepHeading title="작업을 진행할 담당자를 선택합니다" hint="담당자를 누르면 바로 다음 단계로 넘어갑니다" />
      {grouped.map(([dept, group]) => (
        <div key={dept} className="flex flex-col gap-2">
          <div className={`${TYPO.caption} font-bold`} style={{ color: LEGACY_COLORS.muted }}>
            {dept}
          </div>
          <div className="grid grid-cols-4 gap-3">
            {group.map((e) => (
              <PersonAvatar
                key={e.employee_id}
                name={e.name}
                department={e.department}
                selected={state.employeeId === e.employee_id}
                onClick={() => {
                  dispatch({ type: "SET_EMPLOYEE", employeeId: e.employee_id });
                  dispatch({ type: "NEXT" });
                }}
                size="md"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 3 — 품목 / 수량                                                        */
/* -------------------------------------------------------------------------- */

const ITEM_CATEGORIES = [
  { id: "ALL", label: "전체" },
  { id: "RM", label: "원자재" },
  { id: "A", label: "조립품" },
  { id: "F", label: "반제품" },
  { id: "FG", label: "완제품" },
] as const;

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
      if (category === "RM" && item.category !== "RM") return false;
      if (category === "A" && !["TA", "HA", "VA", "AA"].includes(item.category)) return false;
      if (category === "F" && !["TF", "HF", "VF", "AF"].includes(item.category)) return false;
      if (category === "FG" && item.category !== "FG") return false;
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
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
