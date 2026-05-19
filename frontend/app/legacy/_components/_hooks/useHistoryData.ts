"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type TransactionLog } from "@/lib/api";
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
 */
export function useHistoryData({
  operations,
  dateFilter,
  debouncedSearch,
  selectedDateKey,
  department,
  model = "",
}: UseHistoryDataArgs): UseHistoryDataResult {
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastBatchSize, setLastBatchSize] = useState<number | null>(null);
  const skipRef = useRef(0);

  const transactionTypes = operations || undefined;
  // selectedDateKey 가 있으면 dateFilter 를 무시하고 그날 단일로 좁힌다.
  const dateFrom = selectedDateKey ?? dateFilterToFrom(dateFilter);
  const dateTo = selectedDateKey ?? undefined;
  const search = debouncedSearch.trim() || undefined;
  const departmentParam = department || undefined;
  const modelParam = model || undefined;

  // queryKey: 조건 변화를 한 문자열로. stale 응답 가드용.
  const queryKey = `${transactionTypes ?? ""}|${dateFrom ?? ""}|${dateTo ?? ""}|${search ?? ""}|${departmentParam ?? ""}|${modelParam ?? ""}`;
  const queryKeyRef = useRef(queryKey);
  // loadMore 가 사용하는 abort controller. 새 조건 effect 발동 시 abort.
  const loadMoreCtrlRef = useRef<AbortController | null>(null);

  // 조건 변화 → 초기화 + 재조회
  useEffect(() => {
    queryKeyRef.current = queryKey;
    skipRef.current = 0;
    setLogs([]);
    setLastBatchSize(null);

    // 진행 중이던 더보기 요청 abort.
    loadMoreCtrlRef.current?.abort();
    loadMoreCtrlRef.current = null;

    setLoading(true);
    const ctrl = new AbortController();
    const myKey = queryKey;
    void api
      .getTransactions(
        {
          limit: HISTORY_PAGE_SIZE,
          skip: 0,
          transactionTypes,
          dateFrom,
          dateTo,
          search,
          department: departmentParam,
          model: modelParam,
        },
        { signal: ctrl.signal },
      )
      .then((data) => {
        if (queryKeyRef.current !== myKey) return; // stale
        setLogs(data);
        setLastBatchSize(data.length);
        setLoading(false);
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        if (queryKeyRef.current !== myKey) return;
        setLoading(false);
      });
    return () => ctrl.abort();
    // primitive 분해된 query string 으로 비교하므로 안전.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const loadMore = useCallback(async () => {
    const myKey = queryKey;
    const nextSkip = skipRef.current + HISTORY_PAGE_SIZE;
    setLoadingMore(true);
    const ctrl = new AbortController();
    loadMoreCtrlRef.current = ctrl;
    try {
      const more = await api.getTransactions(
        {
          limit: HISTORY_PAGE_SIZE,
          skip: nextSkip,
          transactionTypes,
          dateFrom,
          dateTo,
          search,
          department: departmentParam,
          model: modelParam,
        },
        { signal: ctrl.signal },
      );
      if (queryKeyRef.current !== myKey) return; // stale — append 금지
      skipRef.current = nextSkip;
      setLogs((prev) => [...prev, ...more]);
      setLastBatchSize(more.length);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      // 다른 에러는 무시 — 다음 시도에서 재요청 가능.
    } finally {
      // current key 와 일치할 때만 loadingMore 내림 (stale 시엔 새 effect 가 처리).
      if (queryKeyRef.current === myKey) setLoadingMore(false);
      if (loadMoreCtrlRef.current === ctrl) loadMoreCtrlRef.current = null;
    }
  }, [transactionTypes, dateFrom, dateTo, search, departmentParam, modelParam, queryKey]);

  const canLoadMore = lastBatchSize === HISTORY_PAGE_SIZE;

  return { logs, setLogs, loading, loadingMore, canLoadMore, loadMore };
}
