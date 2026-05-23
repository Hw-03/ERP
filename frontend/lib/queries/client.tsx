"use client";

/**
 * React Query Provider — W4-A.
 *
 * 전역에서 단일 QueryClient를 사용. `frontend/app/legacy/page.tsx`의
 * `<AdminSessionProvider>` 안쪽에서 mount.
 *
 * 기본 옵션:
 *  - staleTime 5분: 같은 쿼리를 5분간 fresh로 간주 (네트워크 호출 절감)
 *  - gcTime 30분: 구독 해제된 캐시를 30분간 유지
 *  - retry 1: 실패 시 1회 재시도
 *  - refetchOnWindowFocus false: 포커스마다 재요청 방지
 *  - mutations retry 0: 변경은 idempotent 보장 없으므로 재시도 안 함
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

const defaultOptions = {
  queries: {
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  },
  mutations: { retry: 0 },
};

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions }));
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
