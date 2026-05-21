---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/mobile/primitives/MoreMenuRow.tsx
tags: [vault, code-note, auto-generated, stub]
---

# MoreMenuRow.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/mobile/primitives/MoreMenuRow.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import clsx from "clsx";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

export function MoreMenuRow({
  icon: Icon,
  label,
  description,
  badge,
  tone,
  onClick,
  disabled,
  className,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  badge?: string | number | null;
  tone?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const accent = tone ?? (LEGACY_COLORS.blue as string);
  return (
    <button
      type="button"
```
