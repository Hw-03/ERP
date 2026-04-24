"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, List, Search, TrendingDown, TrendingUp, X } from "lucide-react";
import { api, type TransactionLog, type TransactionType } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import {
  LEGACY_COLORS,
  employeeColor,
  formatNumber,
  transactionColor,
  transactionLabel,
} from "./legacyUi";

const PAGE_SIZE = 100;

const EXCEPTION_TYPES = new Set(["ADJUST", "SCRAP", "LOSS", "DISASSEMBLE", "MARK_DEFECTIVE"]);

const TYPE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "입고", value: "RECEIVE" },
  { label: "출고", value: "SHIP" },
  { label: "생산", value: "PRODUCE" },
  { label: "자동차감", value: "BACKFLUSH" },
  { label: "조정·예외", value: "EXCEPTION" },
];

const QUICK_FILTERS = [
  { id: "has_memo", label: "메모 있음" },
  { id: "no_ref", label: "참조번호 없음" },
  { id: "exception", label: "조정·예외" },
  { id: "backflush", label: "자동차감" },
  { id: "large_ship", label: "대량 출고 ↓" },
  { id: "today", label: "오늘" },
];

const DATE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "오늘", value: "TODAY" },
  { label: "이번주", value: "WEEK" },
  { label: "이번달", value: "MONTH" },
];

const CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
  RM: { label: "원자재", color: LEGACY_COLORS.blue, bg: `color-mix(in srgb, ${LEGACY_COLORS.blue} 16%, transparent)` },
  TA: { label: "튜브조립", color: LEGACY_COLORS.cyan, bg: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 16%, transparent)` },
  TF: { label: "튜브완성", color: LEGACY_COLORS.cyan, bg: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 16%, transparent)` },
  HA: { label: "고압조립", color: LEGACY_COLORS.yellow, bg: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)` },
  HF: { label: "고압완성", color: LEGACY_COLORS.yellow, bg: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)` },
  VA: { label: "진공조립", color: LEGACY_COLORS.purple, bg: `color-mix(in srgb, ${LEGACY_COLORS.purple} 16%, transparent)` },
  VF: { label: "진공완성", color: LEGACY_COLORS.purple, bg: `color-mix(in srgb, ${LEGACY_COLORS.purple} 16%, transparent)` },
  BA: { label: "본체조립", color: "#f97316", bg: "color-mix(in srgb, #f97316 16%, transparent)" },
  AF: { label: "조립완성", color: "#f97316", bg: "color-mix(in srgb, #f97316 16%, transparent)" },
  FG: { label: "완제품", color: LEGACY_COLORS.green, bg: `color-mix(in srgb, ${LEGACY_COLORS.green} 16%, transparent)` },
  UK: { label: "미분류", color: LEGACY_COLORS.muted2, bg: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 16%, transparent)` },
};

function getPeriodStart(value: string): Date | null {
  const now = new Date();
  if (value === "TODAY") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (value === "WEEK") {
    const copy = new Date(now);
    copy.setDate(copy.getDate() - copy.getDay());
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
  if (value === "MONTH") return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

function rowTint(type: string) {
  switch (type) {
    case "RECEIVE":
    case "PRODUCE":
    case "RETURN":
      return "rgba(67,211,157,.05)";
    case "SHIP":
    case "BACKFLUSH":
    case "SCRAP":
    case "LOSS":
      return "rgba(255,123,123,.05)";
    case "ADJUST":
      return "rgba(101,169,255,.05)";
    default:
      return "transparent";
  }
}

function parseUtc(iso: string) {
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
}

function formatDate(iso: string) {
  const d = parseUtc(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

function Chip({
  active,
  label,
  onClick,
  tone = LEGACY_COLORS.blue,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="whitespace-nowrap rounded-full border px-3 py-1 text-sm font-semibold transition-all hover:brightness-110"
      style={{
        background: active ? `color-mix(in srgb, ${tone} 14%, transparent)` : LEGACY_COLORS.s2,
        borderColor: active ? tone : LEGACY_COLORS.border,
        color: active ? tone : LEGACY_COLORS.muted2,
      }}
    >
      {label}
    </button>
  );
}

function toDateKey(iso: string): string {
  const d = parseUtc(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

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
  const [quickFilter, setQuickFilter] = useState<string | null>(null);
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void api
      .getTransactions({ limit: PAGE_SIZE, skip: 0 })
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
    void api.getTransactions({ limit: 2000, skip: 0 }).then((data) => {
      setCalendarLogs(data);
      setCalendarLoading(false);
    }).catch(() => setCalendarLoading(false));
  }, [viewMode]);

  function prevMonth() {
    if (calendarMonth === 0) { setCalendarYear((y) => y - 1); setCalendarMonth(11); }
    else setCalendarMonth((m) => m - 1);
  }
  function nextMonth() {
    if (calendarMonth === 11) { setCalendarYear((y) => y + 1); setCalendarMonth(0); }
    else setCalendarMonth((m) => m + 1);
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

  const selectedDayLogs = useMemo(() => (selectedDay ? (calendarDayMap.get(selectedDay) ?? []) : []), [selectedDay, calendarDayMap]);

  const todayKey = toDateKey(new Date().toISOString());

  const filteredLogs = useMemo(() => {
    const start = getPeriodStart(dateFilter);
    let result = logs.filter((log) => {
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

    if (quickFilter) {
      result = result.filter((log) => {
        if (quickFilter === "has_memo" && !log.notes?.trim()) return false;
        if (quickFilter === "no_ref" && log.reference_no) return false;
        if (quickFilter === "exception" && !EXCEPTION_TYPES.has(log.transaction_type)) return false;
        if (quickFilter === "backflush" && log.transaction_type !== "BACKFLUSH") return false;
        if (quickFilter === "today") {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          if (parseUtc(log.created_at) < todayStart) return false;
        }
        return true;
      });

      if (quickFilter === "large_ship") {
        result = result.filter((log) => log.transaction_type === "SHIP");
        result = [...result].sort((a, b) => Math.abs(Number(b.quantity_change)) - Math.abs(Number(a.quantity_change)));
      }
    }

    return result;
  }, [logs, typeFilter, dateFilter, search, quickFilter]);

  const stats = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
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

  const canLoadMore = logs.length >= page * PAGE_SIZE;

  async function loadMore() {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const more = await api.getTransactions({ limit: PAGE_SIZE, skip: (nextPage - 1) * PAGE_SIZE });
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
                <div className="text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>조회 건수</div>
                <div className="text-2xl font-black">{formatNumber(stats.total)}</div>
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>현재 로드 기준</div>
                {canLoadMore && <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>(+더 불러올 수 있음)</div>}
              </div>

              <div
                className="flex flex-col gap-1 rounded-[20px] border p-4"
                style={{ background: "rgba(67,211,157,.06)", borderColor: "rgba(67,211,157,.22)" }}
              >
                <div className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.green }}>
                  <TrendingUp className="h-3.5 w-3.5" />
                  입고 합계
                </div>
                <div className="text-2xl font-black" style={{ color: LEGACY_COLORS.green }}>+{formatNumber(stats.receiveSum)}</div>
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>RECEIVE · PRODUCE</div>
              </div>

              <div
                className="flex flex-col gap-1 rounded-[20px] border p-4"
                style={{ background: "rgba(255,123,123,.06)", borderColor: "rgba(255,123,123,.22)" }}
              >
                <div className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.red }}>
                  <TrendingDown className="h-3.5 w-3.5" />
                  출고 합계
                </div>
                <div className="text-2xl font-black" style={{ color: LEGACY_COLORS.red }}>-{formatNumber(stats.shipSum)}</div>
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>SHIP · BACKFLUSH</div>
              </div>

              <div
                className="flex flex-col gap-1 rounded-[20px] border p-4"
                style={{ background: "rgba(246,198,103,.06)", borderColor: "rgba(246,198,103,.22)" }}
              >
                <div className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.yellow }}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  예외 거래
                </div>
                <div className="text-2xl font-black" style={{ color: LEGACY_COLORS.yellow }}>{formatNumber(stats.exceptionCount)}</div>
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>조정·폐기·손실·예외</div>
              </div>
            </div>
          </section>

          {/* ── 필터 바 ── */}
          <section className="card">
            <div className="flex flex-col gap-3">
              {/* 검색 + 토글 */}
              <div className="flex items-center gap-3">
                <div
                  className="flex flex-1 items-center gap-2 rounded-[14px] border px-3 py-2.5"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                >
                  <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="품명 · ERP코드 · 담당자 · 참조번호 · 메모"
                    className="flex-1 bg-transparent text-base outline-none"
                    style={{ color: LEGACY_COLORS.text }}
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>✕</button>
                  )}
                </div>
                {/* 목록/달력 토글 */}
                <div className="flex overflow-hidden rounded-[12px] border" style={{ borderColor: LEGACY_COLORS.border }}>
                  <button
                    onClick={() => setViewMode("list")}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold transition-colors"
                    style={{ background: viewMode === "list" ? LEGACY_COLORS.blue : "transparent", color: viewMode === "list" ? "#fff" : LEGACY_COLORS.muted2 }}
                  >
                    <List className="h-3.5 w-3.5" />목록
                  </button>
                  <button
                    onClick={() => setViewMode("calendar")}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold transition-colors"
                    style={{ background: viewMode === "calendar" ? LEGACY_COLORS.blue : "transparent", color: viewMode === "calendar" ? "#fff" : LEGACY_COLORS.muted2 }}
                  >
                    <CalendarDays className="h-3.5 w-3.5" />달력
                  </button>
                </div>
              </div>

              {/* 유형 필터 */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>유형</span>
                {TYPE_OPTIONS.map((opt) => (
                  <Chip key={opt.value} active={typeFilter === opt.value} label={opt.label} onClick={() => setTypeFilter(opt.value)} />
                ))}
              </div>

              {/* 기간 필터 */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>기간</span>
                {DATE_OPTIONS.map((opt) => (
                  <Chip key={opt.value} active={dateFilter === opt.value} label={opt.label} onClick={() => setDateFilter(opt.value)} tone={LEGACY_COLORS.purple} />
                ))}
              </div>

              {/* 활성 필터 요약 바 */}
              {(typeFilter !== "ALL" || dateFilter !== "ALL" || search.trim() || quickFilter) && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>적용됨</span>
                  {typeFilter !== "ALL" && (
                    <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold" style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 12%, transparent)`, borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 35%, transparent)`, color: LEGACY_COLORS.blue }}>
                      유형: {TYPE_OPTIONS.find(opt => opt.value === typeFilter)?.label}
                      <button onClick={() => setTypeFilter("ALL")}><X className="h-3 w-3" /></button>
                    </span>
                  )}
                  {dateFilter !== "ALL" && (
                    <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold" style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.purple} 12%, transparent)`, borderColor: `color-mix(in srgb, ${LEGACY_COLORS.purple} 35%, transparent)`, color: LEGACY_COLORS.purple }}>
                      기간: {DATE_OPTIONS.find(opt => opt.value === dateFilter)?.label}
                      <button onClick={() => setDateFilter("ALL")}><X className="h-3 w-3" /></button>
                    </span>
                  )}
                  {search.trim() && (
                    <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold" style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 12%, transparent)`, borderColor: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 35%, transparent)`, color: LEGACY_COLORS.cyan }}>
                      "{search}"
                      <button onClick={() => setSearch("")}><X className="h-3 w-3" /></button>
                    </span>
                  )}
                  {quickFilter && (
                    <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold" style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 12%, transparent)`, borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 35%, transparent)`, color: LEGACY_COLORS.yellow }}>
                      {QUICK_FILTERS.find(qf => qf.id === quickFilter)?.label}
                      <button onClick={() => setQuickFilter(null)}><X className="h-3 w-3" /></button>
                    </span>
                  )}
                  <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{stats.total}건</span>
                </div>
              )}

              {/* 빠른 필터: 문제 거래 찾기 */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>문제 거래</span>
                {QUICK_FILTERS.map((qf) => (
                  <Chip key={qf.id} active={quickFilter === qf.id} label={qf.label} onClick={() => setQuickFilter(quickFilter === qf.id ? null : qf.id)} tone={LEGACY_COLORS.yellow} />
                ))}
              </div>
            </div>
          </section>

          {/* ── 달력 뷰 ── */}
          {viewMode === "calendar" && (
            <section className="card">
              {/* 월 네비게이션 */}
              <div className="mb-4 flex items-center justify-between rounded-[20px] border px-5 py-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                <button onClick={prevMonth} className="rounded-full p-1.5 hover:bg-white/10">
                  <ChevronLeft className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
                </button>
                <span className="text-base font-bold">{calendarYear}년 {calendarMonth + 1}월</span>
                <button onClick={nextMonth} className="rounded-full p-1.5 hover:bg-white/10">
                  <ChevronRight className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
                </button>
              </div>

              {calendarLoading ? (
                <div className="py-12 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>달력 데이터 불러오는 중...</div>
              ) : (
                <>
                  {/* 요일 헤더 */}
                  <div className="mb-1 grid grid-cols-7">
                    {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
                      <div key={d} className="py-1 text-center text-xs font-bold"
                        style={{ color: i === 0 ? "#f25f5c" : i === 6 ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}>
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* 날짜 그리드 */}
                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((day, idx) => {
                      if (day === null) return <div key={`empty-${idx}`} />;
                      const mm = String(calendarMonth + 1).padStart(2, "0");
                      const dd = String(day).padStart(2, "0");
                      const key = `${calendarYear}-${mm}-${dd}`;
                      const dayLogs = calendarDayMap.get(key) ?? [];
                      const isToday = key === todayKey;
                      const isSelected = key === selectedDay;
                      const hasReceive = dayLogs.some((l) => l.transaction_type === "RECEIVE" || l.transaction_type === "PRODUCE");
                      const hasShip = dayLogs.some((l) => l.transaction_type === "SHIP" || l.transaction_type === "BACKFLUSH");
                      const hasAdjust = dayLogs.some((l) => l.transaction_type === "ADJUST");
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedDay((c) => (c === key ? null : key))}
                          className="flex flex-col items-center rounded-[14px] border p-2 transition-colors hover:brightness-110"
                          style={{
                            background: isSelected ? "rgba(101,169,255,.18)" : isToday ? "rgba(101,169,255,.08)" : LEGACY_COLORS.s2,
                            borderColor: isSelected ? LEGACY_COLORS.blue : isToday ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 27%, transparent)` : LEGACY_COLORS.border,
                            minHeight: "64px",
                          }}
                        >
                          <span className="text-sm font-bold" style={{ color: isToday ? LEGACY_COLORS.blue : LEGACY_COLORS.text }}>{day}</span>
                          {dayLogs.length > 0 && (
                            <span className="mt-1 rounded-full px-1.5 py-0.5 text-xs font-bold" style={{ background: "rgba(101,169,255,.2)", color: LEGACY_COLORS.blue }}>
                              {dayLogs.length}
                            </span>
                          )}
                          <div className="mt-1 flex gap-0.5">
                            {hasReceive && <span className="h-1.5 w-1.5 rounded-full" style={{ background: LEGACY_COLORS.green }} />}
                            {hasShip && <span className="h-1.5 w-1.5 rounded-full" style={{ background: LEGACY_COLORS.red }} />}
                            {hasAdjust && <span className="h-1.5 w-1.5 rounded-full" style={{ background: LEGACY_COLORS.yellow }} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* 선택일 거래 목록 */}
                  {selectedDay && (
                    <div className="mt-4 rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                      <div className="mb-3 text-sm font-bold">{selectedDay} 거래 {selectedDayLogs.length}건</div>
                      {selectedDayLogs.length === 0 ? (
                        <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>거래 없음</div>
                      ) : (
                        <div className="space-y-2">
                          {selectedDayLogs.map((log) => {
                            const tcolor = transactionColor(log.transaction_type);
                            return (
                              <button
                                key={log.log_id}
                                onClick={() => setSelected((c) => (c?.log_id === log.log_id ? null : log))}
                                className="flex w-full items-center gap-3 rounded-[14px] border px-3 py-2.5 text-left transition-all hover:brightness-110"
                                style={{
                                  background: selected?.log_id === log.log_id ? "rgba(101,169,255,.10)" : LEGACY_COLORS.s1,
                                  borderColor: selected?.log_id === log.log_id ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                                }}
                              >
                                <span className="inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: `color-mix(in srgb, ${tcolor} 14%, transparent)`, color: tcolor }}>
                                  {transactionLabel(log.transaction_type)}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm">{log.item_name}</span>
                                <span className="shrink-0 text-sm font-bold" style={{ color: tcolor }}>
                                  {Number(log.quantity_change) >= 0 ? "+" : ""}{formatNumber(log.quantity_change)}
                                </span>
                                <span className="shrink-0 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{formatDate(log.created_at).split(" ")[1]}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* ── 메인 테이블 ── */}
          {viewMode === "list" && (
          <section className="card" style={{ backgroundImage: "linear-gradient(rgba(101,169,255,.04), rgba(101,169,255,.04))" }}>
            <div
              className="sticky top-0 z-20 -mx-5 -mt-5 mb-4 flex items-center gap-3 rounded-t-[28px] px-5 pb-3 pt-5"
              style={{ background: LEGACY_COLORS.bg, backgroundImage: "linear-gradient(rgba(101,169,255,.04), rgba(101,169,255,.04))" }}
            >
              <div className="shrink-0 text-base font-bold">입출고 내역</div>
              <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{filteredLogs.length}건</span>
              {filteredLogs.length > 0 && (
                <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  {formatDate(filteredLogs[filteredLogs.length - 1].created_at)} ~ {formatDate(filteredLogs[0].created_at)}
                </span>
              )}
            </div>

            {loading ? (
              <div className="py-16 text-center text-base" style={{ color: LEGACY_COLORS.muted2 }}>내역을 불러오는 중...</div>
            ) : filteredLogs.length === 0 ? (
              <div className="py-16 text-center text-base" style={{ color: LEGACY_COLORS.muted2 }}>거래 이력이 없습니다.</div>
            ) : (
              <div className="overflow-x-auto rounded-[24px] border" style={{ borderColor: LEGACY_COLORS.border }}>
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr style={{ background: LEGACY_COLORS.s2 }}>
                      {([
                        { label: "일시", width: "140px" },
                        { label: "구분", width: "80px" },
                        { label: "품목명", minWidth: "160px" },
                        { label: "코드", width: "90px" },
                        { label: "분류", width: "60px" },
                        { label: "수량", width: "70px" },
                        { label: "재고 변화", width: "80px" },
                        { label: "담당자", width: "90px" },
                        { label: "참조번호", width: "90px" },
                        { label: "메모", minWidth: "120px" },
                      ] as { label: string; width?: string; minWidth?: string }[]).map(({ label, width, minWidth }) => (
                        <th
                          key={label}
                          className="whitespace-nowrap border-b px-4 py-3 text-left text-xs font-bold"
                          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, width, minWidth }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log) => {
                      const isSelected = selected?.log_id === log.log_id;
                      const tcolor = transactionColor(log.transaction_type);
                      const cat = CATEGORY_META[log.item_category] ?? { label: log.item_category, color: LEGACY_COLORS.muted2, bg: "rgba(157,173,199,.16)" };
                      return (
                        <tr
                          key={log.log_id}
                          onClick={() => setSelected((c) => (c?.log_id === log.log_id ? null : log))}
                          className="cursor-pointer transition-colors hover:brightness-110"
                          style={{
                            background: isSelected ? "rgba(101,169,255,.10)" : rowTint(log.transaction_type),
                            outline: isSelected ? `1.5px solid ${LEGACY_COLORS.blue}` : "none",
                          }}
                        >
                          {/* 일시 */}
                          <td className="whitespace-nowrap border-b px-4 py-3 text-xs" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                            {formatDate(log.created_at)}
                          </td>

                          {/* 구분 */}
                          <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                            <span
                              className="inline-flex rounded-full px-2.5 py-1 text-xs font-bold"
                              style={{ background: `color-mix(in srgb, ${tcolor} 14%, transparent)`, color: tcolor }}
                            >
                              {transactionLabel(log.transaction_type)}
                            </span>
                          </td>

                          {/* 품목명 */}
                          <td className="max-w-[180px] border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                            <div className="truncate font-semibold">{log.item_name}</div>
                          </td>

                          {/* 코드 */}
                          <td className="whitespace-nowrap border-b px-4 py-3 text-xs" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                            {log.erp_code}
                          </td>

                          {/* 분류 */}
                          <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                            <span
                              className="inline-flex rounded-full px-2 py-0.5 text-xs font-bold"
                              style={{ background: cat.bg, color: cat.color }}
                            >
                              {cat.label}
                            </span>
                          </td>

                          {/* 수량 */}
                          <td
                            className="whitespace-nowrap border-b px-4 py-3 text-right font-bold"
                            style={{ borderColor: LEGACY_COLORS.border, color: tcolor }}
                          >
                            {Number(log.quantity_change) >= 0 ? "+" : ""}{formatNumber(log.quantity_change)}
                          </td>

                          {/* 재고 변화 */}
                          <td className="whitespace-nowrap border-b px-4 py-3 text-xs" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                            {log.quantity_before != null ? formatNumber(log.quantity_before) : "-"}
                            <span className="mx-1">→</span>
                            {log.quantity_after != null ? formatNumber(log.quantity_after) : "-"}
                          </td>

                          {/* 담당자 */}
                          <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                            {log.produced_by ? (() => {
                              const name = log.produced_by.split("(")[0]?.trim() ?? "-";
                              const dept = log.produced_by.match(/\(([^)]+)\)/)?.[1] ?? "";
                              const color = dept ? employeeColor(dept) : LEGACY_COLORS.muted2;
                              return (
                                <div className="flex items-center gap-1.5">
                                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ background: color }}>
                                    {name[0] ?? "?"}
                                  </span>
                                  <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{name}</span>
                                </div>
                              );
                            })() : <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>}
                          </td>

                          {/* 참조번호 */}
                          <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                            {log.reference_no ? (
                              <button
                                onClick={(e) => copyRef(log.reference_no!, e)}
                                className="rounded border px-2 py-0.5 text-xs transition-all hover:brightness-110"
                                style={{
                                  background: copiedRef === log.reference_no ? "rgba(67,211,157,.2)" : LEGACY_COLORS.s2,
                                  borderColor: LEGACY_COLORS.border,
                                  color: copiedRef === log.reference_no ? LEGACY_COLORS.green : LEGACY_COLORS.muted2,
                                }}
                                title="클릭해서 복사"
                              >
                                {copiedRef === log.reference_no ? "복사됨!" : log.reference_no}
                              </button>
                            ) : (
                              <span style={{ color: LEGACY_COLORS.muted2 }}>-</span>
                            )}
                          </td>

                          {/* 메모 */}
                          <td className="max-w-[160px] border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                            <div className="truncate text-xs">{log.notes || "-"}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {canLoadMore && (
              <button
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="mt-4 flex w-full items-center justify-center gap-2 py-3 text-base font-bold disabled:opacity-50"
                style={{ color: LEGACY_COLORS.blue }}
              >
                <ChevronDown className="h-4 w-4" />
                {loadingMore ? "불러오는 중..." : "100건 더보기"}
              </button>
            )}
          </section>
          )}
        </div>
      </div>

      {/* ── 우측: 상세 패널 ── */}
      <DesktopRightPanel
        title={selected ? selected.item_name : "항목을 선택하세요"}
        subtitle={selected ? `${selected.erp_code} · ${formatDate(selected.created_at)}` : undefined}
      >
        {selected ? (
          <div className="space-y-4">
            {/* 거래 유형 + 수량 강조 */}
            <div
              className="rounded-[24px] border p-5 text-center"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <span
                className="inline-flex rounded-full px-4 py-1.5 text-sm font-bold"
                style={{ background: `color-mix(in srgb, ${transactionColor(selected.transaction_type)} 14%, transparent)`, color: transactionColor(selected.transaction_type) }}
              >
                {transactionLabel(selected.transaction_type)}
              </span>
              <div className="mt-3 text-4xl font-black" style={{ color: transactionColor(selected.transaction_type) }}>
                {Number(selected.quantity_change) >= 0 ? "+" : ""}
                {formatNumber(selected.quantity_change)}
                <span className="ml-2 text-base font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>{selected.item_unit}</span>
              </div>
              {(selected.quantity_before != null || selected.quantity_after != null) && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 rounded-[14px] border px-3 py-2 text-center" style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 8%, transparent)`, borderColor: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 25%, transparent)` }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: LEGACY_COLORS.muted2 }}>처리 전</div>
                    <div className="mt-1 text-lg font-black" style={{ color: LEGACY_COLORS.muted2 }}>
                      {selected.quantity_before != null ? formatNumber(selected.quantity_before) : "-"}
                    </div>
                  </div>
                  <span className="text-lg" style={{ color: LEGACY_COLORS.muted2 }}>→</span>
                  <div className="flex-1 rounded-[14px] border px-3 py-2 text-center" style={{
                    background: `color-mix(in srgb, ${transactionColor(selected.transaction_type)} 8%, transparent)`,
                    borderColor: `color-mix(in srgb, ${transactionColor(selected.transaction_type)} 30%, transparent)`,
                  }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: transactionColor(selected.transaction_type) }}>처리 후</div>
                    <div className="mt-1 text-lg font-black" style={{ color: transactionColor(selected.transaction_type) }}>
                      {selected.quantity_after != null ? formatNumber(selected.quantity_after) : "-"}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 상세 정보 */}
            <div className="space-y-2.5 rounded-[24px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              {(
                [
                  ["품목명", selected.item_name],
                  ["ERP코드", selected.erp_code],
                  ["분류", (CATEGORY_META[selected.item_category] ?? { label: selected.item_category }).label],
                  ["단위", selected.item_unit],
                  ["담당자", selected.produced_by ?? "-"],
                  ["참조번호", selected.reference_no ?? "-"],
                  ["일시", parseUtc(selected.created_at).toLocaleString("ko-KR")],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{label}</span>
                  <span className="text-right text-base font-semibold break-all" style={{ color: LEGACY_COLORS.text }}>{value}</span>
                </div>
              ))}
            </div>

            {/* 메모 편집 */}
            <div className="rounded-[24px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              <div className="mb-2 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>메모</div>
              <textarea
                value={editingNotes}
                onChange={(e) => setEditingNotes(e.target.value)}
                placeholder="메모를 입력하세요..."
                className="min-h-[80px] w-full rounded-[14px] border px-3 py-2.5 text-base outline-none"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />
              <button
                onClick={() => void saveNotes()}
                disabled={savingNotes || editingNotes === (selected.notes ?? "")}
                className="mt-2 w-full rounded-[14px] py-2.5 text-base font-bold text-white disabled:opacity-40"
                style={{ background: LEGACY_COLORS.blue }}
              >
                {savingNotes ? "저장 중..." : "메모 저장"}
              </button>
            </div>

            {/* 이 품목의 최근 거래 */}
            <div className="rounded-[24px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              <div className="mb-3 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
                이 품목의 최근 거래
              </div>
              {itemRecentLogs.length === 0 ? (
                <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>최근 거래 없음</div>
              ) : (
                <div className="space-y-2">
                  {itemRecentLogs.map((log) => (
                    <button
                      key={log.log_id}
                      onClick={() => setSelected(log)}
                      className="flex w-full items-center justify-between rounded-[14px] border p-3 text-left transition-all hover:brightness-110"
                      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                    >
                      <div className="flex-1 min-w-0">
                        <span
                          className="inline-flex rounded px-2 py-0.5 text-xs font-bold"
                          style={{ background: `color-mix(in srgb, ${transactionColor(log.transaction_type)} 14%, transparent)`, color: transactionColor(log.transaction_type) }}
                        >
                          {transactionLabel(log.transaction_type)}
                        </span>
                        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                          {formatDate(log.created_at)}
                        </div>
                        {(log.quantity_before != null || log.quantity_after != null) && (
                          <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                            {log.quantity_before != null ? formatNumber(log.quantity_before) : "-"} → {log.quantity_after != null ? formatNumber(log.quantity_after) : "-"}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 ml-2 text-base font-bold text-right" style={{ color: transactionColor(log.transaction_type) }}>
                        {Number(log.quantity_change) >= 0 ? "+" : ""}{formatNumber(log.quantity_change)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center" style={{ color: LEGACY_COLORS.muted2 }}>
              <Activity className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <div className="text-base">테이블에서 항목을 클릭하면<br />상세 내용이 표시됩니다</div>
            </div>
          </div>
        )}
      </DesktopRightPanel>
    </div>
  );
}
