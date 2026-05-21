---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/_admin_primitives/AdminPageHeader.tsx
tags: [vault, code-note, auto-generated, stub]
---

# AdminPageHeader.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/_admin_primitives/AdminPageHeader.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import type { ElementType, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export interface AdminPageHeaderProps {
  icon: ElementType;
  title: string;
  description?: string;
  actions?: ReactNode;
  danger?: boolean;
}

export function AdminPageHeader({
  icon: Icon,
  title,
  description,
  actions,
  danger = false,
}: AdminPageHeaderProps) {
  const tone = danger ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]"
          style={{
            background: `color-mix(in srgb, ${tone} 14%, transparent)`,
            color: tone,
```
