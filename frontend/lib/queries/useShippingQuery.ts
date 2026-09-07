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

import { useMemo } from "react";
import { useInfiniteQuery, useQuery, type InfiniteData } from "@tanstack/react-query";
import {
  api,
  type ShippingHistoryParams,
  type ShippingRequest,
  type ShippingRequestPage,
  type ShippingRequestPageParams,
} from "@/lib/api";
import { STALE_TIME } from "./client";
import { queryKeys } from "./keys";

type ShippingRequestsQueryOptions = {
  live?: boolean;
};

const SHIPPING_PAGE_SIZE = 50;

export type ShippingPagesCache = InfiniteData<ShippingRequestPage, string | null>;

export function flattenShippingPages(data: ShippingPagesCache | undefined): ShippingRequest[] {
  const seen = new Set<string>();
  return (data?.pages ?? []).flatMap((page) => page.requests.filter((request) => {
    if (seen.has(request.request_id)) return false;
    seen.add(request.request_id);
    return true;
  }));
}

export function upsertShippingPageRequest(
  data: ShippingPagesCache | undefined,
  next: ShippingRequest,
): ShippingPagesCache | undefined {
  if (!data || data.pages.length === 0) {
    return {
      pages: [{ requests: [next], next_cursor: null, has_more: false }],
      pageParams: [null],
    };
  }
  const pages = data.pages.map((page) => ({
    ...page,
    requests: page.requests.filter((request) => request.request_id !== next.request_id),
  }));
  pages[0] = { ...pages[0], requests: [next, ...pages[0].requests] };
  return { ...data, pages };
}

export function removeShippingPageRequest(
  data: ShippingPagesCache | undefined,
  requestId: string,
): ShippingPagesCache | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      requests: page.requests.filter((request) => request.request_id !== requestId),
    })),
  };
}

export function useShippingRequestPagesQuery(
  params: Omit<ShippingRequestPageParams, "cursor"> = {},
  options: ShippingRequestsQueryOptions = {},
) {
  const live = options.live === true;
  const queryKey = queryKeys.shipping.requestPages(params);
  const query = useInfiniteQuery<
    ShippingRequestPage,
    Error,
    ShippingPagesCache,
    typeof queryKey,
    string | null
  >({
    queryKey,
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => api.getShippingRequestPage({
      ...params,
      cursor: pageParam ?? undefined,
      limit: params.limit ?? SHIPPING_PAGE_SIZE,
    }, { signal }),
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.next_cursor : null,
    placeholderData: { pages: [], pageParams: [] },
    ...(live
      ? {
          refetchOnMount: "always" as const,
          refetchOnWindowFocus: false,
          refetchInterval: STALE_TIME.VOLATILE,
          staleTime: STALE_TIME.VOLATILE,
        }
      : {}),
    refetchIntervalInBackground: false,
  });
  const requests = useMemo(() => flattenShippingPages(query.data), [query.data]);
  return { ...query, requests };
}

export function useShippingHistoryPagesQuery(
  params: Omit<ShippingHistoryParams, "cursor"> = {},
  enabled = true,
) {
  const queryKey = queryKeys.shipping.historyPages(params);
  const query = useInfiniteQuery<
    ShippingRequestPage,
    Error,
    ShippingPagesCache,
    typeof queryKey,
    string | null
  >({
    queryKey,
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => api.getShippingHistory({
      ...params,
      cursor: pageParam ?? undefined,
      limit: params.limit ?? SHIPPING_PAGE_SIZE,
    }, { signal }),
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.next_cursor : null,
    enabled,
    placeholderData: { pages: [], pageParams: [] },
  });
  const requests = useMemo(() => flattenShippingPages(query.data), [query.data]);
  return { ...query, requests };
}

export function useShippingRequestsQuery(
  params?: Parameters<typeof api.getShippingRequests>[0],
  options: ShippingRequestsQueryOptions = {},
) {
  const live = options.live === true;
  return useQuery({
    queryKey: queryKeys.shipping.requests(params),
    queryFn: ({ signal }) => api.getShippingRequests(params, { signal }),
    placeholderData: [],
    ...(live
      ? {
          refetchOnMount: "always" as const,
          refetchOnWindowFocus: false,
          refetchInterval: STALE_TIME.VOLATILE,
          staleTime: STALE_TIME.VOLATILE,
        }
      : {}),
    refetchIntervalInBackground: false,
  });
}

export function useShippingHistoryQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.shipping.history(),
    queryFn: () => api.getShippingHistory(),
    enabled,
    placeholderData: [],
  });
}

export function useShippingRevisionsQuery(requestId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.shipping.revisions(requestId ?? ""),
    queryFn: ({ signal }) => api.getShippingRevisions(requestId!, { signal }),
    enabled: Boolean(requestId) && enabled,
    placeholderData: [],
  });
}
