---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/_admin_primitives/AdminKpiBar.tsx
tags: [vault, code-note, auto-generated, stub]
---

# AdminKpiBar.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/_admin_primitives/AdminKpiBar.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { KpiCard } from "../../common/KpiCard";

export interface AdminKpiItem {
  key: string;
  label: string;
  value: string | number;
  hint?: string;
  tone: string;
  active?: boolean;
  onClick?: () => void;
}

export interface AdminKpiBarProps {
  items: AdminKpiItem[];
}

export function AdminKpiBar({ items }: AdminKpiBarProps) {
  if (items.length === 0) return null;
  return (
    <div
      className="mb-2 grid shrink-0 gap-2"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((kpi) => (
        <KpiCard
          key={kpi.key}
          label={kpi.label}
          value={kpi.value}
```
