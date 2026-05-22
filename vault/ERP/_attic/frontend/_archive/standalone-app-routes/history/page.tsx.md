---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/frontend/_archive/standalone-app-routes/history/page.tsx
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# page.tsx

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/frontend/_archive/standalone-app-routes/history/page.tsx]]

## 원본 첫 줄 (또는 메타)

```
"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CalendarRange, Pencil, ScrollText, Search } from "lucide-react";

import AppHeader from "@/components/AppHeader";
import { api, type TransactionLog, type TransactionType } from "@/lib/api";

const TYPE_OPTIONS: { label: string; value: TransactionType | "ALL" }[] = [
  { label: "전체",     value: "ALL" },
  { label: "입고",     value: "RECEIVE" },
  { label: "출고",     value: "SHIP" },
  { label: "생산입고", value: "PRODUCE" },
  { label: "조정",     value: "ADJUST" },
  { label: "자동차감", value: "BACKFLUSH" },
];

const PERIOD_OPTIONS = [
  { label: "전체",      value: "ALL" },
  { label: "오늘",      value: "TODAY" },
  { label: "이번 주",   value: "WEEK" },
  { label: "최근 30일", value: "MONTH" },
] as const;
type PeriodFilter = (typeof PERIOD_OPTIONS)[number]["value"];

```
