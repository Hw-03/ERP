---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/mobile/hooks/useTransactions.ts
status: active
updated: 2026-04-27
source_sha: 287871707816
tags:
  - erp
  - frontend
  - frontend-hook
  - ts
---

# useTransactions.ts

> [!summary] 역할
> 프론트엔드 화면에서 상태, 데이터 로딩, 상호작용 흐름을 재사용하기 위한 React hook이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/hooks/useTransactions.ts`
- Layer: `frontend`
- Kind: `frontend-hook`
- Size: `3159` bytes

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
# ... (이하 47줄 생략. 원본 참조)

````
