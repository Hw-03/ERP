---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_archive/InventoryTab.tsx
tags: [vault, code-note, auto-generated, stub]
---

# InventoryTab.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_archive/InventoryTab.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { api, type Item, type ProductModel } from "@/lib/api";
import { FilterPills } from "./FilterPills";
import { ItemDetailSheet } from "./ItemDetailSheet";
import type { ToastState } from "./Toast";
import {
  LEGACY_COLORS,
  itemCodeDeptBadge,
  formatNumber,
  getStockState,
  normalizeModel,
} from "./legacyUi";

const DEPT_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "창고", value: "창고" },
  { label: "튜브", value: "튜브" },
  { label: "고압", value: "고압" },
  { label: "진공", value: "진공" },
  { label: "튜닝", value: "튜닝" },
  { label: "조립", value: "조립" },
  { label: "출하", value: "출하" },
];

const STATIC_MODEL_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "공용", value: "공용" },
];
```
