"use client";

import { AlertTriangle, Building2, FileSearch, Workflow } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

export interface HistoryStatsBarProps {
  stats: {
    /** 현재 표시된 행 수. */
    total: number;
    /** isWarehouseInvolvedType 카운트. */
    warehouseCount: number;
    /** isDepartmentInternalType 카운트. */
    deptCount: number;
    /** isExceptionLike 카운트 (EXCEPTION_LIKE_TYPES ∪ edit_count>0). */
    exceptionCount: number;
  };
  canLoadMore: boolean;
}

/**
 * History 화면 상단 4-카드 KPI 통계 바.
 * 모든 수치는 "현재 표시된 행" 기준 — 서버 검색/필터 결과 안에서 다시 분류한 카운트.
 *
 * 용어 구분:
 * - 서버 typeFilter "EXCEPTION" (HistoryFilterBar 칩) = EXCEPTION_LIKE_TYPES 거래만 서버에 요청.
 *   (서버가 edit_count>0 을 거를 수 없음.)
 * - 이 카드의 "예외/수정 N건" = 표시된 행 안에서 EXCEPTION_LIKE_TYPES OR edit_count>0 카운트.
 *   (즉 칩 결과보다 일반적으로 같거나 큼.)
 */
export function HistoryStatsBar({ stats, canLoadMore }: HistoryStatsBarProps) {
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
          <div className="text-2xl font-black">{stats.total}건</div>
          <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            {canLoadMore ? "(+더 불러올 수 있음)" : "조건에 맞는 최근 결과"}
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
            창고 포함
          </div>
          <div className="text-2xl font-black" style={{ color: LEGACY_COLORS.green }}>
            {stats.warehouseCount}건
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
            부서 내부
          </div>
          <div className="text-2xl font-black" style={{ color: LEGACY_COLORS.cyan }}>
            {stats.deptCount}건
          </div>
          <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>부서 안에서만 움직인 작업</div>
        </div>

        {/* 예외/수정 */}
        <div
          className="flex flex-col gap-1 rounded-[20px] border p-4"
          style={{ background: tint(LEGACY_COLORS.yellow, 6), borderColor: tint(LEGACY_COLORS.yellow, 22) }}
        >
          <div
            className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.15em]"
            style={{ color: LEGACY_COLORS.yellow }}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            예외/수정
          </div>
          <div className="text-2xl font-black" style={{ color: LEGACY_COLORS.yellow }}>
            {stats.exceptionCount}건
          </div>
          <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>예외 거래 + 수정된 거래</div>
        </div>
      </div>
    </section>
  );
}
