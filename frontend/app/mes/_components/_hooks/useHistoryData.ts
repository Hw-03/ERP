"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { TransactionLog } from "@/lib/api";
import { productionApi } from "@/lib/api/production";
import { queryKeys } from "@/lib/queries/keys";
import { STALE_TIME } from "@/lib/queries/client";
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
 *
 * 좌측 사이드바 탭 전환 flicker 수정: 각 페이지(skip 단위) 조회를
 * queryClient.fetchQuery 로 감싸 React Query 캐시(queryKeys.transactions.list)를
 * 태운다. 탭 재방문 시 같은 필터 조합의 첫 페이지가 캐시에 남아 있으면 재요청
 * 없이 즉시 채워진다. logs 누적/loadMore/canLoadMore 는 기존과 동일하게 훅
 * 내부 로컬 state 로 관리 — useInfiniteQuery 로는 전환하지 않는다(필터 조합이
 * 6개라 페이지 캐시 무효화가 복잡해지고, 이번 목적은 flicker 제거이지
 * 페이지네이션 재설계가 아니기 때문).
 */
export function useHistoryData({
  operations,
  dateFilter,
  debouncedSearch,
  selectedDateKey,
  department,
  model = "",
}: UseHistoryDataArgs): UseHistoryDataResult {
  const queryClient = useQueryClient();

  const transactionTypes = operations || undefined;
  // selectedDateKey 가 있으면 dateFilter 를 무시하고 그날 단일로 좁힌다.
  const dateFrom = selectedDateKey ?? dateFilterToFrom(dateFilter);
  const dateTo = selectedDateKey ?? undefined;
  const search = debouncedSearch.trim() || undefined;
  const departmentParam = department || undefined;
  const modelParam = model || undefined;

  // queryKey: 조건 변화를 한 문자열로. stale 응답 가드용(React Query 캐시 key 와는 별개).
  const queryKey = `${transactionTypes ?? ""}|${dateFrom ?? ""}|${dateTo ?? ""}|${search ?? ""}|${departmentParam ?? ""}|${modelParam ?? ""}`;
  const queryKeyRef = useRef(queryKey);
  const skipRef = useRef(0);

  function pageParams(skip: number) {
    return {
      limit: HISTORY_PAGE_SIZE,
      skip,
      transactionTypes,
      dateFrom,
      dateTo,
      search,
      department: departmentParam,
      model: modelParam,
    };
  }

  // 첫 마운트 시 첫 페이지가 이미 React Query 캐시에 있으면(탭 재방문) 그
  // 값으로 즉시 시작 — loading=true 가 단 한 프레임도 뜨지 않게 하는 lazy
  // init. useState 초기화 함수는 최초 렌더에서 한 번만 실행되므로 여기서
  // 캐시를 동기적으로 읽어도 렌더당 비용이 들지 않는다.
  const [initialCached] = useState(() =>
    queryClient.getQueryData<TransactionLog[]>(queryKeys.transactions.list(pageParams(0))),
  );
  const [logs, setLogs] = useState<TransactionLog[]>(() => initialCached ?? []);
  const [loading, setLoading] = useState(() => initialCached === undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastBatchSize, setLastBatchSize] = useState<number | null>(() => initialCached?.length ?? null);
  const isFirstRunRef = useRef(true);

  // 조건 변화 → 초기화 + 재조회. 첫 페이지(skip=0)는 React Query 캐시를 경유해서
  // 같은 조합을 다시 볼 때(탭 재방문) 재요청 없이 즉시 채운다.
  useEffect(() => {
    queryKeyRef.current = queryKey;
    skipRef.current = 0;
    const myKey = queryKey;
    const params = pageParams(0);

    // 첫 실행(마운트)이고 위 lazy init 에서 이미 캐시를 반영했다면 logs/loading
    // 을 다시 초기화하지 않는다 — 화면은 그대로 두고 아래에서 백그라운드
    // 재검증(staleTime 경과 시)만 한다.
    const skipReset = isFirstRunRef.current && initialCached !== undefined;
    isFirstRunRef.current = false;
    if (!skipReset) {
      setLogs([]);
      setLastBatchSize(null);
      setLoading(true);
    }

    void queryClient
      .fetchQuery({
        queryKey: queryKeys.transactions.list(params),
        queryFn: ({ signal }) => productionApi.getTransactions(params, { signal }),
        staleTime: STALE_TIME.VOLATILE,
      })
      .then((data) => {
        if (queryKeyRef.current !== myKey) return; // stale
        setLogs(data);
        setLastBatchSize(data.length);
        setLoading(false);
      })
      .catch(() => {
        if (queryKeyRef.current !== myKey) return;
        setLoading(false);
      });
    // primitive 분해된 query string 으로 비교하므로 안전.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, queryClient]);

  const loadMore = useCallback(async () => {
    const myKey = queryKey;
    const nextSkip = skipRef.current + HISTORY_PAGE_SIZE;
    setLoadingMore(true);
    try {
      const params = pageParams(nextSkip);
      const more = await queryClient.fetchQuery({
        queryKey: queryKeys.transactions.list(params),
        queryFn: ({ signal }) => productionApi.getTransactions(params, { signal }),
        staleTime: STALE_TIME.VOLATILE,
      });
      if (queryKeyRef.current !== myKey) return; // stale — append 금지
      skipRef.current = nextSkip;
      setLogs((prev) => [...prev, ...more]);
      setLastBatchSize(more.length);
    } catch {
      // 에러는 무시 — 다음 시도에서 재요청 가능.
    } finally {
      if (queryKeyRef.current === myKey) setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionTypes, dateFrom, dateTo, search, departmentParam, modelParam, queryKey, queryClient]);

  const canLoadMore = lastBatchSize === HISTORY_PAGE_SIZE;

  return { logs, setLogs, loading, loadingMore, canLoadMore, loadMore };
}
