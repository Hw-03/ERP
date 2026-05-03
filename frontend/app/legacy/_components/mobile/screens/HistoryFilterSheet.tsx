"use client";

import { RotateCcw } from "lucide-react";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";
import { FilterChip, FilterChipRow, SheetHeader } from "../primitives";

export type HistoryFilters = {
  type: string;
  date: string;
  employee: string;
  model: string;
  search: string;
};

const TYPE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "입고", value: "RECEIVE" },
  { label: "출고", value: "SHIP" },
  { label: "조정", value: "ADJUST" },
  { label: "생산입고", value: "PRODUCE" },
  { label: "자동차감", value: "BACKFLUSH" },
];

const DATE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "오늘", value: "TODAY" },
  { label: "이번주", value: "WEEK" },
  { label: "이번달", value: "MONTH" },
];

export const DEFAULT_HISTORY_FILTERS: HistoryFilters = {
  type: "ALL",
  date: "ALL",
  employee: "ALL",
  model: "ALL",
  search: "",
};

export function countActiveHistoryFilters(f: HistoryFilters) {
  let n = 0;
  if (f.type !== "ALL") n++;
  if (f.date !== "ALL") n++;
  if (f.employee !== "ALL") n++;
  if (f.model !== "ALL") n++;
  if (f.search.trim()) n++;
  return n;
}

export function HistoryFilterSheet({
  open,
  onClose,
  filters,
  onChange,
  onReset,
  employeeNames,
  modelNames,
}: {
  open: boolean;
  onClose: () => void;
  filters: HistoryFilters;
  onChange: (next: HistoryFilters) => void;
  onReset: () => void;
  employeeNames: string[];
  modelNames: string[];
}) {
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
        title="이력 필터"
        subtitle="유형 · 기간 · 담당자 · 모델"
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
        <Section title="검색어">
          <input
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="품명 · 코드 · 담당자 · 참조번호 · 메모"
            className={`${TYPO.body} w-full rounded-[14px] border px-3 py-3 outline-none`}
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
        </Section>

        <Section title="유형">
          <FilterChipRow>
            {TYPE_OPTIONS.map((o) => (
              <FilterChip
                key={o.value}
                label={o.label}
                active={filters.type === o.value}
                onClick={() => onChange({ ...filters, type: o.value })}
              />
            ))}
          </FilterChipRow>
        </Section>

        <Section title="기간">
          <FilterChipRow>
            {DATE_OPTIONS.map((o) => (
              <FilterChip
                key={o.value}
                label={o.label}
                active={filters.date === o.value}
                onClick={() => onChange({ ...filters, date: o.value })}
                color={LEGACY_COLORS.purple}
              />
            ))}
          </FilterChipRow>
        </Section>

        {employeeNames.length > 0 ? (
          <Section title="담당자">
            <FilterChipRow>
              <FilterChip
                label="전체"
                active={filters.employee === "ALL"}
                onClick={() => onChange({ ...filters, employee: "ALL" })}
              />
              {employeeNames.map((name) => (
                <FilterChip
                  key={name}
                  label={name}
                  active={filters.employee === name}
                  onClick={() => onChange({ ...filters, employee: name })}
                />
              ))}
            </FilterChipRow>
          </Section>
        ) : null}

        {modelNames.length > 0 ? (
          <Section title="모델">
            <FilterChipRow>
              <FilterChip
                label="전체"
                active={filters.model === "ALL"}
                onClick={() => onChange({ ...filters, model: "ALL" })}
              />
              {modelNames.map((name) => (
                <FilterChip
                  key={name}
                  label={name}
                  active={filters.model === name}
                  onClick={() => onChange({ ...filters, model: name })}
                  color={LEGACY_COLORS.cyan}
                />
              ))}
            </FilterChipRow>
          </Section>
        ) : null}
      </div>

      <div className="border-t px-5 pt-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <button
          type="button"
          onClick={onClose}
          className={`${TYPO.body} w-full rounded-[14px] py-3 font-black`}
          style={{ background: LEGACY_COLORS.blue, color: LEGACY_COLORS.white }}
        >
          결과 보기
        </button>
      </div>
    </BottomSheet>
  );
}
