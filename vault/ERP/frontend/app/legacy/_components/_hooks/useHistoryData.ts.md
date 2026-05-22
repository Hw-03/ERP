---
type: file-explanation
source_path: "frontend/app/legacy/_components/_hooks/useHistoryData.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useHistoryData.ts — useHistoryData.ts 설명

## 이 파일은 무엇을 책임지나

`useHistoryData.ts`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useHistoryData`
- `TransactionLog`
- `UseHistoryDataArgs`
- `UseHistoryDataResult`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_hooks/📁__hooks]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type TransactionLog } from "@/lib/api";
import { HISTORY_PAGE_SIZE } from "../_history_sections/historyConstants";
import { dateFilterToFrom } from "../_history_sections/historyQuery";

export interface UseHistoryDataArgs {
  /** 거래 종류(필터 패널) 쉼표 결합. "" = 미적용(전체). 백엔드가 화면-구분 기준으로 해석. */
  operations: string;
  dateFilter: string;
  /** 부모(DesktopHistoryView)에서 350ms debounce 후 set 한 값. 목록/달력이 같은 값을 공유. */
  debouncedSearch: string;
  /** 달력에서 선택한 날짜 (YYYY-MM-DD). 있으면 dateFilter 무시하고 그날만 fetch. */
  selectedDateKey: string | null;
  /** 필터 패널 — 부서 쉼표 결합(다중). "" = 전체. */
  department: string;
  /** 필터 패널 — 제품 모델명 쉼표 결합. "" / 미지정 = 미적용. */
  model?: string;
}

export interface UseHistoryDataResult {
  logs: TransactionLog[];
  setLogs: React.Dispatch<React.SetStateAction<TransactionLog[]>>;
  loading: boolean;
  loadingMore: boolean;
  canLoadMore: boolean;
  loadMore: () => Promise<void>;
}

/**
 * 서버사이드 필터로 입출고 내역을 페이지네이션 조회.
 * - operations/dateFilter/debouncedSearch/department/model 변경 시 logs 초기화 + 재조회.
 * - canLoadMore = 마지막 응답 길이 === HISTORY_PAGE_SIZE.
 * - loadMore 중 조건이 바뀌면 stale 응답을 logs 에 append 하지 않음 (queryKey ref 가드).
 */
export function useHistoryData({
  operations,
  dateFilter,
  debouncedSearch,
  selectedDateKey,
  department,
  model = "",
}: UseHistoryDataArgs): UseHistoryDataResult {
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastBatchSize, setLastBatchSize] = useState<number | null>(null);
  const skipRef = useRef(0);

  const transactionTypes = operations || undefined;
  // selectedDateKey 가 있으면 dateFilter 를 무시하고 그날 단일로 좁힌다.
  const dateFrom = selectedDateKey ?? dateFilterToFrom(dateFilter);
  const dateTo = selectedDateKey ?? undefined;
  const search = debouncedSearch.trim() || undefined;
```
