---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/_admin_primitives/AdminListPanel.tsx
tags: [vault, code-note, auto-generated, stub]
---

# AdminListPanel.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/_admin_primitives/AdminListPanel.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState } from "../../common/EmptyState";

export interface AdminListPanelProps<T> {
  title?: string;
  countLabel?: string;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  filters?: ReactNode;
  action?: ReactNode;
  items: T[];
  renderItem: (item: T) => ReactNode;
  emptyState?: ReactNode;
  footer?: ReactNode;
  width?: number | string;
}

export function AdminListPanel<T>({
  title,
  countLabel,
  searchValue,
  searchPlaceholder = "검색...",
  onSearchChange,
  filters,
  action,
```
