"use client";

import { RotateCcw } from "lucide-react";
import type { ProductModel } from "@/lib/api";
import { BottomSheet } from "../../BottomSheet";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";
import { FilterChip, FilterChipRow, SheetHeader } from "../primitives";

export type InventoryFilters = {
  department: string;
  legacyModel: string;
  itemType: string;
  grouped: boolean;
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
  return n;
}

export const DEFAULT_INVENTORY_FILTERS: InventoryFilters = {
  department: "ALL",
  legacyModel: "ALL",
  itemType: "ALL",
  grouped: false,
};
