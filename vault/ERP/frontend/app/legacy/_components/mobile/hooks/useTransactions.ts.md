---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/hooks/useTransactions.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useTransactions.ts — useTransactions.ts 설명

## 이 파일은 무엇을 책임지나

`useTransactions.ts`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useTransactions`
- `TransactionLog`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/hooks/📁_hooks]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type TransactionLog } from "@/lib/api";

const PAGE_SIZE = 100;

// 5.5-F: AbortController 마이그 — 빠른 refetch 충돌 시 마지막 결과만 반영.
// (CONTRACT.md 의 list hook 표준 패턴)
export function useTransactions() {
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const activeCtrlRef = useRef<AbortController | null>(null);

  const refetch = useCallback(async () => {
    activeCtrlRef.current?.abort();
    const ctrl = new AbortController();
    activeCtrlRef.current = ctrl;
    setLoading(true);
    try {
      const data = await api.getTransactions({ limit: PAGE_SIZE, skip: 0 }, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setLogs(data);
      setHasMore(data.length === PAGE_SIZE);
      setPage(1);
      setError(null);
    } catch (err) {
      if ((err as Error)?.name === "AbortError" || ctrl.signal.aborted) return;
      setError(err instanceof Error ? err.message : "이력을 불러오지 못했습니다.");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
    return () => activeCtrlRef.current?.abort();
  }, [refetch]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    // 5.6-B: 이전 inflight (refetch 또는 loadMore) 가 있으면 취소 + ref 보관 →
    // unmount cleanup (useEffect) 에서 동일 ref 로 abort 가능.
    activeCtrlRef.current?.abort();
    const ctrl = new AbortController();
    activeCtrlRef.current = ctrl;
    const next = page + 1;
    setPage(next);
    setLoading(true);
    try {
      const data = await api.getTransactions(
```
