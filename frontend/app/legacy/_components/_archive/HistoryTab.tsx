"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, ChevronLeft, ChevronRight, List, CalendarDays } from "lucide-react";
import { api, type Item, type TransactionLog, type TransactionType } from "@/lib/api";
import { FilterPills } from "./FilterPills";
import {
  LEGACY_COLORS,
  employeeColor,
  firstEmployeeLetter,
  formatNumber,
  normalizeModel,
  transactionColor,
  transactionLabel,
} from "./legacyUi";

const TYPE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "입고", value: "RECEIVE" },
  { label: "출고", value: "SHIP" },
  { label: "조정", value: "ADJUST" },
  { label: "생산입고", value: "PRODUCE" },
  { label: "자동차감", value: "BACKFLUSH" },
];

const DATE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "오늘", value: "TODAY" },
  { label: "이번주", value: "WEEK" },
  { label: "이번달", value: "MONTH" },
];

const PAGE_SIZE = 100;

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

function toDateKey(dateStr: string) {
  const d = parseUtc(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function LogRow({ log, copiedRef, onCopy }: { log: TransactionLog; copiedRef: string | null; onCopy: (ref: string) => void }) {
  return (
    <div
      className="flex w-full items-start gap-3 px-[14px] py-[12px] text-left"
    >
      <span
        className="shrink-0 rounded px-[7px] py-[2px] text-[10px] font-bold"
        style={{
          background:
            log.transaction_type === "RECEIVE"
              ? "rgba(31,209,122,.15)"
              : log.transaction_type === "SHIP"
                ? "rgba(242,95,92,.15)"
                : "rgba(79,142,247,.15)",
          color: transactionColor(log.transaction_type),
        }}
      >
        {transactionLabel(log.transaction_type)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{log.item_name}</div>
        <div className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          {new Date(log.created_at).toLocaleString("ko-KR")}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
          <span>{log.erp_code}</span>
          {log.reference_no ? (
            <button
              onClick={() => onCopy(log.reference_no!)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-white/10"
              style={{ color: copiedRef === log.reference_no ? LEGACY_COLORS.green : LEGACY_COLORS.blue }}
            >
              <Copy className="h-2.5 w-2.5" />
              <span className="font-mono">{copiedRef === log.reference_no ? "복사됨" : log.reference_no}</span>
            </button>
          ) : null}
        </div>
        {log.produced_by ? (
          <div className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
            👤 {log.produced_by}
          </div>
        ) : null}
        {log.notes ? (
          <div className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
            {log.notes}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-sm font-bold" style={{ color: transactionColor(log.transaction_type) }}>
          {log.quantity_change >= 0 ? "+" : ""}
          {formatNumber(log.quantity_change)}
        </div>
        <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
          → {formatNumber(log.quantity_after)}
        </div>
      </div>
    </div>
  );
}

export function HistoryTab({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [calendarLogs, setCalendarLogs] = useState<TransactionLog[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [modelFilter, setModelFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);

  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth()); // 0-based
  const [selectedDay, setSelectedDay] = useState<string | null>(null); // "YYYY-MM-DD"

  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  function copyRef(ref: string) {
    void navigator.clipboard.writeText(ref).then(() => {
      setCopiedRef(ref);
      setTimeout(() => setCopiedRef(null), 1500);
    });
  }

  useEffect(() => {
    Promise.all([
      api.getTransactions({ limit: PAGE_SIZE, skip: 0 }),
      api.getItems({ limit: 2000 }),
    ]).then(([nextLogs, nextItems]) => {
      setLogs(nextLogs);
      setItems(nextItems);
      setLoading(false);
    });
  }, []);

  // 달력 모드 진입 또는 월 변경 시 해당 월 전체 데이터 fetch
  useEffect(() => {
    if (viewMode !== "calendar") return;
    setCalendarLoading(true);
    setSelectedDay(null);
    api.getTransactions({ limit: 2000, skip: 0 }).then((nextLogs) => {
      setCalendarLogs(nextLogs);
      setCalendarLoading(false);
    });
  }, [viewMode, calendarYear, calendarMonth]);

  const itemModelMap = useMemo(() => {
    return new Map(items.map((item) => [item.item_id, normalizeModel(item.legacy_model)]));
  }, [items]);

  const employeeNames = useMemo(() => {
    const names = Array.from(
      new Set(
        logs
          .map((log) => parseEmployeeName(log.produced_by))
          .filter(Boolean),
      ),
    );
    return names.sort((a, b) => a.localeCompare(b, "ko-KR"));
  }, [logs]);

  const modelNames = useMemo(() => {
    const names = Array.from(new Set(logs.map((log) => itemModelMap.get(log.item_id) ?? "공용")));
    return names.sort((a, b) => a.localeCompare(b, "ko-KR"));
  }, [itemModelMap, logs]);

  const filteredLogs = useMemo(() => {
    const start = getPeriodStart(dateFilter);
    return logs.filter((log) => {
      if (typeFilter !== "ALL" && log.transaction_type !== (typeFilter as TransactionType)) return false;
      if (employeeFilter !== "ALL" && parseEmployeeName(log.produced_by) !== employeeFilter) return false;
      if (modelFilter !== "ALL" && (itemModelMap.get(log.item_id) ?? "공용") !== modelFilter) return false;
      if (start && new Date(log.created_at) < start) return false;
      if (search.trim()) {
        const keyword = search.trim().toLowerCase();
        const haystack = `${log.item_name} ${log.erp_code} ${log.reference_no ?? ""} ${log.notes ?? ""}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });
  }, [dateFilter, employeeFilter, itemModelMap, logs, modelFilter, search, typeFilter]);

  const canLoadMore = logs.length >= page * PAGE_SIZE;

  const summary = useMemo(() => {
    const total = filteredLogs.length;
    const inSum = filteredLogs
      .filter((l) => l.transaction_type === "RECEIVE" || l.transaction_type === "PRODUCE")
      .reduce((acc, l) => acc + Math.abs(Number(l.quantity_change)), 0);
    const outSum = filteredLogs
      .filter((l) => l.transaction_type === "SHIP" || l.transaction_type === "BACKFLUSH")
      .reduce((acc, l) => acc + Math.abs(Number(l.quantity_change)), 0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = filteredLogs.filter((l) => new Date(l.created_at) >= todayStart).length;
    return { total, inSum, outSum, todayCount };
  }, [filteredLogs]);

  const dateRange = useMemo(() => {
    if (filteredLogs.length === 0) return null;
    const oldest = filteredLogs[filteredLogs.length - 1].created_at;
    const newest = filteredLogs[0].created_at;
    const fmt = (d: string) => new Date(d).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
    return oldest === newest ? fmt(oldest) : `${fmt(oldest)} ~ ${fmt(newest)}`;
  }, [filteredLogs]);

  // 달력용: 선택 월의 로그를 날짜별로 그룹화
  const calendarDayMap = useMemo(() => {
    const map = new Map<string, TransactionLog[]>();
    for (const log of calendarLogs) {
      const d = parseUtc(log.created_at);
      if (d.getFullYear() !== calendarYear || d.getMonth() !== calendarMonth) continue;
      const key = toDateKey(log.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(log);
    }
    return map;
  }, [calendarLogs, calendarYear, calendarMonth]);

  const selectedDayLogs = useMemo(() => {
    if (!selectedDay) return [];
    return calendarDayMap.get(selectedDay) ?? [];
  }, [calendarDayMap, selectedDay]);

  function prevMonth() {
    if (calendarMonth === 0) {
      setCalendarYear((y) => y - 1);
      setCalendarMonth(11);
    } else {
      setCalendarMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (calendarMonth === 11) {
      setCalendarYear((y) => y + 1);
      setCalendarMonth(0);
    } else {
      setCalendarMonth((m) => m + 1);
    }
  }

  // 달력 그리드 계산
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarYear, calendarMonth]);

  const todayKey = toDateKey(new Date().toISOString());

  return (
    <div className="pb-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-sm font-bold"
          style={{ color: LEGACY_COLORS.blue }}
        >
          ← 이전 화면으로
        </button>

        {/* 목록/달력 토글 */}
        <div className="flex overflow-hidden rounded-[10px] border" style={{ borderColor: LEGACY_COLORS.border }}>
          <button
            onClick={() => setViewMode("list")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold transition-colors"
            style={{
              background: viewMode === "list" ? LEGACY_COLORS.blue : "transparent",
              color: viewMode === "list" ? "#fff" : LEGACY_COLORS.muted2,
            }}
          >
            <List className="h-3 w-3" />
            목록
          </button>
          <button
            onClick={() => setViewMode("calendar")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold transition-colors"
            style={{
              background: viewMode === "calendar" ? LEGACY_COLORS.blue : "transparent",
              color: viewMode === "calendar" ? "#fff" : LEGACY_COLORS.muted2,
            }}
          >
            <CalendarDays className="h-3 w-3" />
            달력
          </button>
        </div>
      </div>

      {/* ── 달력 뷰 ── */}
      {viewMode === "calendar" ? (
        <div>
          {/* 월 네비게이션 */}
          <div className="mb-3 flex items-center justify-between rounded-[14px] border px-4 py-2.5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <button onClick={prevMonth} className="rounded-full p-1 hover:bg-white/10">
              <ChevronLeft className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
            </button>
            <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
              {calendarYear}년 {calendarMonth + 1}월
            </span>
            <button onClick={nextMonth} className="rounded-full p-1 hover:bg-white/10">
              <ChevronRight className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
            </button>
          </div>

          {calendarLoading ? (
            <div className="py-8 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>달력 데이터를 불러오는 중...</div>
          ) : (
            <>
              {/* 요일 헤더 */}
              <div className="mb-1 grid grid-cols-7">
                {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
                  <div key={d} className="py-1 text-center text-[10px] font-bold"
                    style={{ color: i === 0 ? "#f25f5c" : i === 6 ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}>
                    {d}
                  </div>
                ))}
              </div>

              {/* 날짜 그리드 */}
              <div className="grid grid-cols-7 gap-[3px]">
                {calendarDays.map((day, idx) => {
                  if (day === null) return <div key={`empty-${idx}`} />;
                  const key = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayLogs = calendarDayMap.get(key) ?? [];
                  const isToday = key === todayKey;
                  const isSelected = key === selectedDay;
                  const hasLogs = dayLogs.length > 0;

                  // 유형별 점 색상 집합
                  const typeSet = new Set(dayLogs.map((l) => {
                    if (l.transaction_type === "RECEIVE" || l.transaction_type === "PRODUCE") return "in";
                    if (l.transaction_type === "SHIP" || l.transaction_type === "BACKFLUSH") return "out";
                    return "adj";
                  }));

                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDay(isSelected ? null : key)}
                      className="flex min-h-[52px] flex-col items-center rounded-[10px] p-1 transition-colors"
                      style={{
                        background: isSelected
                          ? LEGACY_COLORS.blue
                          : isToday
                            ? "rgba(79,142,247,.12)"
                            : hasLogs
                              ? LEGACY_COLORS.s2
                              : "transparent",
                        border: isToday && !isSelected ? `1.5px solid ${LEGACY_COLORS.blue}` : "1.5px solid transparent",
                      }}
                    >
                      <span
                        className="text-[11px] font-bold"
                        style={{
                          color: isSelected ? "#fff" : idx % 7 === 0 ? "#f25f5c" : idx % 7 === 6 ? LEGACY_COLORS.blue : LEGACY_COLORS.text,
                        }}
                      >
                        {day}
                      </span>
                      {hasLogs && (
                        <>
                          <span
                            className="mt-0.5 rounded-full px-[5px] py-[1px] text-[8px] font-black"
                            style={{
                              background: isSelected ? "rgba(255,255,255,.25)" : "rgba(79,142,247,.15)",
                              color: isSelected ? "#fff" : LEGACY_COLORS.blue,
                            }}
                          >
                            {dayLogs.length}
                          </span>
                          <div className="mt-0.5 flex gap-[2px]">
                            {typeSet.has("in") && <div className="h-[4px] w-[4px] rounded-full" style={{ background: isSelected ? "rgba(255,255,255,.7)" : "#1fd17a" }} />}
                            {typeSet.has("out") && <div className="h-[4px] w-[4px] rounded-full" style={{ background: isSelected ? "rgba(255,255,255,.7)" : "#f25f5c" }} />}
                            {typeSet.has("adj") && <div className="h-[4px] w-[4px] rounded-full" style={{ background: isSelected ? "rgba(255,255,255,.7)" : "#f5a623" }} />}
                          </div>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 범례 */}
              <div className="mt-2 flex gap-3 px-1">
                {[["#1fd17a", "입고/생산"], ["#f25f5c", "출고/차감"], ["#f5a623", "조정"]].map(([color, label]) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className="h-[6px] w-[6px] rounded-full" style={{ background: color }} />
                    <span className="text-[9px]" style={{ color: LEGACY_COLORS.muted2 }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* 선택한 날짜 상세 */}
              {selectedDay && (
                <div className="mt-3">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-[11px] font-bold" style={{ color: LEGACY_COLORS.text }}>
                      {new Date(selectedDay + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })} — {selectedDayLogs.length}건
                    </span>
                    <button onClick={() => setSelectedDay(null)} className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>닫기</button>
                  </div>
                  <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                    {selectedDayLogs.length === 0 ? (
                      <div className="py-4 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>이 날의 거래가 없습니다.</div>
                    ) : (
                      selectedDayLogs.map((log, index) => (
                        <div key={log.log_id} style={{ borderBottom: index === selectedDayLogs.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}>
                          <LogRow log={log} copiedRef={copiedRef} onCopy={copyRef} />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* ── 목록 뷰 ── */
        <>
          <div className="mb-2 flex items-center gap-2 rounded-[11px] border px-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <span>🔍</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="품명·코드·참조번호 검색"
              className="w-full bg-transparent py-[10px] text-sm outline-none"
              style={{ color: LEGACY_COLORS.text }}
            />
          </div>

          <FilterPills options={TYPE_OPTIONS} value={typeFilter} onChange={setTypeFilter} />

          <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted }}>
            👤 담당 직원
          </div>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setEmployeeFilter("ALL")}
              className="shrink-0 px-1 transition-all hover:brightness-110"
            >
              <div className="mb-1 flex justify-center">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full border-[2.5px] text-[11px] font-black text-white"
                  style={{
                    background: LEGACY_COLORS.muted,
                    borderColor: employeeFilter === "ALL" ? LEGACY_COLORS.blue : "transparent",
                    boxShadow: employeeFilter === "ALL" ? "0 0 0 3px rgba(79,142,247,.2)" : "none",
                  }}
                >
                  전체
                </div>
              </div>
              <div className="text-[9px] font-semibold" style={{ color: employeeFilter === "ALL" ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}>
                전체
              </div>
            </button>
            {employeeNames.map((employeeName) => {
              const active = employeeFilter === employeeName;
              return (
                <button key={employeeName} onClick={() => setEmployeeFilter(employeeName)} className="shrink-0 px-1 transition-all hover:brightness-110">
                  <div className="mb-1 flex justify-center">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-full border-[2.5px] text-base font-black text-white"
                      style={{
                        background: employeeColor(employeeName),
                        borderColor: active ? LEGACY_COLORS.blue : "transparent",
                        boxShadow: active ? "0 0 0 3px rgba(79,142,247,.2)" : "none",
                      }}
                    >
                      {firstEmployeeLetter(employeeName)}
                    </div>
                  </div>
                  <div className="max-w-[48px] truncate text-[9px] font-semibold" style={{ color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}>
                    {employeeName}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted }}>
            🔧 모델
          </div>
          <FilterPills
            options={[{ label: "전체", value: "ALL" }, ...modelNames.map((entry) => ({ label: entry, value: entry }))]}
            value={modelFilter}
            onChange={setModelFilter}
            activeColor={LEGACY_COLORS.cyan}
          />

          <FilterPills options={DATE_OPTIONS} value={dateFilter} onChange={setDateFilter} activeColor={LEGACY_COLORS.purple} />

          {/* 요약 통계 */}
          <div className="mb-3 grid grid-cols-4 gap-1.5">
            {[
              { label: "전체", value: summary.total, color: LEGACY_COLORS.blue },
              { label: "입고합", value: summary.inSum, color: LEGACY_COLORS.green },
              { label: "출고합", value: summary.outSum, color: LEGACY_COLORS.red },
              { label: "오늘", value: summary.todayCount, color: LEGACY_COLORS.cyan },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-[14px] border p-2 text-center" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                <div className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
                <div className="mt-1 font-mono text-[15px] font-black" style={{ color }}>{formatNumber(value)}</div>
              </div>
            ))}
          </div>
          <div className="mb-2 flex items-center justify-between px-[2px]">
            <span className="text-[10px] font-mono font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              {filteredLogs.length}건
            </span>
            {dateRange && (
              <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>{dateRange}</span>
            )}
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
              내역을 불러오는 중...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
              거래 이력이 없습니다.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
              {filteredLogs.map((log, index) => (
                <div
                  key={log.log_id}
                  style={{ borderBottom: index === filteredLogs.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}
                >
                  <LogRow log={log} copiedRef={copiedRef} onCopy={copyRef} />
                </div>
              ))}
            </div>
          )}

          {canLoadMore ? (
            <button
              onClick={() => {
                const nextPage = page + 1;
                setPage(nextPage);
                void api.getTransactions({ limit: PAGE_SIZE, skip: nextPage * PAGE_SIZE - PAGE_SIZE }).then((nextLogs) => {
                  setLogs((current) => [...current, ...nextLogs]);
                });
              }}
              className="mt-3 w-full py-[14px] text-center text-[13px] font-bold"
              style={{ color: LEGACY_COLORS.blue }}
            >
              100건 더보기
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
