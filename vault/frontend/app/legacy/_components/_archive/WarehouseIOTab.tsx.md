---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_archive/WarehouseIOTab.tsx
tags: [vault, code-note, auto-generated, stub]
---

# WarehouseIOTab.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_archive/WarehouseIOTab.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { api, type Employee, type Item } from "@/lib/api";
import { BottomSheet } from "./BottomSheet";
import type { ToastState } from "./Toast";
import {
  LEGACY_COLORS,
  buildItemSearchLabel,
  employeeColor,
  firstEmployeeLetter,
  formatNumber,
  normalizeDepartment,
} from "./legacyUi";

type WMode = "wh2d" | "d2wh" | "whin";

const MODES: { id: WMode; icon: string; label: string }[] = [
  { id: "wh2d", icon: "🏭→🔧", label: "창고→생산부" },
  { id: "d2wh", icon: "🔧→🏭", label: "생산부→창고" },
  { id: "whin", icon: "📥", label: "창고 입고" },
];

function previewFlow(mode: WMode) {
  if (mode === "wh2d") return { from: "🏭 창고", to: "🔧 생산부" };
  if (mode === "d2wh") return { from: "🔧 생산부", to: "🏭 창고" };
  return { from: "🚚 외부", to: "🏭 창고" };
}

```
