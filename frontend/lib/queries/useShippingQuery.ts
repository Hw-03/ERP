"use client";

/**
 * Shipping 도메인 React Query hook.
 *
 * useModelsQuery.ts 패턴을 그대로 따른다. 범위는 list query 1개만 — 생성/수정/
 * 삭제/상태전환은 DesktopShippingView.tsx 가 기존처럼 api.xxx()를 직접 호출하고
 * queryClient.setQueryData 로 낙관적 갱신한다(서버 재요청 없이 즉시 반영되는
 * 기존 UX를 유지하기 위함 — mutation 훅으로 감싸 invalidate만 하면 매 작업마다
 * refetch 왕복이 생겨 지금보다 느려진다).
 *
 * api 는 반드시 "@/lib/api"(집계 모듈)에서 가져온다 — shippingApi 를
 * "@/lib/api/shipping"에서 직접 import하지 않는다. DesktopShippingView.test.tsx가
 * "@/lib/api" 모듈 전체를 vi.mock 하므로, shippingApi를 직접 쓰면 그 mock 범위
 * 밖이라 테스트가 실제 네트워크를 타서 깨진다.
 *
 * 좌측 사이드바 탭 전환 flicker 수정: React Query 캐시(전역 staleTime 5분)로
 * 탭 재방문 시 재요청 없이 즉시 렌더.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "./keys";

export function useShippingRequestsQuery(params?: Parameters<typeof api.getShippingRequests>[0]) {
  return useQuery({
    queryKey: queryKeys.shipping.requests(params),
    queryFn: ({ signal }) => api.getShippingRequests(params, { signal }),
    placeholderData: [],
  });
}
