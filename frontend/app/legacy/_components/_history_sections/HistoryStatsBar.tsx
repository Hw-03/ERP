"use client";

import { Building2, Layers, Sliders, X } from "lucide-react";
import type { TransactionSummary } from "@/lib/api/production";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

export type HistoryBucket = "all" | "warehouse" | "dept" | "adjust";

export interface HistoryStatsBarProps {
  /** 기간만 필터한 전체 — 박스 숫자/부서칩/Y(분모). 박스 선택과 무관하게 고정. */
  baseline: TransactionSummary | null;
  /** 현재 필터(유형/박스/검색/부서)가 적용된 건수 — X(분자). */
  currentCount: number | null;
  loading: boolean;
  /** "이번달" / "오늘" / "이번주" / "전체" / 선택한 날짜. */
  periodLabel: string;
  activeBucket: HistoryBucket;
  activeDept: string | null;
  onPick: (bucket: HistoryBucket) => void;
  onPickDept: (name: string) => void;
}

const NUM = (loading: boolean, n: number | null | undefined) =>
  loading || n == null ? "…" : n.toLocaleString();

/**
 * 입출고 내역 상단 요약 + 필터.
 * 3박스(창고/부서/수량조정) = 곧 필터. "부서"는 부서별 칩으로 전개.
 * 카운트는 "{기간} Y건 중 X건" 정직 표기 — Y=기간 전체, X=현재 필터.
 */
export function HistoryStatsBar({
  baseline,
  currentCount,
  loading,
  periodLabel,
  activeBucket,
  activeDept,
  onPick,
  onPickDept,
}: HistoryStatsBarProps) {
  const showDeptRow = activeBucket === "dept";
  const deptEntries = Object.entries(baseline?.departmentCounts ?? {})
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1]);

  const activeLabel =
    activeBucket === "warehouse"
      ? "창고만"
      : activeBucket === "adjust"
        ? "수량조정만"
        : activeDept
          ? `${activeDept}만`
          : activeBucket === "dept"
            ? "부서 전체"
            : null;

  return (
    <section className="card" style={{ paddingTop: 16, paddingBottom: 16 }}>
      {/* 정직 카운트 + 활성 필터 칩 */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
          {periodLabel}{" "}
          <b style={{ color: LEGACY_COLORS.text }}>{NUM(loading, baseline?.total)}건</b> 중{" "}
          <b style={{ color: LEGACY_COLORS.text }}>{NUM(loading, currentCount)}건</b> 보는 중
        </div>
        {activeLabel && (
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 12%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 35%, transparent)`,
              color: LEGACY_COLORS.blue,
            }}
          >
            지금 {activeLabel} 보는 중
            <button
              type="button"
              aria-label="필터 해제"
              onClick={() => onPick("all")}
              className="opacity-70 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>

      {/* 3박스 — 누르면 곧 필터 */}
      <div className="grid grid-cols-3 gap-3">
        <StatBox
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="창고"
          value={NUM(loading, baseline?.warehouseCount)}
          sub="창고 재고가 움직인 작업"
          color={LEGACY_COLORS.green}
          selected={activeBucket === "warehouse"}
          onClick={() => onPick("warehouse")}
        />
        <StatBox
          icon={<Layers className="h-3.5 w-3.5" />}
          label="부서"
          value={NUM(loading, baseline?.deptCount)}
          sub="부서 안에서만 움직인 작업 · 눌러서 부서별로"
          color={LEGACY_COLORS.cyan}
          selected={activeBucket === "dept"}
          caret={showDeptRow ? "▴" : "▾"}
          onClick={() => onPick("dept")}
        />
        <StatBox
          icon={<Sliders className="h-3.5 w-3.5" />}
          label="수량조정"
          value={NUM(loading, baseline?.adjustCount)}
          sub="재고 수량을 직접 조정한 거래"
          color={LEGACY_COLORS.yellow}
          selected={activeBucket === "adjust"}
          onClick={() => onPick("adjust")}
        />
      </div>

      {/* 부서 전개 — 누르면 그 부서만 */}
      {showDeptRow && (
        <div
          className="mt-3 rounded-[14px] border border-dashed p-3"
          style={{
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 35%, transparent)`,
            background: tint(LEGACY_COLORS.cyan, 4),
          }}
        >
          <div className="mb-2 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
            부서를 누르면 그 부서만 걸러집니다. 다시 풀려면 위 ✕.
          </div>
          {deptEntries.length === 0 ? (
            <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {loading ? "불러오는 중…" : "이 기간에 부서 작업 없음"}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {deptEntries.map(([name, count]) => {
                const sel = activeDept === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onPickDept(name)}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors"
                    style={{
                      background: sel ? LEGACY_COLORS.cyan : LEGACY_COLORS.s2,
                      borderColor: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 35%, transparent)`,
                      color: sel ? LEGACY_COLORS.white : LEGACY_COLORS.text,
                    }}
                  >
                    {name}
                    <b style={{ color: sel ? LEGACY_COLORS.white : LEGACY_COLORS.cyan }}>
                      {count.toLocaleString()}
                    </b>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StatBox({
  icon,
  label,
  value,
  sub,
  color,
  selected,
  caret,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
  selected: boolean;
  caret?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="flex flex-col gap-1 rounded-[20px] border p-4 text-left transition-[filter,transform] hover:brightness-[0.99] focus-visible:outline focus-visible:outline-2"
      style={{
        background: tint(color, 6),
        borderColor: tint(color, 22),
        outline: selected ? `2.5px solid ${LEGACY_COLORS.blue}` : "none",
        outlineOffset: 1,
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.12em]"
          style={{ color }}
        >
          {icon}
          {label}
        </div>
        {caret && (
          <span className="text-xs" style={{ color }}>
            {caret}
          </span>
        )}
      </div>
      <div className="text-2xl font-black" style={{ color }}>
        {value}건
      </div>
      <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
        {sub}
      </div>
    </button>
  );
}
