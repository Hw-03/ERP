"use client";

import { Building2, Layers, Sliders } from "lucide-react";
import type { TransactionSummary } from "@/lib/api/production";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { dataRevealClassName } from "../common/LoadingSkeleton";

export interface HistoryStatsBarProps {
  /** 기간만 필터한 전체 — 박스 숫자/Y(분모). 필터와 무관하게 고정. */
  baseline: TransactionSummary | null;
  /** 현재 필터(거래종류/검색/부서/모델)가 적용된 요약. */
  currentSummary?: TransactionSummary | null;
  /** 현재 필터가 적용된 건수 — X(분자). */
  currentCount: number | null;
  loading: boolean;
  /** PC 첫 진입에서는 최종 카드 구조와 숫자 색상을 유지한다. */
  loadingDisplay?: "ellipsis" | "skeleton";
  /** "이번달" / "오늘" / "이번주" / "전체" / 선택한 날짜. */
  periodLabel: string;
  /** Known filter state keeps the count heading stable before data arrives. */
  hasListFilters?: boolean;
  mobile?: boolean;
}

const NUM = (loading: boolean, n: number | null | undefined) =>
  loading || n == null ? "…" : n.toLocaleString();

/**
 * 입출고 내역 상단 요약 — 3차: **표시 전용**(클릭 필터 폐기, 필터는 "필터" 패널 단일).
 * 카운트는 "{기간} X건 / 전체 Y건" 정직 표기 — X=현재 필터, Y=기간 전체.
 * 3박스(창고/부서/수량조정)는 건수만 보여주는 표시판.
 */
