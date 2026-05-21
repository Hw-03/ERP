---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/mobile/primitives/ItemRow.tsx
status: active
updated: 2026-04-27
source_sha: fa9158562b2f
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# ItemRow.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/ItemRow.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `3437` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/primitives/primitives|frontend/app/legacy/_components/mobile/primitives]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import clsx from "clsx";
import { Check } from "lucide-react";
import type { Item } from "@/lib/api";
import {
  erpCodeDeptBadge,
  formatErpCode,
  formatNumber,
  getStockState,
  LEGACY_COLORS,
} from "../../legacyUi";
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
  const state = getStockState(Number(item.quantity), item.min_stock);
  const deptBadge = erpCodeDeptBadge(item.erp_code);
  const erpCompact = formatErpCode(item.erp_code);
# ... (이하 78줄 생략. 원본 참조)

````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
