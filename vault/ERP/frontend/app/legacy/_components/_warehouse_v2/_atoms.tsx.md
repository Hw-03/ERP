---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/_atoms.tsx
tags: [vault, code-note, auto-generated, stub]
---

# _atoms.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_warehouse_v2/_atoms.tsx]]

## 원본 첫 줄

```
"use client";

import { useEffect, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { AppSelect, type AppSelectOption } from "../common/AppSelect";

// ─────────────────────── 내부 atom: LabeledSelect ──────────────────

export function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: AppSelectOption[];
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </span>
      <AppSelect
        value={value}
        onChange={onChange}
        options={options}
        size="sm"
```
