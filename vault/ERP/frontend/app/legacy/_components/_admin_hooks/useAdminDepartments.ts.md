---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_hooks/useAdminDepartments.ts
tags: [vault, code-note, auto-generated, stub]
---

# useAdminDepartments.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_hooks/useAdminDepartments.ts]]

## 원본 첫 줄

```
"use client";

import { useState } from "react";
import type { DepartmentMaster } from "@/lib/api";
import { api } from "@/lib/api";
import { employeeColor } from "@/lib/mes/color";
import { useRefreshDepartments } from "../DepartmentsContext";

export const COLOR_PALETTE = [
  "#1d4ed8", "#c2410c", "#6d28d9", "#0e7490",
  "#be185d", "#b45309", "#0f766e", "#4d7c0f",
  "#9333ea", "#0284c7", "#dc2626", "#059669",
];

function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h =
    max === r ? (g - b) / d + (g < b ? 6 : 0)
    : max === g ? (b - r) / d + 2
    : (r - g) / d + 4;
  return (h / 6) * 360;
}

function hueDist(a: number, b: number): number {
```
