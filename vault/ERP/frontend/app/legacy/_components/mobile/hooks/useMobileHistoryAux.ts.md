---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/mobile/hooks/useMobileHistoryAux.ts
tags: [vault, code-note, auto-generated, stub]
---

# useMobileHistoryAux.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/mobile/hooks/useMobileHistoryAux.ts]]

## 원본 첫 줄

```
"use client";

import { useEffect, useState } from "react";
import { api, type Item, type ProductModel, type TransactionLog } from "@/lib/api";
import { fetchMonthLogs } from "./useTransactions";

/**
 * 모바일 HistoryScreen 의 보조 데이터 fetch 훅.
 *
 * Round-8 (R8-3) 추출. 2 useState + 2 useEffect 를 묶었다:
 *   - items: mount 시 1회 fetch (필터 모달의 품목 옵션)
 *   - calendarLogs: viewMode==="calendar" + year/month 변화 시 fetch
 *
 * 메인 거래 로그 fetch 는 기존 useTransactions 훅 그대로 사용.
 *
 * fetch 타이밍 변화 0.
 */
export interface UseMobileHistoryAuxOptions {
  viewMode: "list" | "calendar";
  calendarYear: number;
  calendarMonth: number;
}

export interface UseMobileHistoryAuxResult {
  items: Item[];
  productModels: ProductModel[];
  calendarLogs: TransactionLog[];
  calendarLoading: boolean;
}

```
