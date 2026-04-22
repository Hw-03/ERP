"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Calendar, ChevronDown, Download, Search, TrendingDown, TrendingUp } from "lucide-react";
import { api, type TransactionLog, type TransactionType } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import {
  LEGACY_COLORS,
  formatNumber,
  transactionColor,
  transactionLabel,
} from "./legacyUi";

const PAGE_SIZE = 100;

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

const CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
  RM: { label: "원자재", color: LEGACY_COLORS.blue, bg: "rgba(101,169,255,.16)" },
  TA: { label: "튜브조립", color: LEGACY_COLORS.cyan, bg: "rgba(78,201,245,.16)" },
  TF: { label: "튜브완성", color: LEGACY_COLORS.cyan, bg: "rgba(78,201,245,.16)" },
  HA: { label: "고압조립", color: LEGACY_COLORS.yellow, bg: "rgba(246,198,103,.16)" },
  HF: { label: "고압완성", color: LEGACY_COLORS.yellow, bg: "rgba(246,198,103,.16)" },
  VA: { label: "진공조립", color: LEGACY_COLORS.purple, bg: "rgba(142,125,255,.16)" },
  VF: { label: "진공완성", color: LEGACY_COLORS.purple, bg: "rgba(142,125,255,.16)" },
  BA: { label: "본체조립", color: "#f97316", bg: "rgba(249,115,22,.16)" },
  BF: { label: "본체완성", color: "#f97316", bg: "rgba(249,115,22,.16)" },
  FG: { label: "완제품", color: LEGACY_COLORS.green, bg: "rgba(67,211,157,.16)" },
  UK: { label: "미분류", color: LEGACY_COLORS.muted2, bg: "rgba(157,173,199,.16)" },
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

function formatDate(iso: string) {
  const d = new Date(iso);
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
      className="whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition-all hover:brightness-110"
      style={{
        background: active ? `${tone}22` : LEGACY_COLORS.s2,
        borderColor: active ? tone : LEGACY_COLORS.border,
        color: active ? tone : LEGACY_COLORS.muted2,
      }}
    >
      {label}
    </button>
  );
}

