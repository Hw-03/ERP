"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { AppSelect } from "../common/AppSelect";
import { REASON_CATEGORIES } from "./reasonCategories";

export interface ReasonFormFieldsProps {
  category: string;
  memo: string;
  onCategoryChange: (cat: string) => void;
  onMemoChange: (memo: string) => void;
  required?: boolean;
}

/**
 * 불량 처리 공통 사유 폼 — 카테고리 select + 자유 메모 textarea.
 * RDefectActionModal, PaPfDefectWizard 에서 동일하게 import.
 */
export function ReasonFormFields({
  category,
  memo,
  onCategoryChange,
  onMemoChange,
  required = false,
}: ReasonFormFieldsProps): JSX.Element {
  const categoryMissing = required && !category;

  return (
    <div className="flex flex-col gap-3">
      {/* 카테고리 */}
      <div className="flex flex-col gap-1">
        <label
          className="text-xs font-black"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          사유 카테고리
          {required
            ? <span className="ml-0.5" style={{ color: LEGACY_COLORS.red }}>*</span>
            : <span className="ml-1 font-bold" style={{ color: LEGACY_COLORS.muted }}>(선택)</span>
          }
        </label>
        <AppSelect
          value={category}
          onChange={onCategoryChange}
          placeholder="카테고리 선택"
          options={REASON_CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
          size="md"
          triggerStyle={{
            borderColor: categoryMissing ? LEGACY_COLORS.red : undefined,
          }}
        />
        {categoryMissing && (
          <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>
            카테고리를 선택하세요.
          </span>
        )}
      </div>

      {/* 자유 메모 */}
      <div className="flex flex-col gap-1">
        <label
          className="text-xs font-black"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          메모 <span style={{ color: LEGACY_COLORS.muted }}>(선택)</span>
        </label>
        <textarea
          value={memo}
          onChange={(e) => onMemoChange(e.target.value)}
          placeholder="예: 스크래치 다수 / 우측 끝단"
          rows={2}
          className="w-full resize-none rounded-[10px] border px-3 py-2 text-sm outline-none transition-colors"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        />
      </div>
    </div>
  );
}
