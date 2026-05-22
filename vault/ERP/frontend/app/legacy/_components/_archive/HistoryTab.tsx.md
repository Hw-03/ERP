---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_archive/HistoryTab.tsx
tags: [vault, code-note, auto-generated, stub]
---

# HistoryTab.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_archive/HistoryTab.tsx]]

## 원본 첫 줄

```
"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, ChevronLeft, ChevronRight, List, CalendarDays } from "lucide-react";
import { api, type Item, type TransactionLog, type TransactionType } from "@/lib/api";
import { FilterPills } from "./FilterPills";
import {
  LEGACY_COLORS,
  employeeColor,
  firstEmployeeLetter,
  formatNumber,
  normalizeModel,
  transactionColor,
  transactionLabel,
} from "./legacyUi";

const TYPE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "입고", value: "RECEIVE" },
  { label: "출고", value: "SHIP" },
  { label: "조정", value: "ADJUST" },
  { label: "생산입고", value: "PRODUCE" },
  { label: "자동차감", value: "BACKFLUSH" },
];

const DATE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "오늘", value: "TODAY" },
  { label: "이번주", value: "WEEK" },
  { label: "이번달", value: "MONTH" },
```
