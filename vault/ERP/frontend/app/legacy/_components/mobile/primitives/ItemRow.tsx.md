---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/primitives/ItemRow.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# ItemRow.tsx — ItemRow.tsx 설명

## 이 파일은 무엇을 책임지나

`ItemRow.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `ItemRow`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/primitives/📁_primitives]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import clsx from "clsx";
import { Check } from "lucide-react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { itemCodeDeptBadge } from "@/lib/mes/process";
import { getStockState } from "@/lib/mes/inventory";
import { formatItemCode, formatQty } from "@/lib/mes/format";
import { useDeptColorLookup } from "../../DepartmentsContext";
import { TYPO } from "../tokens";
import { StatusBadge } from "./StatusBadge";

export function ItemRow({
  item,
  onClick,
  selected = false,
  showCheckbox = false,
  right,
  dense = false,
  className,
}: {
  item: Item;
  onClick?: () => void;
  selected?: boolean;
  showCheckbox?: boolean;
  right?: React.ReactNode;
  dense?: boolean;
  className?: string;
}) {
  const getDeptColor = useDeptColorLookup();
  const state = getStockState(Number(item.quantity), item.min_stock);
  const deptBadge = itemCodeDeptBadge(item.item_code, getDeptColor);
  const itemCompact = formatItemCode(item.item_code);

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-3 rounded-[20px] border px-3 text-left active:scale-[0.99]",
        dense ? "py-[10px]" : "py-3",
        className,
      )}
      style={{
        background: selected ? `${LEGACY_COLORS.blue as string}14` : LEGACY_COLORS.s2,
        borderColor: selected ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
      }}
    >
      {showCheckbox ? (
        // 시각 22×22 유지 + 외곽 44×44 hit-area (WCAG 2.5.5)
        <span
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center"
          aria-hidden
        >
```
