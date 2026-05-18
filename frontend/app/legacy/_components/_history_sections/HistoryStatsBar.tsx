"use client";

import { Building2, FileSearch, Sliders, Workflow } from "lucide-react";
import type { TransactionSummary } from "@/lib/api/production";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

export interface HistoryStatsBarProps {
  /** 백엔드 /transactions/summary 응답. null = 로딩 전 또는 실패. */
  summary: TransactionSummary | null;
  summaryLoading: boolean;
  /** 현재 화면에 로드된 행 수 (페이지네이션 진행률 표시용). */
  loadedCount: number;
  canLoadMore: boolean;
}

/**
 * History 화면 상단 4-카드 KPI 통계 바.
 * 큰 숫자는 조건 전체 카운트(summary). loadedCount 는 "표시 중" 카드 보조문구로만 사용.
 * summary 로딩 중에는 숫자 자리에 `…`.
 */
function fmtCount(loading: boolean, n: number | undefined): string {
  if (loading || n === undefined) return "…";
  return `${n}건`;
}

export function HistoryStatsBar({ summary, summaryLoading, loadedCount, canLoadMore }: HistoryStatsBarProps) {
  return (
    <section className="card">
      <div className="grid grid-cols-4 gap-3">
        {/* 표시 중 */}
        <div
          className="flex flex-col gap-1 rounded-[20px] border p-4"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div
            className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.15em]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            <FileSearch className="h-3.5 w-3.5" />
            표시 중
          </div>
          <div className="text-2xl font-black">{fmtCount(summaryLoading, summary?.total)}</div>
          <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            현재 {loadedCount}건 로딩됨{canLoadMore ? " · 더 있음" : ""}
          </div>
        </div>

        {/* 창고 포함 */}
        <div
          className="flex flex-col gap-1 rounded-[20px] border p-4"
          style={{ background: tint(LEGACY_COLORS.green, 6), borderColor: tint(LEGACY_COLORS.green, 22) }}
        >
          <div
            className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.15em]"
            style={{ color: LEGACY_COLORS.green }}
          >
            <Building2 className="h-3.5 w-3.5" />
            창고
          </div>
          <div className="text-2xl font-black" style={{ color: LEGACY_COLORS.green }}>
            {fmtCount(summaryLoading, summary?.warehouseCount)}
          </div>
          <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>창고 재고가 움직인 작업</div>
        </div>

        {/* 부서 내부 */}
        <div
          className="flex flex-col gap-1 rounded-[20px] border p-4"
          style={{ background: tint(LEGACY_COLORS.cyan, 6), borderColor: tint(LEGACY_COLORS.cyan, 22) }}
        >
          <div
            className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.15em]"
            style={{ color: LEGACY_COLORS.cyan }}
          >
            <Workflow className="h-3.5 w-3.5" />
            부서
          </div>
          <div className="text-2xl font-black" style={{ color: LEGACY_COLORS.cyan }}>
            {fmtCount(summaryLoading, summary?.deptCount)}
          </div>
          <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>부서 안에서만 움직인 작업</div>
        </div>

        {/* 수량 조정 */}
        <div
          className="flex flex-col gap-1 rounded-[20px] border p-4"
          style={{ background: tint(LEGACY_COLORS.yellow, 6), borderColor: tint(LEGACY_COLORS.yellow, 22) }}
        >
          <div
            className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.15em]"
            style={{ color: LEGACY_COLORS.yellow }}
          >
            <Sliders className="h-3.5 w-3.5" />
            수량 조정
          </div>
          <div className="text-2xl font-black" style={{ color: LEGACY_COLORS.yellow }}>
            {fmtCount(summaryLoading, summary?.adjustCount)}
          </div>
          <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>재고 수량을 직접 조정한 거래</div>
        </div>
      </div>
    </section>
  );
}
