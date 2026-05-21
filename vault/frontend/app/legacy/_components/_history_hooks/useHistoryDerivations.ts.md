---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_hooks/useHistoryDerivations.ts
tags: [vault, code-note, auto-generated, stub]
---

# useHistoryDerivations.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_history_hooks/useHistoryDerivations.ts]]

## 원본 첫 줄

```
"use client";

import { useMemo } from "react";
import type { Item, ProductModel, TransactionLog, TransactionType } from "@/lib/api";

export interface HistoryFilters {
  date: string;
  type: string;
  employee: string;
  model: string;
  search: string;
}

/**
 * mobile HistoryScreen 의 거래 로그 derivation chain.
 *
 * Round-10B (#5) 추출. logs/items/calendarLogs/filters 입력에 대해 다음 useMemo
 * chain 을 단일 hook 으로 묶었다:
 *   - parseEmployeeName / getPeriodStart / parseUtc / toDateKey 헬퍼
 *   - itemModelMap / employeeNames / modelNames
 *   - filteredLogs (filters 적용)
 *   - summary (count/inSum/outSum)
 *   - groupedByDay (date key 그룹)
 *   - calendarDayMap / calendarDays
 *
 * 동작 변화 0 — 기존 useMemo 호출 순서/dependency 그대로 보존.
 */

export function parseEmployeeName(value?: string | null) {
  if (!value) return "";
```
