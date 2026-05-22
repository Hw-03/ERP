---
type: file-explanation
source_path: "frontend/app/legacy/_components/SelectedItemsPanel.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# SelectedItemsPanel.tsx — SelectedItemsPanel.tsx 설명

## 이 파일은 무엇을 책임지나

`SelectedItemsPanel.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `SelectedItemsPanel`
- `StepBtn`
- `Item`
- `SelectedEntry`
- `Props`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { X } from "lucide-react";
import { type Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { itemCodeDeptBadge } from "@/lib/mes/process";
import { getStockState } from "@/lib/mes/inventory";
import { formatQty } from "@/lib/mes/format";
import { useDeptColorLookup } from "./DepartmentsContext";

export type SelectedEntry = { item: Item; quantity: number };

interface Props {
  entries: SelectedEntry[];
  onQuantityChange: (itemId: string, qty: number) => void;
  onRemove: (itemId: string) => void;
  outgoing?: boolean;
}

export function SelectedItemsPanel({ entries, onQuantityChange, onRemove, outgoing = false }: Props) {
  const getDeptColor = useDeptColorLookup();
  if (entries.length === 0) return null;

  return (
    <div>
      {entries.map(({ item, quantity }) => {
        const stock = getStockState(Number(item.quantity), item.min_stock == null ? null : Number(item.min_stock));
        const deptBadge = itemCodeDeptBadge(item.item_code, getDeptColor);
        const expected = outgoing
          ? Number(item.quantity) - quantity
          : Number(item.quantity) + quantity;
        const isShortage = outgoing && expected < 0;
        const expectedColor =
          expected < 0 ? LEGACY_COLORS.red : expected === 0 ? LEGACY_COLORS.yellow : LEGACY_COLORS.green;

        return (
          <div
            key={item.item_id}
            className="grid grid-cols-[minmax(0,2fr)_minmax(70px,auto)_auto_minmax(72px,auto)_minmax(72px,auto)_32px] items-center gap-3 px-4 py-3"
            style={{
              borderBottom: `1px solid ${LEGACY_COLORS.border}`,
              background: isShortage
                ? `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`
                : "transparent",
            }}
          >
            {/* 품목명 + 품목 코드 */}
            <div className="min-w-0">
              <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                {item.item_name}
              </div>
              <div className="truncate text-[11px] font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                {item.item_code ?? "-"}
              </div>
            </div>
```
