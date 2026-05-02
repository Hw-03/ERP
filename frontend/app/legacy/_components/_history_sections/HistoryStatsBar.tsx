"use client";

import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { LEGACY_COLORS } from "../legacyUi";
import { formatQty } from "@/lib/mes/format";
export interface HistoryStatsBarProps {
  stats: {
    total: number;
    receiveSum: number;
    shipSum: number;
    exceptionCount: number;
  };
  canLoadMore: boolean;
}

/**
 * History 화면 상단 4-카드 KPI 통계 바.
 * Round-9 (R9-1) 분리. DesktopHistoryView 의 64줄 inline 블록을 별도 파일로.
 * 동작/스타일 변화 0.
 */
export function HistoryStatsBar({ stats, canLoadMore }: HistoryStatsBarProps) {
  return (
    <section className="card">
      <div className="grid grid-cols-4 gap-3">
        <div
          className="flex flex-col gap-1 rounded-[20px] border p-4"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
            조회 건수
          </div>
          <div className="text-2xl font-black">{formatQty(stats.total)}</div>
          {canLoadMore && (
            <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>(+더 불러올 수 있음)</div>
          )}
        </div>
        <div
          className="flex flex-col gap-1 rounded-[20px] border p-4"
          style={{ background: "rgba(67,211,157,.06)", borderColor: "rgba(67,211,157,.22)" }}
        >
          <div
            className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.15em]"
            style={{ color: LEGACY_COLORS.green }}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            입고 합계
          </div>
          <div className="text-2xl font-black" style={{ color: LEGACY_COLORS.green }}>
            +{formatQty(stats.receiveSum)}
          </div>
          <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>입고 · 생산입고</div>
        </div>
        <div
          className="flex flex-col gap-1 rounded-[20px] border p-4"
          style={{ background: "rgba(255,123,123,.06)", borderColor: "rgba(255,123,123,.22)" }}
        >
          <div
            className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.15em]"
            style={{ color: LEGACY_COLORS.red }}
          >
            <TrendingDown className="h-3.5 w-3.5" />
            출고 합계
          </div>
          <div className="text-2xl font-black" style={{ color: LEGACY_COLORS.red }}>
            -{formatQty(stats.shipSum)}
          </div>
          <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>출고 · 자동차감</div>
        </div>
        <div
          className="flex flex-col gap-1 rounded-[20px] border p-4"
          style={{ background: "rgba(246,198,103,.06)", borderColor: "rgba(246,198,103,.22)" }}
        >
          <div
            className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.15em]"
            style={{ color: LEGACY_COLORS.yellow }}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            예외 거래
          </div>
          <div className="text-2xl font-black" style={{ color: LEGACY_COLORS.yellow }}>
            {formatQty(stats.exceptionCount)}
          </div>
          <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>조정·폐기·손실·예외</div>
        </div>
      </div>
    </section>
  );
}
