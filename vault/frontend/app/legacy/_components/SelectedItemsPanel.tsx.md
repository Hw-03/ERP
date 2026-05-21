---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/SelectedItemsPanel.tsx
status: active
updated: 2026-04-27
source_sha: 0cff61d508ec
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# SelectedItemsPanel.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/SelectedItemsPanel.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `6125` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_components|frontend/app/legacy/_components]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { GripVertical, X } from "lucide-react";
import { type Item } from "@/lib/api";
import { LEGACY_COLORS, erpCodeDeptBadge, formatNumber, getStockState } from "./legacyUi";

export type SelectedEntry = { item: Item; quantity: number };

interface Props {
  entries: SelectedEntry[];
  onQuantityChange: (itemId: string, qty: number) => void;
  onRemove: (itemId: string) => void;
  outgoing?: boolean;
}

export function SelectedItemsPanel({ entries, onQuantityChange, onRemove, outgoing = false }: Props) {
  if (entries.length === 0) return null;

  return (
    <div>
      {entries.map(({ item, quantity }) => {
        const stock = getStockState(Number(item.quantity), item.min_stock == null ? null : Number(item.min_stock));
        const deptBadge = erpCodeDeptBadge(item.erp_code);
        const expected = outgoing
          ? Number(item.quantity) - quantity
          : Number(item.quantity) + quantity;
        const isShortage = outgoing && expected < 0;
        const expectedColor =
          expected < 0 ? LEGACY_COLORS.red : expected === 0 ? LEGACY_COLORS.yellow : LEGACY_COLORS.green;

        return (
          <div
            key={item.item_id}
            className="grid grid-cols-[16px_minmax(0,2fr)_minmax(70px,auto)_auto_minmax(72px,auto)_minmax(72px,auto)_32px] items-center gap-3 px-4 py-3"
            style={{
# ... (이하 108줄 생략. 원본 참조)

````
