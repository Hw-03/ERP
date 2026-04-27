---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/screens/HistoryScreen.tsx
status: active
updated: 2026-04-27
source_sha: 8996f93b3487
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# HistoryScreen.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/screens/HistoryScreen.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `22720` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/screens/screens|frontend/app/legacy/_components/mobile/screens]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

> 전체 577줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Filter,
  History as HistoryIcon,
  List,
} from "lucide-react";
import { api, type Item, type TransactionLog, type TransactionType } from "@/lib/api";
import {
  LEGACY_COLORS,
  formatNumber,
  normalizeModel,
  transactionColor,
  transactionLabel,
} from "../../legacyUi";
import { TYPO } from "../tokens";
import { EmptyState, IconButton, KpiCard } from "../primitives";
import { fetchMonthLogs, useTransactions } from "../hooks/useTransactions";
import {
  DEFAULT_HISTORY_FILTERS,
  HistoryFilterSheet,
  countActiveHistoryFilters,
  type HistoryFilters,
} from "./HistoryFilterSheet";

function parseEmployeeName(value?: string | null) {
  if (!value) return "";
  return value.split("(")[0]?.trim() ?? value;
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

function parseUtc(iso: string) {
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
}

function toDateKey(iso: string) {
  const d = parseUtc(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function HistoryScreen({ onClose }: { onClose: () => void }) {
  const { logs, loading, hasMore, loadMore } = useTransactions();
  const [items, setItems] = useState<Item[]>([]);
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_HISTORY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());
  const [calendarLogs, setCalendarLogs] = useState<TransactionLog[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  useEffect(() => {
    void api
      .getItems({ limit: 2000 })
      .then(setItems)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (viewMode !== "calendar") return;
    setCalendarLoading(true);
    setSelectedDay(null);
    void fetchMonthLogs(calendarYear, calendarMonth)
      .then(setCalendarLogs)
      .finally(() => setCalendarLoading(false));
  }, [viewMode, calendarYear, calendarMonth]);

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

  const summary = useMemo(() => {
    const total = filteredLogs.length;
    const inSum = filteredLogs
      .filter((l) => l.transaction_type === "RECEIVE" || l.transaction_type === "PRODUCE")
      .reduce((a, l) => a + Math.abs(Number(l.quantity_change)), 0);
    const outSum = filteredLogs
      .filter((l) => l.transaction_type === "SHIP" || l.transaction_type === "BACKFLUSH")
      .reduce((a, l) => a + Math.abs(Number(l.quantity_change)), 0);
    return { total, inSum, outSum };
  }, [filteredLogs]);

  const groupedByDay = useMemo(() => {
    const map = new Map<string, TransactionLog[]>();
    for (const log of filteredLogs) {
      const key = toDateKey(log.created_at);
      const arr = map.get(key) ?? [];
      arr.push(log);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filteredLogs]);

  const activeFilterCount = countActiveHistoryFilters(filters);

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

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarYear, calendarMonth]);

  const todayKey = toDateKey(new Date().toISOString());

  const copyRef = (ref: string) => {
    void navigator.clipboard.writeText(ref).then(() => {
      setCopiedRef(ref);
      setTimeout(() => setCopiedRef(null), 1500);
    });
  };

  const selectedDayLogs = selectedDay ? calendarDayMap.get(selectedDay) ?? [] : [];

  const prevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarYear((y) => y - 1);
      setCalendarMonth(11);
    } else setCalendarMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarYear((y) => y + 1);
      setCalendarMonth(0);
    } else setCalendarMonth((m) => m + 1);
  };

  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-3">
      <div className="flex items-center gap-2">
        <IconButton icon={ArrowLeft} label="이전" size="md" onClick={onClose} color={LEGACY_COLORS.muted2} />
        <div className="flex-1" />
        <div
          className="flex overflow-hidden rounded-[14px] border"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`${TYPO.caption} flex items-center gap-1 px-3 py-2 font-bold`}
            style={{
              background: viewMode === "list" ? LEGACY_COLORS.blue : "transparent",
              color: viewMode === "list" ? "#fff" : LEGACY_COLORS.muted2,
            }}
          >
            <List size={14} /> 목록
          </button>
          <button
            type="button"
            onClick={() => setViewMode("calendar")}
            className={`${TYPO.caption} flex items-center gap-1 px-3 py-2 font-bold`}
            style={{
              background: viewMode === "calendar" ? LEGACY_COLORS.blue : "transparent",
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
