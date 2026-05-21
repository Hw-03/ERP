---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/SidebarButton.tsx
tags: [vault, code-note, auto-generated, stub]
---

# SidebarButton.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/SidebarButton.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import type { ElementType } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export interface SidebarEntry {
  id: string;
  label: string;
  description: string;
  icon: ElementType;
}

export interface SidebarButtonProps {
  entry: SidebarEntry;
  active: boolean;
  onClick: () => void;
  danger?: boolean;
}

export function SidebarButton({
  entry,
  active,
  onClick,
  danger = false,
}: SidebarButtonProps) {
  const Icon = entry.icon;
  const tone = danger ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
  return (
    <button
      type="button"
```
