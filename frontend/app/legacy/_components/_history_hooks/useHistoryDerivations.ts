"use client";

import { useMemo } from "react";
import type { Item, TransactionLog, TransactionType } from "@/lib/api";
import { normalizeModel } from "@/lib/mes/item";
import type { HistoryFilters } from "../mobile/screens/HistoryFilterSheet";

/**
 * mobile HistoryScreen 의 거래 로그 derivation chain.
 *
 * Round-10B (#5) 추출. logs/items/calendarLogs/filters 입력에 대해 다음 useMemo
 * chain 을 단일 hook 으로 묶었다:
 *   - parseEmployeeName / getPeriodStart / parseUtc / toDateKey 헬퍼
 *   - itemModelMap / employeeNames / modelNames
 *   - filteredLogs (filters 적용)
 *   - summary (count/inSum/outSum)
 *   - groupedByDay (date key 그룹)
 *   - calendarDayMap / calendarDays
 *
 * 동작 변화 0 — 기존 useMemo 호출 순서/dependency 그대로 보존.
 */

export function parseEmployeeName(value?: string | null) {
  if (!value) return "";
  return value.split("(")[0]?.trim() ?? value;
}

export function parseUtc(iso: string) {
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
}

export function toDateKey(iso: string) {
  const d = parseUtc(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getPeriodStart(value: string) {
  const now = new Date();
  if (value === "TODAY") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (value === "WEEK") {
    const copy = new Date(now);
    const day = copy.getDay();
    copy.setDate(copy.getDate() - day);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
  if (value === "MONTH") return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

export interface HistorySummary {
  total: number;
  inSum: number;
  outSum: number;
}

export interface UseHistoryDerivationsResult {
  itemModelMap: Map<string, string>;
  employeeNames: string[];
  modelNames: string[];
  filteredLogs: TransactionLog[];
  summary: HistorySummary;
  groupedByDay: [string, TransactionLog[]][];
  calendarDayMap: Map<string, TransactionLog[]>;
  calendarDays: (number | null)[];
}

export function useHistoryDerivations(
  logs: TransactionLog[],
  filters: HistoryFilters,
  items: Item[],
  calendarLogs: TransactionLog[],
  calendarYear: number,
  calendarMonth: number,
): UseHistoryDerivationsResult {
  const itemModelMap = useMemo(
    () => new Map(items.map((item) => [item.item_id, normalizeModel(item.legacy_model)])),
    [items],
  );

  const employeeNames = useMemo(() => {
    const names = Array.from(
      new Set(logs.map((l) => parseEmployeeName(l.produced_by)).filter(Boolean)),
    );
    return names.sort((a, b) => a.localeCompare(b, "ko-KR"));
  }, [logs]);

  const modelNames = useMemo(() => {
    const names = Array.from(new Set(logs.map((l) => itemModelMap.get(l.item_id) ?? "공용")));
    return names.sort((a, b) => a.localeCompare(b, "ko-KR"));
  }, [itemModelMap, logs]);

  const filteredLogs = useMemo(() => {
    const start = getPeriodStart(filters.date);
    return logs.filter((log) => {
      if (filters.type !== "ALL" && log.transaction_type !== (filters.type as TransactionType))
        return false;
      if (filters.employee !== "ALL" && parseEmployeeName(log.produced_by) !== filters.employee)
        return false;
      if (filters.model !== "ALL" && (itemModelMap.get(log.item_id) ?? "공용") !== filters.model)
        return false;
      if (start && parseUtc(log.created_at) < start) return false;
      if (filters.search.trim()) {
        const k = filters.search.trim().toLowerCase();
        const hay = `${log.item_name} ${log.erp_code} ${log.reference_no ?? ""} ${log.notes ?? ""}`.toLowerCase();
        if (!hay.includes(k)) return false;
      }
      return true;
    });
  }, [logs, filters, itemModelMap]);

  const summary = useMemo<HistorySummary>(() => {
    const total = filteredLogs.length;
    const inSum = filteredLogs
      .filter((l) => l.transaction_type === "RECEIVE" || l.transaction_type === "PRODUCE")
      .reduce((a, l) => a + Math.abs(Number(l.quantity_change)), 0);
    const outSum = filteredLogs
      .filter((l) => l.transaction_type === "SHIP" || l.transaction_type === "BACKFLUSH")
      .reduce((a, l) => a + Math.abs(Number(l.quantity_change)), 0);
    return { total, inSum, outSum };
  }, [filteredLogs]);

  const groupedByDay = useMemo<[string, TransactionLog[]][]>(() => {
    const map = new Map<string, TransactionLog[]>();
    for (const log of filteredLogs) {
      const key = toDateKey(log.created_at);
      const arr = map.get(key) ?? [];
      arr.push(log);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filteredLogs]);

  const calendarDayMap = useMemo(() => {
    const map = new Map<string, TransactionLog[]>();
    for (const log of calendarLogs) {
      const key = toDateKey(log.created_at);
      const arr = map.get(key) ?? [];
      arr.push(log);
      map.set(key, arr);
    }
    return map;
  }, [calendarLogs]);

  const calendarDays = useMemo<(number | null)[]>(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarYear, calendarMonth]);

  return {
    itemModelMap,
    employeeNames,
    modelNames,
    filteredLogs,
    summary,
    groupedByDay,
    calendarDayMap,
    calendarDays,
  };
}
