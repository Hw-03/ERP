---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/hooks/useItems.ts
status: active
updated: 2026-04-27
source_sha: e5bc618c83b5
tags:
  - erp
  - frontend
  - frontend-hook
  - ts
---

# useItems.ts

> [!summary] 역할
> 프론트엔드 화면에서 상태, 데이터 로딩, 상호작용 흐름을 재사용하기 위한 React hook이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/hooks/useItems.ts`
- Layer: `frontend`
- Kind: `frontend-hook`
- Size: `3051` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/hooks/hooks|frontend/app/legacy/_components/mobile/hooks]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Item } from "@/lib/api";

export type ItemsFilters = {
  search?: string;
  department?: string; // "ALL" or dept code
  legacyModel?: string; // "ALL" or model name
};

const PAGE_SIZE = 100;

function buildParams(filters: ItemsFilters, skip: number) {
  const params: Parameters<typeof api.getItems>[0] = { limit: PAGE_SIZE, skip };
  if (filters.department && filters.department !== "ALL") params.department = filters.department;
  if (filters.legacyModel && filters.legacyModel !== "ALL") params.legacyModel = filters.legacyModel;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterKey],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    setPage(1);
    void fetchPage(0, false, ctrl);
    return () => {
      ctrl.abort();
    };
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    const ctrl = new AbortController();
    void fetchPage((nextPage - 1) * PAGE_SIZE, true, ctrl);
  }, [hasMore, loading, page, fetchPage]);

  const refetch = useCallback(() => {
    const ctrl = new AbortController();
    setPage(1);
    void fetchPage(0, false, ctrl);
  }, [fetchPage]);

  return { items, loading, error, hasMore, loadMore, refetch };
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
