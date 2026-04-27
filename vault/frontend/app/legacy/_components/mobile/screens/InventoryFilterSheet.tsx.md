---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/screens/InventoryFilterSheet.tsx
status: active
updated: 2026-04-27
source_sha: 14f51e7f31bd
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# InventoryFilterSheet.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/screens/InventoryFilterSheet.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `7112` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/screens/screens|frontend/app/legacy/_components/mobile/screens]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

> 전체 242줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````tsx
"use client";

import { RotateCcw } from "lucide-react";
import type { ProductModel } from "@/lib/api";
import { BottomSheet } from "../../BottomSheet";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";
import { FilterChip, FilterChipRow, SheetHeader } from "../primitives";

export type KpiKey = "ALL" | "OK" | "LOW" | "ZERO";

export type InventoryFilters = {
  department: string;
  legacyModel: string;
  itemType: string;
  grouped: boolean;
  kpi: KpiKey;
};

const DEPT_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "창고", value: "창고" },
  { label: "튜브", value: "튜브" },
  { label: "고압", value: "고압" },
  { label: "진공", value: "진공" },
  { label: "튜닝", value: "튜닝" },
  { label: "조립", value: "조립" },
  { label: "출하", value: "출하" },
];

const TYPE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "RM(원자재)", value: "RM" },
  { label: "반제품(?A)", value: "SEMI" },
  { label: "고정형(?F)", value: "FIXED" },
  { label: "완제품(FG)", value: "FG" },
];

export const KPI_LABEL: Record<KpiKey, string> = {
  ALL: "전체",
  OK: "정상",
  LOW: "부족",
  ZERO: "품절",
};

export function InventoryFilterSheet({
  open,
  onClose,
  filters,
  onChange,
  onReset,
  models,
}: {
  open: boolean;
  onClose: () => void;
  filters: InventoryFilters;
  onChange: (next: InventoryFilters) => void;
  onReset: () => void;
  models: ProductModel[];
}) {
  const modelOptions = [
    { label: "전체", value: "ALL" },
    { label: "공용", value: "공용" },
    ...models
      .filter((m) => m.model_name)
      .map((m) => ({ label: m.model_name as string, value: m.model_name as string })),
  ];

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-4">
      <div
        className={`${TYPO.caption} mb-2 font-semibold uppercase tracking-[1.2px]`}
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {title}
      </div>
      {children}
    </div>
  );

  return (
    <BottomSheet open={open} onClose={onClose}>
      <SheetHeader
        title="필터"
        subtitle="부서 · 모델 · 타입 · 묶음"
        onClose={onClose}
        rightAction={
          <button
            type="button"
            onClick={onReset}
            className={`${TYPO.caption} flex items-center gap-1 rounded-[14px] px-2 py-1 font-semibold`}
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            <RotateCcw size={14} />
            초기화
          </button>
        }
      />

      <div className="max-h-[70vh] overflow-y-auto px-5 pb-2">
        <Section title="부서">
          <FilterChipRow>
            {DEPT_OPTIONS.map((o) => (
              <FilterChip
                key={o.value}
                label={o.label}
                active={filters.department === o.value}
                onClick={() => onChange({ ...filters, department: o.value })}
                color={LEGACY_COLORS.green}
              />
            ))}
          </FilterChipRow>
        </Section>

        <Section title="모델">
          <FilterChipRow>
            {modelOptions.map((o) => (
              <FilterChip
                key={o.value}
                label={o.label}
                active={filters.legacyModel === o.value}
                onClick={() => onChange({ ...filters, legacyModel: o.value })}
                color={LEGACY_COLORS.cyan}
              />
            ))}
          </FilterChipRow>
        </Section>

        <Section title="타입">
          <FilterChipRow>
            {TYPE_OPTIONS.map((o) => (
              <FilterChip
                key={o.value}
                label={o.label}
                active={filters.itemType === o.value}
                onClick={() => onChange({ ...filters, itemType: o.value })}
                color={LEGACY_COLORS.purple}
              />
            ))}
          </FilterChipRow>
        </Section>

        <Section title="표시 방식">
          <FilterChipRow>
            <FilterChip
              label="개별 품목"
              active={!filters.grouped}
              onClick={() => onChange({ ...filters, grouped: false })}
            />
            <FilterChip
              label="이름으로 묶음"
              active={filters.grouped}
              onClick={() => onChange({ ...filters, grouped: true })}
              color={LEGACY_COLORS.yellow}
            />
          </FilterChipRow>
        </Section>
      </div>

      <div className="border-t px-5 pt-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <button
          type="button"
          onClick={onClose}
          className={`${TYPO.body} w-full rounded-[14px] py-3 font-black`}
          style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
        >
          결과 보기
        </button>
      </div>
    </BottomSheet>
  );
}

export function countActiveFilters(f: InventoryFilters) {
  let n = 0;
  if (f.department !== "ALL") n++;
  if (f.legacyModel !== "ALL") n++;
  if (f.itemType !== "ALL") n++;
  if (f.grouped) n++;
  if (f.kpi !== "ALL") n++;
  return n;
}

export function buildActiveFilterChips(
  f: InventoryFilters,
  onChange: (next: InventoryFilters) => void,
): { key: string; label: string; tone: string; onRemove: () => void }[] {
  const chips: { key: string; label: string; tone: string; onRemove: () => void }[] = [];
  if (f.kpi !== "ALL") {
    const tone =
      f.kpi === "OK" ? LEGACY_COLORS.green : f.kpi === "LOW" ? LEGACY_COLORS.yellow : LEGACY_COLORS.red;
    chips.push({
      key: "kpi",
      label: `상태: ${KPI_LABEL[f.kpi]}`,
      tone,
      onRemove: () => onChange({ ...f, kpi: "ALL" }),
    });
  }
  if (f.department !== "ALL") {
    chips.push({
      key: "department",
      label: `부서: ${f.department}`,
      tone: LEGACY_COLORS.green,
      onRemove: () => onChange({ ...f, department: "ALL" }),
    });
  }
  if (f.legacyModel !== "ALL") {
    chips.push({
      key: "legacyModel",
      label: `모델: ${f.legacyModel}`,
      tone: LEGACY_COLORS.cyan,
      onRemove: () => onChange({ ...f, legacyModel: "ALL" }),
    });
  }
  if (f.itemType !== "ALL") {
    const label =
      TYPE_OPTIONS.find((t) => t.value === f.itemType)?.label ?? f.itemType;
    chips.push({
      key: "itemType",
      label: `타입: ${label}`,
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
