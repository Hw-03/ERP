---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/_admin_primitives/AdminDetailCard.tsx
tags: [vault, code-note, auto-generated, stub]
---

# AdminDetailCard.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/_admin_primitives/AdminDetailCard.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import type { ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export interface AdminDetailTab {
  id: string;
  label: string;
}

export interface AdminDetailCardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  tabs?: AdminDetailTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  children: ReactNode;
}

export function AdminDetailCard({
  title,
  subtitle,
  status,
  actions,
  tabs,
  activeTab,
  onTabChange,
  children,
```
