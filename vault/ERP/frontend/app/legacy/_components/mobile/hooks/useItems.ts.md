---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/hooks/useItems.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useItems.ts — useItems.ts 설명

## 이 파일은 무엇을 책임지나

`useItems.ts`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useItems`
- `Item`
- `ItemsFilters`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/hooks/📁_hooks]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Item } from "@/lib/api";

export type ItemsFilters = {
  search?: string;
  department?: string; // "ALL" or dept code
};

const PAGE_SIZE = 100;

function buildParams(filters: ItemsFilters, skip: number) {
  const params: Parameters<typeof api.getItems>[0] = { limit: PAGE_SIZE, skip };
  if (filters.department && filters.department !== "ALL") params.department = filters.department;
  const q = filters.search?.trim();
  if (q) params.search = q;
  return params;
}

// 5.3-B: 빠른 필터 변경 시 이전 요청을 abort 하여 마지막 결과만 반영. (CONTRACT.md 의 race 처리 패턴)
export function useItems(filters: ItemsFilters) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // 마지막으로 시작된 컨트롤러 (refetch / filter 변경 시 abort)
  const activeCtrlRef = useRef<AbortController | null>(null);

  const filterKey = JSON.stringify(filters);

  const fetchPage = useCallback(
    async (skip: number, append: boolean, ctrl: AbortController) => {
      // 직전 요청 abort — append 가 아닌 새 검색일 때만
      if (!append) {
        activeCtrlRef.current?.abort();
        activeCtrlRef.current = ctrl;
      }
      try {
        setLoading(true);
        const data = await api.getItems(buildParams(filters, skip), { signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        setItems((prev) => (append ? [...prev, ...data] : data));
        setHasMore(data.length === PAGE_SIZE);
        setError(null);
      } catch (err) {
        if ((err as Error)?.name === "AbortError" || ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : "품목을 불러오지 못했습니다.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterKey = JSON.stringify(filters) is the derived deps (Cat-A)
```
