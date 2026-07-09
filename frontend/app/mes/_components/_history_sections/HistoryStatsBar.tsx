"use client";

import { Building2, Layers, Sliders } from "lucide-react";
import type { TransactionSummary } from "@/lib/api/production";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

export interface HistoryStatsBarProps {
  /** 기간만 필터한 전체 — 박스 숫자/Y(분모). 필터와 무관하게 고정. */
  baseline: TransactionSummary | null;
  /** 현재 필터(거래종류/검색/부서/모델)가 적용된 건수 — X(분자). */
  currentCount: number | null;
  loading: boolean;
  /** "이번달" / "오늘" / "이번주" / "전체" / 선택한 날짜. */
  periodLabel: string;
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
  currentCount,
  loading,
  periodLabel,
}: HistoryStatsBarProps) {
  return (
    <section className="card" style={{ paddingTop: 16, paddingBottom: 16 }}>
      {/* 정직 카운트 */}
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
          {periodLabel}
        </span>
        <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: tint(LEGACY_COLORS.blue, 12), color: LEGACY_COLORS.blue }}>
          목록 조건
        </span>
        <span className="text-3xl font-black leading-none" style={{ color: LEGACY_COLORS.blue }}>
          {NUM(loading, currentCount)}건
        </span>
        <span className="text-base font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          기간 전체 {NUM(loading, baseline?.total)}건
        </span>
      </div>

      {/* 3박스 — 건수 표시 전용 */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="창고"
          value={NUM(loading, baseline?.warehouseCount)}
          sub="창고 재고가 움직인 작업"
          color={LEGACY_COLORS.green}
        />
        <StatBox
          icon={<Layers className="h-3.5 w-3.5" />}
          label="부서"
          value={NUM(loading, baseline?.deptCount)}
          sub="부서 안에서만 움직인 작업"
          color={LEGACY_COLORS.cyan}
        />
        <StatBox
          icon={<Sliders className="h-3.5 w-3.5" />}
          label="수량조정"
          value={NUM(loading, baseline?.adjustCount)}
          sub="재고 수량을 직접 조정한 거래"
          color={LEGACY_COLORS.yellow}
        />
      </div>
    </section>
  );
}

function StatBox({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-[20px] border p-3 lg:p-4 text-left"
      style={{ background: "transparent", borderColor: tint(color, 22) }}
    >
      <div
        className="flex items-center gap-1.5 whitespace-nowrap text-xs font-bold"
        style={{ color: `color-mix(in srgb, ${color} 45%, ${LEGACY_COLORS.text})` }}
      >
        {icon}
        {label}
      </div>
      <div
        className="text-2xl font-black tabular-nums"
        style={{ color: `color-mix(in srgb, ${color} 55%, ${LEGACY_COLORS.text})` }}
      >
        {value}건
      </div>
      <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
        {sub}
      </div>
      <div className="text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted }}>
        표시 전용
      </div>
    </div>
  );
}
