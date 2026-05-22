---
type: file-explanation
source_path: "frontend/app/legacy/_components/_defect_hub/ReasonFormFields.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# ReasonFormFields.tsx — ReasonFormFields.tsx 설명

## 이 파일은 무엇을 책임지나

`ReasonFormFields.tsx`는 불량 격리, 폐기, 반품, 분해 같은 불량 처리 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `ReasonFormFields`
- `ReasonFormFieldsProps`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_defect_hub/📁__defect_hub]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
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
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
        <select
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="w-full rounded-[10px] border px-3 py-2 text-sm font-bold outline-none transition-colors"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: categoryMissing ? "#ef4444" : LEGACY_COLORS.border,
            color: category ? LEGACY_COLORS.text : LEGACY_COLORS.muted,
          }}
        >
          <option value="">카테고리 선택</option>
          {REASON_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        {categoryMissing && (
```
