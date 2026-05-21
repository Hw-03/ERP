---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/_inventory_sections/InventoryItemRow.tsx
status: active
updated: 2026-04-27
source_sha: 36d74799df6f
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# InventoryItemRow.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_inventory_sections/InventoryItemRow.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `6558` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_inventory_sections/_inventory_sections|frontend/app/legacy/_components/_inventory_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { memo } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { Item } from "@/lib/api";
import {
  LEGACY_COLORS,
  employeeColor,
  erpCodeDept,
  formatNumber,
  getStockState,
} from "../legacyUi";

function safeQty(item: Item) {
  const n = Number(item.quantity);
  return isNaN(n) ? 0 : n;
}

function getMinStock(item: Item) {
  return item.min_stock == null ? 0 : Number(item.min_stock);
}

type Props = {
  item: Item;
  selected: boolean;
  onSelect: (item: Item | null) => void;
};

function InventoryItemRowImpl({ item, selected, onSelect }: Props) {
  const minStock = getMinStock(item);
  const stock = getStockState(safeQty(item), minStock === 0 ? null : minStock);
  const qty = safeQty(item);
  const isCritical = qty <= 0 || (minStock > 0 && qty < minStock);

  // 재고 분포 게이지 segments
# ... (이하 144줄 생략. 원본 참조)

````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
