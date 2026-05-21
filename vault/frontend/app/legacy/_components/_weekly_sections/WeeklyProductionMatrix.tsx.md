---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_weekly_sections/WeeklyProductionMatrix.tsx
tags: [vault, code-note, auto-generated, stub]
---

# WeeklyProductionMatrix.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_weekly_sections/WeeklyProductionMatrix.tsx]]

## 원본 첫 줄

```
"use client";

import React from "react";
import { LEGACY_COLORS, getDepartmentFallbackColor } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import type { WeeklyProductionModelRow } from "@/lib/api/types/weekly";

type NumCol = keyof Pick<
  WeeklyProductionModelRow,
  "tf_qty" | "hf_qty" | "vf_qty" | "nf_qty" | "af_qty" | "pf_qty"
>;

const COLS: { key: NumCol; label: string; dept: string }[] = [
  { key: "tf_qty", label: "튜브", dept: "튜브" },
  { key: "hf_qty", label: "고압", dept: "고압" },
  { key: "vf_qty", label: "진공", dept: "진공" },
  { key: "nf_qty", label: "튜닝", dept: "튜닝" },
  { key: "af_qty", label: "조립", dept: "조립" },
  { key: "pf_qty", label: "출하", dept: "출하" },
];

function fmt(n: number): string {
  return n === 0 ? "—" : Math.round(n).toLocaleString();
}

// 0 값 de-emphasis — WCAG AA 충족(투명 30% 는 미달) → 솔리드 muted2(5.55:1).
const ZERO_FADE = LEGACY_COLORS.muted2;

interface Props {
  rows: WeeklyProductionModelRow[];
```
