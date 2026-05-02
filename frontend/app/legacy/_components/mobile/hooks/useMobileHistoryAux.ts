"use client";

import { useEffect, useState } from "react";
import { api, type Item, type TransactionLog } from "@/lib/api";
import { fetchMonthLogs } from "./useTransactions";

/**
 * 모바일 HistoryScreen 의 보조 데이터 fetch 훅.
 *
 * Round-8 (R8-3) 추출. 2 useState + 2 useEffect 를 묶었다:
 *   - items: mount 시 1회 fetch (필터 모달의 품목 옵션)
 *   - calendarLogs: viewMode==="calendar" + year/month 변화 시 fetch
 *
 * 메인 거래 로그 fetch 는 기존 useTransactions 훅 그대로 사용.
 *
 * fetch 타이밍 변화 0.
 */
export interface UseMobileHistoryAuxOptions {
  viewMode: "list" | "calendar";
  calendarYear: number;
  calendarMonth: number;
}

export interface UseMobileHistoryAuxResult {
  items: Item[];
  calendarLogs: TransactionLog[];
  calendarLoading: boolean;
}

export function useMobileHistoryAux(opts: UseMobileHistoryAuxOptions): UseMobileHistoryAuxResult {
  const { viewMode, calendarYear, calendarMonth } = opts;
  const [items, setItems] = useState<Item[]>([]);
  const [calendarLogs, setCalendarLogs] = useState<TransactionLog[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // items: mount 시 1회 (필터 옵션 용도)
  useEffect(() => {
    void api
      .getItems({ limit: 2000 })
      .then(setItems)
      .catch(() => {});
  }, []);

  // calendar logs: viewMode/year/month 변화 시
  useEffect(() => {
    if (viewMode !== "calendar") return;
    setCalendarLoading(true);
    void fetchMonthLogs(calendarYear, calendarMonth)
      .then(setCalendarLogs)
      .finally(() => setCalendarLoading(false));
  }, [viewMode, calendarYear, calendarMonth]);

  return { items, calendarLogs, calendarLoading };
}
