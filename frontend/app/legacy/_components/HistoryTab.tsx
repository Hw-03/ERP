"use client";

import { useEffect, useMemo, useState } from "react";
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

export function HistoryTab({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [modelFilter, setModelFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

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
        const haystack = `${log.item_name} ${log.item_code} ${log.reference_no ?? ""} ${log.notes ?? ""}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });
  }, [dateFilter, employeeFilter, itemModelMap, logs, modelFilter, search, typeFilter]);

  const canLoadMore = logs.length >= page * PAGE_SIZE;

  return (
    <div className="pb-4">
      <button
        onClick={onClose}
        className="mb-3 flex items-center gap-2 text-sm font-bold"
        style={{ color: LEGACY_COLORS.blue }}
      >
        ← 이전 화면으로
      </button>

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

      <div className="mb-[6px] px-[2px] text-[10px] font-mono" style={{ color: LEGACY_COLORS.muted2 }}>
        {filteredLogs.length}건
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
            <button
              key={log.log_id}
              className="flex w-full items-start gap-3 px-[14px] py-[12px] text-left transition-colors hover:bg-white/[0.12]"
              style={{ borderBottom: index === filteredLogs.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}
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
                <div className="mt-1 text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
                  {log.item_code}
                  {log.reference_no ? ` · ref:${log.reference_no}` : ""}
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
            </button>
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
    </div>
  );
}