export function DesktopHistoryView() {
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [selected, setSelected] = useState<TransactionLog | null>(null);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editingNotes, setEditingNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const [itemRecentLogs, setItemRecentLogs] = useState<TransactionLog[]>([]);

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

  const filteredLogs = useMemo(() => {
    const start = getPeriodStart(dateFilter);
    return logs.filter((log) => {
      if (typeFilter !== "ALL" && log.transaction_type !== (typeFilter as TransactionType)) return false;
      if (start && new Date(log.created_at) < start) return false;
      if (search.trim()) {
        const kw = search.trim().toLowerCase();
        const hay = `${log.item_name} ${log.item_code} ${log.reference_no ?? ""} ${log.notes ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [logs, typeFilter, dateFilter, search]);

  const stats = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    let receiveSum = 0;
    let shipSum = 0;
    let todayCount = 0;
    for (const log of filteredLogs) {
      if (log.transaction_type === "RECEIVE" || log.transaction_type === "PRODUCE") {
        receiveSum += Number(log.quantity_change);
      }
      if (log.transaction_type === "SHIP" || log.transaction_type === "BACKFLUSH") {
        shipSum += Math.abs(Number(log.quantity_change));
      }
      if (new Date(log.created_at) >= todayStart) todayCount++;
    }
    return { total: filteredLogs.length, receiveSum, shipSum, todayCount };
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
                <div className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>전체 건수</div>
                <div className="font-mono text-2xl font-black">{formatNumber(stats.total)}</div>
                <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>필터 기준</div>
              </div>

              <div
                className="flex flex-col gap-1 rounded-[20px] border p-4"
                style={{ background: "rgba(67,211,157,.06)", borderColor: "rgba(67,211,157,.22)" }}
              >
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.green }}>
                  <TrendingUp className="h-3.5 w-3.5" />
                  입고 합계
                </div>
                <div className="font-mono text-2xl font-black" style={{ color: LEGACY_COLORS.green }}>+{formatNumber(stats.receiveSum)}</div>
                <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>RECEIVE · PRODUCE</div>
              </div>

              <div
                className="flex flex-col gap-1 rounded-[20px] border p-4"
                style={{ background: "rgba(255,123,123,.06)", borderColor: "rgba(255,123,123,.22)" }}
              >
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.red }}>
                  <TrendingDown className="h-3.5 w-3.5" />
                  출고 합계
                </div>
                <div className="font-mono text-2xl font-black" style={{ color: LEGACY_COLORS.red }}>-{formatNumber(stats.shipSum)}</div>
                <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>SHIP · BACKFLUSH</div>
              </div>

              <div
                className="flex flex-col gap-1 rounded-[20px] border p-4"
                style={{ background: "rgba(101,169,255,.06)", borderColor: "rgba(101,169,255,.22)" }}
              >
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.blue }}>
                  <Calendar className="h-3.5 w-3.5" />
                  오늘 건수
                </div>
                <div className="font-mono text-2xl font-black" style={{ color: LEGACY_COLORS.blue }}>{formatNumber(stats.todayCount)}</div>
                <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>금일 거래</div>
              </div>
            </div>
          </section>

          {/* ── 필터 바 ── */}
          <section className="card">
            <div className="flex flex-col gap-3">
              {/* 검색 + CSV */}
              <div className="flex items-center gap-3">
                <div
                  className="flex flex-1 items-center gap-2 rounded-[14px] border px-3 py-2.5"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                >
                  <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="품명·코드·참조번호·메모 검색"
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: LEGACY_COLORS.text }}
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>✕</button>
                  )}
                </div>
                <a
                  href={api.getTransactionsExportUrl({
                    transaction_type: typeFilter !== "ALL" ? typeFilter : undefined,
                    search: search || undefined,
                  })}
                  download
                  className="flex shrink-0 items-center gap-2 rounded-[14px] border px-4 py-2.5 text-xs font-bold transition-all hover:brightness-110"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.green }}
                >
                  <Download className="h-3.5 w-3.5" />
                  엑셀
                </a>
              </div>

              {/* 유형 필터 */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>유형</span>
                {TYPE_OPTIONS.map((opt) => (
                  <Chip key={opt.value} active={typeFilter === opt.value} label={opt.label} onClick={() => setTypeFilter(opt.value)} />
                ))}
              </div>

              {/* 기간 필터 */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>기간</span>
                {DATE_OPTIONS.map((opt) => (
                  <Chip key={opt.value} active={dateFilter === opt.value} label={opt.label} onClick={() => setDateFilter(opt.value)} tone={LEGACY_COLORS.purple} />
                ))}
              </div>
            </div>
          </section>

          {/* ── 메인 테이블 ── */}
          <section className="card" style={{ backgroundImage: "linear-gradient(rgba(101,169,255,.04), rgba(101,169,255,.04))" }}>
            <div
              className="sticky top-0 z-20 -mx-5 -mt-5 mb-4 flex items-center gap-3 rounded-t-[28px] px-5 pb-3 pt-5"
              style={{ background: LEGACY_COLORS.bg, backgroundImage: "linear-gradient(rgba(101,169,255,.04), rgba(101,169,255,.04))" }}
            >
              <div className="shrink-0 text-base font-bold">입출고 내역</div>
              <span className="font-mono text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{filteredLogs.length}건</span>
            </div>

            {loading ? (
              <div className="py-16 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>내역을 불러오는 중...</div>
            ) : filteredLogs.length === 0 ? (
              <div className="py-16 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>거래 이력이 없습니다.</div>
            ) : (
              <div className="overflow-x-auto rounded-[24px] border" style={{ borderColor: LEGACY_COLORS.border }}>
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr style={{ background: LEGACY_COLORS.s2 }}>
                      {["일시", "구분", "품목명", "코드", "분류", "수량", "재고 변화", "담당자", "참조번호", "메모"].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap border-b px-4 py-3 text-left text-[11px] font-bold"
                          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                        >
                          {h}
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
                          <td className="whitespace-nowrap border-b px-4 py-3 font-mono text-[12px]" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                            {formatDate(log.created_at)}
                          </td>

                          {/* 구분 */}
                          <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                            <span
                              className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold"
                              style={{ background: `${tcolor}22`, color: tcolor }}
                            >
                              {transactionLabel(log.transaction_type)}
                            </span>
                          </td>

                          {/* 품목명 */}
                          <td className="max-w-[180px] border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                            <div className="truncate font-semibold">{log.item_name}</div>
                          </td>

                          {/* 코드 */}
                          <td className="whitespace-nowrap border-b px-4 py-3 font-mono text-[12px]" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                            {log.item_code}
                          </td>

                          {/* 분류 */}
                          <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                            <span
                              className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold"
                              style={{ background: cat.bg, color: cat.color }}
                            >
                              {cat.label}
                            </span>
                          </td>

                          {/* 수량 */}
                          <td
                            className="whitespace-nowrap border-b px-4 py-3 text-right font-mono font-bold"
                            style={{ borderColor: LEGACY_COLORS.border, color: tcolor }}
                          >
                            {Number(log.quantity_change) >= 0 ? "+" : ""}{formatNumber(log.quantity_change)}
                          </td>

                          {/* 재고 변화 */}
                          <td className="whitespace-nowrap border-b px-4 py-3 font-mono text-[12px]" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                            {log.quantity_before != null ? formatNumber(log.quantity_before) : "-"}
                            <span className="mx-1">→</span>
                            {log.quantity_after != null ? formatNumber(log.quantity_after) : "-"}
                          </td>

                          {/* 담당자 */}
                          <td className="whitespace-nowrap border-b px-4 py-3 text-[12px]" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                            {log.produced_by?.split("(")[0]?.trim() ?? "-"}
                          </td>

                          {/* 참조번호 */}
                          <td className="whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                            {log.reference_no ? (
                              <button
                                onClick={(e) => copyRef(log.reference_no!, e)}
                                className="rounded border px-2 py-0.5 font-mono text-[12px] transition-all hover:brightness-110"
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
                            <div className="truncate text-[12px]">{log.notes || "-"}</div>
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
                className="mt-4 flex w-full items-center justify-center gap-2 py-3 text-sm font-bold disabled:opacity-50"
                style={{ color: LEGACY_COLORS.blue }}
              >
                <ChevronDown className="h-4 w-4" />
                {loadingMore ? "불러오는 중..." : "100건 더보기"}
              </button>
            )}
          </section>
        </div>
      </div>

      {/* ── 우측: 상세 패널 ── */}
      <DesktopRightPanel
        title={selected ? selected.item_name : "항목을 선택하세요"}
        subtitle={selected ? `${selected.item_code} · ${formatDate(selected.created_at)}` : undefined}
      >
        {selected ? (
          <div className="space-y-4">
            {/* 거래 유형 + 수량 강조 */}
            <div
              className="rounded-[24px] border p-5 text-center"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <span
                className="inline-flex rounded-full px-4 py-1.5 text-xs font-bold"
                style={{ background: `${transactionColor(selected.transaction_type)}22`, color: transactionColor(selected.transaction_type) }}
              >
                {transactionLabel(selected.transaction_type)}
              </span>
              <div className="mt-3 font-mono text-4xl font-black" style={{ color: transactionColor(selected.transaction_type) }}>
                {Number(selected.quantity_change) >= 0 ? "+" : ""}
                {formatNumber(selected.quantity_change)}
                <span className="ml-2 text-base font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>{selected.item_unit}</span>
              </div>
              <div className="mt-2 font-mono text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                {selected.quantity_before != null ? formatNumber(selected.quantity_before) : "-"}
                <span className="mx-2">→</span>
                {selected.quantity_after != null ? formatNumber(selected.quantity_after) : "-"}
              </div>
            </div>

            {/* 상세 정보 */}
            <div className="space-y-2.5 rounded-[24px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              {(
                [
                  ["품목명", selected.item_name],
                  ["품목코드", selected.item_code],
                  ["분류", (CATEGORY_META[selected.item_category] ?? { label: selected.item_category }).label],
                  ["단위", selected.item_unit],
                  ["담당자", selected.produced_by ?? "-"],
                  ["참조번호", selected.reference_no ?? "-"],
                  ["일시", new Date(selected.created_at).toLocaleString("ko-KR")],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{label}</span>
                  <span className="text-right text-sm font-semibold break-all" style={{ color: LEGACY_COLORS.text }}>{value}</span>
                </div>
              ))}
            </div>

            {/* 메모 편집 */}
            <div className="rounded-[24px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>메모</div>
              <textarea
                value={editingNotes}
                onChange={(e) => setEditingNotes(e.target.value)}
                placeholder="메모를 입력하세요..."
                className="min-h-[80px] w-full rounded-[14px] border px-3 py-2.5 text-sm outline-none"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />
              <button
                onClick={() => void saveNotes()}
                disabled={savingNotes || editingNotes === (selected.notes ?? "")}
                className="mt-2 w-full rounded-[14px] py-2.5 text-sm font-bold text-white disabled:opacity-40"
                style={{ background: LEGACY_COLORS.blue }}
              >
                {savingNotes ? "저장 중..." : "메모 저장"}
              </button>
            </div>

            {/* 이 품목의 최근 거래 */}
            {itemRecentLogs.length > 0 && (
              <div className="rounded-[24px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
                  이 품목의 최근 거래
                </div>
                <div className="space-y-2">
                  {itemRecentLogs.map((log) => (
                    <button
                      key={log.log_id}
                      onClick={() => setSelected(log)}
                      className="flex w-full items-center justify-between rounded-[14px] border p-3 text-left transition-all hover:brightness-110"
                      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                    >
                      <div>
                        <span
                          className="inline-flex rounded px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: `${transactionColor(log.transaction_type)}22`, color: transactionColor(log.transaction_type) }}
                        >
                          {transactionLabel(log.transaction_type)}
                        </span>
                        <div className="mt-1 font-mono text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                          {formatDate(log.created_at)}
                        </div>
                      </div>
                      <div className="font-mono text-sm font-bold" style={{ color: transactionColor(log.transaction_type) }}>
                        {Number(log.quantity_change) >= 0 ? "+" : ""}{formatNumber(log.quantity_change)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center" style={{ color: LEGACY_COLORS.muted2 }}>
              <Activity className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <div className="text-sm">테이블에서 항목을 클릭하면<br />상세 내용이 표시됩니다</div>
            </div>
          </div>
        )}
      </DesktopRightPanel>
    </div>
  );
}
