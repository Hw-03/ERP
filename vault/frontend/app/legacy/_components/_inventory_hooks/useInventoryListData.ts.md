---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_inventory_hooks/useInventoryListData.ts
tags: [vault, code-note, auto-generated, stub]
---

# useInventoryListData.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_inventory_hooks/useInventoryListData.ts]]

## 원본 첫 줄

```
"use client";

import { useDeferredValue, useMemo } from "react";
import type { Item } from "@/lib/api";
import { getStockState } from "@/lib/mes/inventory";
import { useItems } from "../mobile/hooks/useItems";

export interface InventoryFilters {
  department: string;
  kpi: "OK" | "LOW" | "ZERO";
  itemType: "RAW" | "SEMI" | "FIXED";
  modelSlot: null | number;
  grouped: boolean;
}

/**
 * mobile InventoryScreen 의 derivation chain.
 *
 * Round-10B (#3) 추출. search + filters 입력에 대해 useItems → filtered →
 * grouped rows → totals 까지 한 번에 정리. 컴포넌트는 상태(useState) 만
 * 갖고 있으면 되고, 본 hook 의 반환값으로 화면을 그린다.
 *
 * fetch/필터 동작 변화 0 — 기존 useState/useMemo/useDeferredValue 호출
 * 순서 그대로 보존.
 */

const R_SUFFIX = (code: string | null) => code?.endsWith("R") ?? false;
const A_SUFFIX = (code: string | null) => code?.endsWith("A") ?? false;
const F_SUFFIX = (code: string | null) => code?.endsWith("F") ?? false;

```