export function HistoryStatsBar({
  baseline,
  currentSummary,
  currentCount,
  loading,
  loadingDisplay = "ellipsis",
  periodLabel,
  hasListFilters,
  mobile = false,
}: HistoryStatsBarProps) {
  const filtered = currentSummary === null ? null : currentSummary ?? baseline;
  const countDisplay = mobile ? "skeleton" : loadingDisplay;
  const countsMatch = (hasListFilters === false && (loading || (mobile && currentCount == null)))
    || (currentCount != null && baseline?.total != null && currentCount === baseline.total);
  return (
    <section aria-busy={loading || undefined} className={mobile ? "min-h-[100px] rounded-[20px] border px-4 py-3" : "card desktop-flat-surface"} style={mobile ? { background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border } : { paddingTop: 16, paddingBottom: 16 }}>
      <div className={mobile && !loading ? dataRevealClassName : undefined}>
      {/* 정직 카운트 */}
      <div className={mobile ? "mb-3 flex h-[18px] min-w-0 flex-nowrap items-baseline gap-2 whitespace-nowrap" : "mb-3 flex flex-wrap items-baseline gap-2"}>
        {countsMatch ? (
          <span className={mobile ? "flex min-w-0 flex-1 items-baseline gap-1 text-lg font-semibold leading-none" : "text-3xl font-black leading-none"} style={{ color: mobile ? LEGACY_COLORS.text : LEGACY_COLORS.blue }}>
            {mobile ? <><span className="min-w-0 truncate">{periodLabel}</span><span className="shrink-0"><HistoryCountValue loading={loading} value={currentCount} display={countDisplay} size="small" /></span></>
              : <>{periodLabel} <HistoryCountValue loading={loading} value={currentCount} display={countDisplay} size="large" /></>}
          </span>
        ) : (
          <>
            <span className={`text-sm font-semibold${mobile ? " min-w-0 flex-1 truncate leading-none" : ""}`} style={{ color: LEGACY_COLORS.muted2 }}>
              {periodLabel}
            </span>
            <span className={`rounded-full px-2 text-xs font-bold${mobile ? " shrink-0 leading-[18px]" : " py-0.5"}`} style={{ background: tint(LEGACY_COLORS.blue, 12), color: LEGACY_COLORS.blue }}>
              목록 조건
            </span>
            <span className={mobile ? "shrink-0 text-lg font-semibold leading-none" : "text-3xl font-black leading-none"} style={{ color: mobile ? LEGACY_COLORS.text : LEGACY_COLORS.blue }}>
              <HistoryCountValue loading={loading} value={currentCount} display={countDisplay} size={mobile ? "small" : "large"} />
            </span>
            <span className={mobile ? "shrink-0 text-xs font-medium leading-none" : "text-base font-bold"} style={{ color: LEGACY_COLORS.muted2 }}>
              전체 <HistoryCountValue loading={loading} value={baseline?.total} display={countDisplay} size="small" />
            </span>
          </>
        )}
      </div>

      {/* 3박스 — 건수 표시 전용 */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox
          mobile={mobile}
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="창고"
          value={filtered?.warehouseCount}
          loading={loading}
          loadingDisplay={countDisplay}
          sub="창고 재고가 움직인 작업"
          color={LEGACY_COLORS.green}
        />
        <StatBox
          mobile={mobile}
          icon={<Layers className="h-3.5 w-3.5" />}
          label="부서"
          value={filtered?.deptCount}
          loading={loading}
          loadingDisplay={countDisplay}
          sub="부서 재고가 움직인 작업"
          color={LEGACY_COLORS.cyan}
        />
        <StatBox
          mobile={mobile}
          icon={<Sliders className="h-3.5 w-3.5" />}
          label="수량조정"
          value={filtered?.adjustCount}
          loading={loading}
          loadingDisplay={countDisplay}
          sub="재고 수량을 직접 조정한 거래"
          color={LEGACY_COLORS.yellow}
        />
      </div>
      </div>
    </section>
  );
}

function HistoryCountValue({
  loading,
  value,
  display,
  size,
}: {
  loading: boolean;
  value: number | null | undefined;
  display: "ellipsis" | "skeleton";
  size: "large" | "small" | "card";
}) {
  if (display === "skeleton" && loading) {
    return (
      <span className="relative inline-block">
        <span className="invisible" aria-hidden="true">000건</span>
        <span
        role="status"
        aria-busy="true"
        aria-label="집계 중"
        className={`absolute left-0 top-1/2 -translate-y-1/2 motion-safe:animate-pulse rounded-[6px] ${size === "large" ? "h-7 w-20" : size === "card" ? "h-6 w-16" : "h-5 w-14"}`}
      ><span aria-hidden="true" className="absolute inset-0 rounded-[6px]" style={{ background: "color-mix(in srgb, currentColor 18%, transparent)" }} /></span>
      </span>
    );
  }
  if (display === "skeleton" && !loading) {
    return <>{value == null ? "—" : NUM(false, value)}건</>;
  }
  return <>{NUM(loading, value)}건</>;
}

function StatBox({
  icon,
  label,
  value,
  loading,
  loadingDisplay,
  sub,
  color,
  mobile = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null | undefined;
  loading: boolean;
  loadingDisplay: "ellipsis" | "skeleton";
  sub: string;
  color: string;
  mobile?: boolean;
}) {
  return (
    <div
      className={mobile ? "flex min-w-0 flex-col gap-1 border-l px-2 first:border-l-0 first:pl-0 text-left" : "flex flex-col gap-1 rounded-[20px] border p-3 lg:p-4 text-left"}
      style={{ background: "transparent", borderColor: mobile ? LEGACY_COLORS.border : tint(color, 22) }}
    >
      <div
        className="flex items-center gap-1.5 whitespace-nowrap text-xs font-bold"
        style={{ color: `color-mix(in srgb, ${color} 45%, ${LEGACY_COLORS.text})` }}
      >
        {icon}
        {label}
      </div>
      <div
        className={mobile ? "text-base font-semibold tabular-nums" : "text-2xl font-black tabular-nums"}
        style={{ color: mobile ? LEGACY_COLORS.text : `color-mix(in srgb, ${color} 55%, ${LEGACY_COLORS.text})` }}
      >
        <HistoryCountValue loading={loading} value={value} display={loadingDisplay} size="card" />
      </div>
      <div className={mobile ? "sr-only" : "text-xs"} style={{ color: LEGACY_COLORS.muted2 }}>
        {sub}
      </div>
    </div>
  );
}
