---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/mobile/primitives/QuickActionGrid.tsx
tags: [vault, code-note, auto-generated, stub]
---

# QuickActionGrid.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/mobile/primitives/QuickActionGrid.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

export interface QuickAction {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  tone?: string;
  onClick: () => void;
  disabled?: boolean;
}

export function QuickActionGrid({
  actions,
  columns = 2,
  className,
}: {
  actions: QuickAction[];
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={clsx("grid gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
```
