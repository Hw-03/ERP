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
              color: viewMode === "calendar" ? "#fff" : LEGACY_COLORS.muted2,
            }}
          >
            <CalendarDays size={14} /> 달력
          </button>
        </div>
        <IconButton
          icon={Filter}
          label="필터"
          size="md"
          color={activeFilterCount > 0 ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2}
          onClick={() => setFilterOpen(true)}
          badge={activeFilterCount}
        />
      </div>

      {viewMode === "list" ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <KpiCard label="전체" value={summary.total} color={LEGACY_COLORS.blue} />
            <KpiCard label="입고합" value={formatNumber(summary.inSum)} color={LEGACY_COLORS.green} />
            <KpiCard label="출고합" value={formatNumber(summary.outSum)} color={LEGACY_COLORS.red} />
          </div>

          {loading && logs.length === 0 ? (
            <div className={`${TYPO.body} py-10 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
              불러오는 중…
            </div>
          ) : filteredLogs.length === 0 ? (
            <EmptyState
              icon={HistoryIcon}
              title="조건에 맞는 거래가 없습니다"
              description="필터를 조정해 보세요."
            />
          ) : (
            <div className="flex flex-col gap-4">
              {groupedByDay.map(([day, dayLogs]) => (
                <div key={day} className="flex flex-col gap-2">
                  <div
                    className={`${TYPO.caption} font-bold`}
                    style={{ color: LEGACY_COLORS.muted2 }}
                  >
                    {new Date(day + "T00:00:00").toLocaleDateString("ko-KR", {
                      month: "long",
                      day: "numeric",
                      weekday: "short",
                    })}{" "}
                    · {dayLogs.length}건
                  </div>
                  <div
                    className="overflow-hidden rounded-[20px] border"
                    style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                  >
                    {dayLogs.map((log, idx) => (
                      <div
                        key={log.log_id}
                        style={{
                          borderBottom:
                            idx === dayLogs.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                        }}
                      >
                        <LogRow log={log} copiedRef={copiedRef} onCopy={copyRef} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {hasMore ? (
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  className={`${TYPO.body} rounded-[14px] border py-3 font-semibold`}
                  style={{
                    background: LEGACY_COLORS.s2,
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.text,
                  }}
                >
                  {loading ? "불러오는 중…" : "100건 더보기"}
                </button>
              ) : null}
            </div>
          )}
        </>
      ) : (
        <>
          <div
            className="flex items-center justify-between rounded-[14px] border px-4 py-2"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <IconButton
              icon={ChevronLeft}
              label="이전 달"
              size="sm"
              onClick={prevMonth}
              color={LEGACY_COLORS.muted2}
            />
            <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
              {calendarYear}년 {calendarMonth + 1}월
            </div>
            <IconButton
              icon={ChevronRight}
              label="다음 달"
              size="sm"
              onClick={nextMonth}
              color={LEGACY_COLORS.muted2}
            />
          </div>

          {calendarLoading ? (
            <div className={`${TYPO.body} py-10 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
              달력 데이터를 불러오는 중…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7">
                {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
                  <div
                    key={d}
                    className={`${TYPO.caption} py-1 text-center font-bold`}
                    style={{
                      color: i === 0 ? LEGACY_COLORS.red : i === 6 ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, idx) => {
                  if (day === null) return <div key={`empty-${idx}`} />;
                  const key = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayLogs = calendarDayMap.get(key) ?? [];
                  const isToday = key === todayKey;
                  const selected = key === selectedDay;
                  const has = dayLogs.length > 0;
                  const typeSet = new Set(
                    dayLogs.map((l) => {
                      if (l.transaction_type === "RECEIVE" || l.transaction_type === "PRODUCE") return "in";
                      if (l.transaction_type === "SHIP" || l.transaction_type === "BACKFLUSH") return "out";
                      return "adj";
                    }),
                  );
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDay(selected ? null : key)}
                      className="flex min-h-[52px] flex-col items-center rounded-[10px] p-1"
                      style={{
                        background: selected
                          ? LEGACY_COLORS.blue
                          : isToday
                            ? `${LEGACY_COLORS.blue as string}20`
                            : has
                              ? LEGACY_COLORS.s2
                              : "transparent",
                        border:
                          isToday && !selected
                            ? `1.5px solid ${LEGACY_COLORS.blue}`
                            : "1.5px solid transparent",
                      }}
                    >
                      <span
                        className={`${TYPO.caption} font-bold`}
                        style={{
                          color: selected
                            ? "#fff"
                            : idx % 7 === 0
                              ? LEGACY_COLORS.red
                              : idx % 7 === 6
                                ? LEGACY_COLORS.blue
                                : LEGACY_COLORS.text,
                        }}
                      >
                        {day}
                      </span>
                      {has ? (
                        <>
                          <span
                            className={`${TYPO.caption} mt-[2px] rounded-full px-[5px] font-black`}
                            style={{
                              background: selected ? "rgba(255,255,255,.25)" : `${LEGACY_COLORS.blue as string}22`,
                              color: selected ? "#fff" : LEGACY_COLORS.blue,
                            }}
                          >
                            {dayLogs.length}
                          </span>
                          <div className="mt-[2px] flex gap-[2px]">
                            {typeSet.has("in") && (
                              <div className="h-[4px] w-[4px] rounded-full" style={{ background: LEGACY_COLORS.green }} />
                            )}
                            {typeSet.has("out") && (
                              <div className="h-[4px] w-[4px] rounded-full" style={{ background: LEGACY_COLORS.red }} />
                            )}
                            {typeSet.has("adj") && (
                              <div className="h-[4px] w-[4px] rounded-full" style={{ background: LEGACY_COLORS.yellow }} />
                            )}
                          </div>
                        </>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 px-1">
                {[
                  [LEGACY_COLORS.green, "입고/생산"],
                  [LEGACY_COLORS.red, "출고/차감"],
                  [LEGACY_COLORS.yellow, "조정"],
                ].map(([color, label]) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className="h-[6px] w-[6px] rounded-full" style={{ background: color as string }} />
                    <span className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              {selectedDay ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className={`${TYPO.body} font-black`} style={{ color: LEGACY_COLORS.text }}>
                      {new Date(selectedDay + "T00:00:00").toLocaleDateString("ko-KR", {
                        month: "long",
                        day: "numeric",
                        weekday: "short",
                      })}{" "}
                      · {selectedDayLogs.length}건
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedDay(null)}
                      className={`${TYPO.caption}`}
                      style={{ color: LEGACY_COLORS.muted2 }}
                    >
                      닫기
                    </button>
                  </div>
                  <div
                    className="overflow-hidden rounded-[20px] border"
                    style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                  >
                    {selectedDayLogs.map((log, idx) => (
                      <div
                        key={log.log_id}
                        style={{
                          borderBottom:
                            idx === selectedDayLogs.length - 1
                              ? "none"
                              : `1px solid ${LEGACY_COLORS.border}`,
                        }}
                      >
                        <LogRow log={log} copiedRef={copiedRef} onCopy={copyRef} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </>
      )}

      <HistoryFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(DEFAULT_HISTORY_FILTERS)}
        employeeNames={employeeNames}
        modelNames={modelNames}
      />
    </div>
  );
}

function LogRow({
  log,
  copiedRef,
  onCopy,
}: {
  log: TransactionLog;
  copiedRef: string | null;
  onCopy: (ref: string) => void;
}) {
  return (
    <div className="flex w-full items-start gap-3 px-3 py-3 text-left">
      <span
        className={`${TYPO.caption} shrink-0 rounded-[8px] px-2 py-[2px] font-bold`}
        style={{
          background:
            log.transaction_type === "RECEIVE"
              ? `${LEGACY_COLORS.green as string}22`
              : log.transaction_type === "SHIP"
                ? `${LEGACY_COLORS.red as string}22`
                : `${LEGACY_COLORS.blue as string}22`,
          color: transactionColor(log.transaction_type),
        }}
      >
        {transactionLabel(log.transaction_type)}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`${TYPO.body} truncate font-black`} style={{ color: LEGACY_COLORS.text }}>
          {log.item_name}
        </div>
        <div className={`${TYPO.caption} mt-[1px]`} style={{ color: LEGACY_COLORS.muted2 }}>
          {new Date(log.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
          {" · "}
          <span className="font-mono">{log.erp_code}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {log.reference_no ? (
            <button
              type="button"
              onClick={() => onCopy(log.reference_no!)}
              className={`${TYPO.caption} flex items-center gap-1 rounded-[8px] px-2 py-[2px] font-semibold`}
              style={{
                background: LEGACY_COLORS.s3,
                color: copiedRef === log.reference_no ? LEGACY_COLORS.green : LEGACY_COLORS.blue,
              }}
            >
              <Copy size={10} />
              <span className="font-mono">
                {copiedRef === log.reference_no ? "복사됨" : log.reference_no}
              </span>
            </button>
          ) : null}
          {log.produced_by ? (
            <span className={TYPO.caption} style={{ color: LEGACY_COLORS.muted }}>
              {log.produced_by}
            </span>
          ) : null}
        </div>
        {log.notes ? (
          <div className={`${TYPO.caption} mt-1`} style={{ color: LEGACY_COLORS.muted }}>
            {log.notes}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <div
          className={`${TYPO.body} font-mono font-black`}
          style={{ color: transactionColor(log.transaction_type) }}
        >
          {log.quantity_change >= 0 ? "+" : ""}
          {formatNumber(log.quantity_change)}
        </div>
        <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
          → {formatNumber(log.quantity_after)}
        </div>
      </div>
    </div>
  );
}
