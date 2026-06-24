"use client";

/**
 * React Query Provider — W4-A.
 *
 * 전역에서 단일 QueryClient를 사용. `frontend/app/mes/page.tsx`의
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

/**
 * 도메인별 staleTime 티어 (R2-1).
 *
 * 전역 기본은 그대로 5분(네트워크 절감 의도 유지). 아래 두 티어는
 * 각 queries 훅에서 queryKey 단위로 개별 override 할 때만 쓴다.
 *  - VOLATILE 30초: 자주 바뀌는 운영 데이터(재고/입출고/요청 대기열).
 *    mutation 은 항상 invalidate 하므로 같은 세션 내 갱신은 보장되고,
 *    이 값은 "다른 화면에서 들어왔을 때 얼마나 빨리 재요청하나"만 좌우한다.
 *  - MASTER 30분: 거의 안 바뀌는 마스터(부서/모델/직원). 재요청을 더 아낀다.
 */
export const STALE_TIME = {
  VOLATILE: 30_000,
  MASTER: 30 * 60_000,
} as const;

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
