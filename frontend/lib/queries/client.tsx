"use client";

/**
 * React Query Provider — W4-A.
 *
 * 작업자 인증 epoch마다 QueryClient를 하나씩 사용한다. provider는 로그인 복원에
 * 필요해 `MesLoginGate` 바깥에 있고, 401/logout 경계에서 기존 cache를 지운 뒤
 * 새 client로 교체한다.
 *
 * 기본 옵션:
 *  - staleTime 5분: 같은 쿼리를 5분간 fresh로 간주 (네트워크 호출 절감)
 *  - gcTime 30분: 구독 해제된 캐시를 30분간 유지
 *  - retry 1: 실패 시 1회 재시도
 *  - refetchOnWindowFocus false: 포커스마다 재요청 방지
 *  - mutations retry 0: 변경은 idempotent 보장 없으므로 재시도 안 함
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { AUTH_REQUIRED_EVENT } from "@/lib/api-core";
import { RealtimeSyncProvider } from "./realtime";

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

function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState(createQueryClient);

  useEffect(() => {
    const rotateActorScopedCache = () => {
      client.clear();
      setClient(createQueryClient());
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, rotateActorScopedCache);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, rotateActorScopedCache);
  }, [client]);

  return (
    <QueryClientProvider client={client}>
      <RealtimeSyncProvider>{children}</RealtimeSyncProvider>
    </QueryClientProvider>
  );
}
