---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/hooks/useMobileHistoryAux.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useMobileHistoryAux.ts — useMobileHistoryAux.ts 설명

## 이 파일은 무엇을 책임지나

`useMobileHistoryAux.ts`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useMobileHistoryAux`
- `Item`
- `ProductModel`
- `TransactionLog`
- `UseMobileHistoryAuxOptions`
- `UseMobileHistoryAuxResult`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/hooks/📁_hooks]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
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

export function useMobileHistoryAux(opts: UseMobileHistoryAuxOptions): UseMobileHistoryAuxResult {
  const { viewMode, calendarYear, calendarMonth } = opts;
  const [items, setItems] = useState<Item[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [calendarLogs, setCalendarLogs] = useState<TransactionLog[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // items + productModels: mount 시 1회 (필터 옵션 용도)
  useEffect(() => {
    void api.getItems({ limit: 2000 }).then(setItems).catch(() => {});
    void api.getModels().then(setProductModels).catch(() => {});
  }, []);

  // calendar logs: viewMode/year/month 변화 시
  useEffect(() => {
    if (viewMode !== "calendar") return;
    setCalendarLoading(true);
    void fetchMonthLogs(calendarYear, calendarMonth)
      .then(setCalendarLogs)
      .finally(() => setCalendarLoading(false));
  }, [viewMode, calendarYear, calendarMonth]);

  return { items, productModels, calendarLogs, calendarLoading };
}
```
