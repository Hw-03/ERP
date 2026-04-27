---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/DesktopHistoryView.tsx
status: active
updated: 2026-04-27
source_sha: d49d4da9cfc9
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# DesktopHistoryView.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/DesktopHistoryView.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `13230` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_components|frontend/app/legacy/_components]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

> 전체 336줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { api, type TransactionLog, type TransactionType } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import { LEGACY_COLORS, formatNumber } from "./legacyUi";
import { HistoryFilterBar } from "./_history_sections/HistoryFilterBar";
import { HistoryCalendarStrip } from "./_history_sections/HistoryCalendarStrip";
import { HistoryTable } from "./_history_sections/HistoryTable";
import { HistoryDetailPanel } from "./_history_sections/HistoryDetailPanel";
import {
  EXCEPTION_TYPES,
  HISTORY_PAGE_SIZE,
  formatHistoryDate,
  getPeriodStart,
  parseUtc,
  toDateKey,
} from "./_history_sections/historyShared";

export function DesktopHistoryView() {
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [calendarLogs, setCalendarLogs] = useState<TransactionLog[]>([]);
  const [selected, setSelected] = useState<TransactionLog | null>(null);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [editingNotes, setEditingNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const [itemRecentLogs, setItemRecentLogs] = useState<TransactionLog[]>([]);

  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void api
      .getTransactions({ limit: HISTORY_PAGE_SIZE, skip: 0 })
      .then((data) => {
        setLogs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) {
      setItemRecentLogs([]);
      return;
    }
    setEditingNotes(selected.notes ?? "");
    void api
      .getTransactions({ itemId: selected.item_id, limit: 6 })
      .then((data) => {
        setItemRecentLogs(data.filter((l) => l.log_id !== selected.log_id).slice(0, 5));
      })
      .catch(() => setItemRecentLogs([]));
  }, [selected]);

  useEffect(() => {
    if (viewMode !== "calendar") return;
    setCalendarLoading(true);
    setSelectedDay(null);
    void api
      .getTransactions({ limit: 2000, skip: 0 })
      .then((data) => {
        setCalendarLogs(data);
        setCalendarLoading(false);
      })
      .catch(() => setCalendarLoading(false));
  }, [viewMode]);

  function prevMonth() {
    if (calendarMonth === 0) {
      setCalendarYear((y) => y - 1);
      setCalendarMonth(11);
    } else setCalendarMonth((m) => m - 1);
  }
  function nextMonth() {
    if (calendarMonth === 11) {
      setCalendarYear((y) => y + 1);
      setCalendarMonth(0);
    } else setCalendarMonth((m) => m + 1);
  }

  const calendarDayMap = useMemo(() => {
    const map = new Map<string, TransactionLog[]>();
    for (const log of calendarLogs) {
      const key = toDateKey(log.created_at);
      const d = parseUtc(log.created_at);
      if (d.getFullYear() !== calendarYear || d.getMonth() !== calendarMonth) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(log);
    }
    return map;
  }, [calendarLogs, calendarYear, calendarMonth]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarYear, calendarMonth]);

  const selectedDayLogs = useMemo(
    () => (selectedDay ? calendarDayMap.get(selectedDay) ?? [] : []),
    [selectedDay, calendarDayMap],
  );

  const todayKey = toDateKey(new Date().toISOString());

  const filteredLogs = useMemo(() => {
    const start = getPeriodStart(dateFilter);
    return logs.filter((log) => {
      if (typeFilter === "EXCEPTION") {
        if (!EXCEPTION_TYPES.has(log.transaction_type)) return false;
      } else if (typeFilter !== "ALL" && log.transaction_type !== (typeFilter as TransactionType)) return false;
      if (start && parseUtc(log.created_at) < start) return false;
      if (search.trim()) {
        const kw = search.trim().toLowerCase();
        const hay = `${log.item_name} ${log.erp_code} ${log.reference_no ?? ""} ${log.notes ?? ""} ${log.produced_by ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [logs, typeFilter, dateFilter, search]);

  const stats = useMemo(() => {
    let receiveSum = 0;
    let shipSum = 0;
    let exceptionCount = 0;
    for (const log of filteredLogs) {
      if (log.transaction_type === "RECEIVE" || log.transaction_type === "PRODUCE") {
        receiveSum += Number(log.quantity_change);
      }
      if (log.transaction_type === "SHIP" || log.transaction_type === "BACKFLUSH") {
        shipSum += Math.abs(Number(log.quantity_change));
      }
      if (EXCEPTION_TYPES.has(log.transaction_type) || log.transaction_type === "BACKFLUSH") {
        exceptionCount++;
      }
    }
    return { total: filteredLogs.length, receiveSum, shipSum, exceptionCount };
  }, [filteredLogs]);

  const canLoadMore = logs.length >= page * HISTORY_PAGE_SIZE;

  async function loadMore() {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const more = await api.getTransactions({
        limit: HISTORY_PAGE_SIZE,
        skip: (nextPage - 1) * HISTORY_PAGE_SIZE,
      });
      setLogs((prev) => [...prev, ...more]);
      setPage(nextPage);
    } finally {
      setLoadingMore(false);
    }
  }

  async function saveNotes() {
    if (!selected) return;
    setSavingNotes(true);
    try {
      const updated = await api.updateTransactionNotes(selected.log_id, editingNotes || null);
      setLogs((prev) => prev.map((l) => (l.log_id === updated.log_id ? updated : l)));
      setSelected(updated);
    } finally {
      setSavingNotes(false);
    }
  }

  function copyRef(ref: string, e: React.MouseEvent) {
    e.stopPropagation();
    void navigator.clipboard.writeText(ref).then(() => {
      setCopiedRef(ref);
      setTimeout(() => setCopiedRef(null), 1500);
    });
  }

  function handleSelectLog(log: TransactionLog) {
    setSelected((c) => (c?.log_id === log.log_id ? null : log));
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4 pl-0 pr-4">
      {/* ── 좌측: 스크롤 영역 ── */}
      <div
        className="scrollbar-hide min-h-0 min-w-0 flex-1 overflow-y-auto rounded-[28px] border"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.bg }}
      >
        <div className="flex flex-col gap-3 pb-6">
          {/* ── 요약 통계 카드 ── */}
          <section className="card">
            <div className="grid grid-cols-4 gap-3">
              <div
                className="flex flex-col gap-1 rounded-[20px] border p-4"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              >
                <div className="text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
                  조회 건수
                </div>
                <div className="text-2xl font-black">{formatNumber(stats.total)}</div>
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>현재 로드 기준</div>
                {canLoadMore && (
                  <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>(+더 불러올 수 있음)</div>
                )}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
