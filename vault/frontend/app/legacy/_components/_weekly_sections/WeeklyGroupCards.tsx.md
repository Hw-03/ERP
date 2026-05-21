---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_weekly_sections/WeeklyGroupCards.tsx
tags: [vault, code-note, auto-generated, stub]
---

# WeeklyGroupCards.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_weekly_sections/WeeklyGroupCards.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { memo, useState } from "react";
import { LEGACY_COLORS, employeeColor } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import type { WeeklyGroupReport } from "@/lib/api/types/weekly";

// 0/무변동 값 de-emphasis — 단 WCAG AA 충족 필요(투명 30% 는 미달) → 솔리드 muted2(5.55:1).
const ZERO_FADE = LEGACY_COLORS.muted2;

interface Props {
  groups: WeeklyGroupReport[];
  selected: string;
  onSelect: (code: string) => void;
  cols?: 1;
}

function WeeklyGroupCardsImpl({ groups, selected, onSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 gap-1.5">
      {groups.map((g) => {
        const isActive = g.process_code === selected;
        const isHover = hovered === g.process_code;
        const isDecreasing = g.delta < 0;
        const isQuiet = g.delta === 0 && !isActive;
        const accentColor = employeeColor(g.dept_name);
        const tone = isDecreasing ? LEGACY_COLORS.red : accentColor;
```
