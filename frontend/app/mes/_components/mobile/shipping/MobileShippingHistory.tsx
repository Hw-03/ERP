"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ShippingHistoryStatus, ShippingRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { InlineSearch, SegmentedControl } from "../primitives";
import { MobileRoundedScrollArea } from "../primitives/MobileRoundedScrollArea";
import { ShippingHeader, ShippingItemName, ShippingStatus } from "./ShippingPresentation";
import { useShippingHistoryMonthsQuery, useShippingHistoryPagesQuery } from "@/lib/queries/useShippingQuery";

export interface MobileShippingHistoryProps {
  status: ShippingHistoryStatus;
  onStatusChange: (status: ShippingHistoryStatus) => void;
  onSelect: (request: ShippingRequest) => void;
  onBack: () => void;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" }).format(new Date(value));
}

export function MobileShippingHistory({ status, onStatusChange, onSelect, onBack }: MobileShippingHistoryProps) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [openYear, setOpenYear] = useState<number | null>(null);
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => { setOpenYear(null); setOpenMonth(null); }, [status]);

  const monthsQuery = useShippingHistoryMonthsQuery({ status });
  const months = useMemo(() => monthsQuery.data ?? [], [monthsQuery.data]);
  const years = useMemo(() => Array.from(new Set(months.map((row) => row.year))).sort((a, b) => b - a), [months]);
  const selectedMonth = months.find((row) => `${row.year}-${row.month}` === openMonth);
  const pagesQuery = useShippingHistoryPagesQuery(
    { status, ...(query ? { q: query } : selectedMonth ? { year: selectedMonth.year, month: selectedMonth.month } : {}) },
    Boolean(query || selectedMonth),
  );
  const rows = pagesQuery.data?.pages.flatMap((page) => page.requests) ?? [];
  const isSearching = query.length > 0;

  return <div className="flex min-h-0 flex-1 flex-col" style={{ background: LEGACY_COLORS.bg, color: LEGACY_COLORS.text }}>
    <ShippingHeader title="출하 이력" onBack={onBack} />
    <div className="mx-3 mb-3 grid shrink-0 gap-3">
      <SegmentedControl tabs={[{ id: "PICKED_UP", label: "완료" }, { id: "CANCELLED", label: "취소" }]} active={status} onChange={onStatusChange} className="[&>button]:min-h-11 [&>button]:text-sm" />
      <InlineSearch value={search} onChange={(value) => setSearch(value.slice(0, 100))} placeholder="인보이스 또는 PF 검색" ariaLabel="인보이스 또는 PF 검색" maxLength={100} className="[&_input]:!text-base [&_button]:h-11 [&_button]:w-11" />
    </div>
    <MobileRoundedScrollArea className="[&>*]:shrink-0">
    {monthsQuery.isError && <div role="alert" className="rounded-[14px] p-3 text-sm" style={{ background: LEGACY_COLORS.errorBg, color: LEGACY_COLORS.red }}>이력 월별 목록을 불러오지 못했습니다. <button type="button" onClick={() => void monthsQuery.refetch()} className="min-h-11 font-bold">다시 시도</button></div>}
    {!isSearching && <div className="grid gap-3">{years.map((year) => <section key={year} className="overflow-hidden rounded-[20px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}><button type="button" aria-expanded={openYear === year} onClick={() => { setOpenYear(openYear === year ? null : year); setOpenMonth(null); }} className="flex min-h-14 w-full items-center justify-between px-4 text-left text-base font-bold">{year}년 · {months.filter((row) => row.year === year).reduce((sum, row) => sum + row.count, 0)}건<ChevronDown size={20} className={openYear === year ? "rotate-180" : ""} /></button>{openYear === year && months.filter((row) => row.year === year).sort((a, b) => b.month - a.month).map((row) => { const key = `${row.year}-${row.month}`; return <div key={key} className="border-t" style={{ borderColor: LEGACY_COLORS.border }}><button type="button" aria-expanded={openMonth === key} onClick={() => setOpenMonth(openMonth === key ? null : key)} className="flex min-h-12 w-full items-center justify-between px-4 text-left text-sm font-bold" style={{ background: LEGACY_COLORS.s2 }}>{row.month}월 · {row.count}건<ChevronDown size={20} className={openMonth === key ? "rotate-180" : ""} /></button>{openMonth === key && <div className="px-4 pb-2">{renderRows()}</div>}</div>; })}</section>)}{monthsQuery.isLoading && <p role="status" className="py-8 text-center text-sm">이력을 불러오는 중입니다.</p>}{!monthsQuery.isLoading && years.length === 0 && !monthsQuery.isError && <p className="py-8 text-center text-sm">출하 이력이 없습니다.</p>}</div>}
    {isSearching && <section className="rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}><h2 className="mb-2 text-base font-bold">검색 결과</h2>{renderRows()}</section>}
    </MobileRoundedScrollArea>
  </div>;

  function renderRows() {
    if (pagesQuery.isLoading) return <p className="py-4 text-center text-sm">이력을 불러오는 중입니다.</p>;
    if (pagesQuery.isError && !pagesQuery.data) return <div role="alert" className="py-4 text-sm" style={{ color: LEGACY_COLORS.red }}>이력을 불러오지 못했습니다. <button type="button" onClick={() => void pagesQuery.refetch()} className="min-h-11 font-bold">다시 시도</button></div>;
    return <div>{rows.length === 0 && <p className="py-4 text-center text-sm">일치하는 출하가 없습니다.</p>}{rows.map((request) => <article key={request.request_id} className="space-y-2 border-b py-3 last:border-b-0" style={{ borderColor: LEGACY_COLORS.border }}>
      <ShippingStatus status={request.status} />
      <ShippingItemName name={request.final_pf_item_name ?? request.base_pf_item_name} className="text-base font-bold" />
      <div className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 break-all" style={{ color: LEGACY_COLORS.muted2 }}>{request.final_pf_mes_code ?? request.base_pf_mes_code ?? "코드 없음"}</span><span className="shrink-0 whitespace-nowrap font-bold">{request.request_quantity}대</span></div>
      <button type="button" onClick={() => onSelect(request)} aria-label={`${request.final_pf_item_name ?? request.base_pf_item_name} 이력 상세`} className="flex min-h-11 w-full items-center gap-2 text-left text-sm"><span className="min-w-0 flex-1"><span className="block break-all">{request.invoice_number ?? "인보이스 없음"}</span><span className="block text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{formatDate(request.picked_up_at ?? request.cancelled_at ?? request.created_at)}</span></span><ChevronRight size={20} style={{ color: LEGACY_COLORS.blue }} /></button>
    </article>)}{pagesQuery.isFetchNextPageError && <div role="alert" className="text-sm" style={{ color: LEGACY_COLORS.red }}>다음 이력을 불러오지 못했습니다. <button type="button" onClick={() => void pagesQuery.fetchNextPage()} className="min-h-11 font-bold">다시 시도</button></div>}{pagesQuery.hasNextPage && !pagesQuery.isFetchNextPageError && <button type="button" disabled={pagesQuery.isFetchingNextPage} onClick={() => void pagesQuery.fetchNextPage()} className="mt-2 min-h-11 w-full rounded-[12px] border text-sm font-bold disabled:opacity-45" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}>{pagesQuery.isFetchingNextPage ? "불러오는 중" : "더 보기"}</button>}</div>;
  }
}
