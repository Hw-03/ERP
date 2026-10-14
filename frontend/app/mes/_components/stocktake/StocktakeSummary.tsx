import type { ReactNode } from "react";
import type { StocktakeItemSummary } from "@/lib/api/types/stocktake";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { KpiCard } from "../common/KpiCard";
import { SkeletonBlock } from "../common/LoadingSkeleton";
import type { StocktakeVariant } from "./StocktakeLayout";
import styles from "./StocktakeSummary.module.css";
import type { StocktakeKpi } from "./stocktakeTargetFilter";

const CARDS = [
  { key: "total", label: "전체 대상", hint: "이번 회차의 품목", tone: LEGACY_COLORS.blue },
  { key: "unconfirmed", label: "미확인", hint: "계수 확인 전", tone: LEGACY_COLORS.muted2 },
  { key: "confirmed", label: "대기", hint: "확인 후 반영 대기", tone: LEGACY_COLORS.yellow },
  { key: "applied", label: "완료", hint: "모든 위치 반영", tone: LEGACY_COLORS.green },
] as const;

/** Whole-round metrics select matching server status groups, never loaded-page totals. */
export function StocktakeSummary({ summary, loading, variant, children, activeKpi = "total", onKpiChange }: {
  summary?: StocktakeItemSummary; loading: boolean; variant: StocktakeVariant; children?: ReactNode; activeKpi?: StocktakeKpi | null; onKpiChange?: (key: StocktakeKpi) => void;
}): ReactNode {
  const values = summary ? { ...summary, confirmed: summary.confirmed - summary.applied } : undefined;
  return <section aria-label="조사 요약" className={variant === "desktop" ? `${styles.desktop} card desktop-flat-surface rounded-[24px] px-4 py-3.5` : "flex flex-col gap-2"}>
    {variant === "mobile" ? <div className="grid grid-cols-4 overflow-hidden rounded-[20px] border border-[var(--c-border)] bg-[var(--c-s1)]">
      {CARDS.map(card => <button key={card.key} type="button" disabled={loading} aria-pressed={activeKpi === card.key} onClick={() => onKpiChange?.(card.key)} className="no-btn-inset flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 border-b-2 px-1 py-2 transition-colors"
        style={{ borderColor: activeKpi === card.key ? card.tone : "transparent", background: `color-mix(in srgb, ${card.tone} ${activeKpi === card.key ? 16 : 6}%, transparent)`, color: card.tone }}>
        <span className="text-xs font-medium">{card.label}</span>
        <span className="flex h-7 items-center text-lg font-semibold tabular-nums" role={loading ? "status" : undefined} aria-label={loading ? "집계 중" : undefined}>{loading ? <SkeletonBlock className="h-6 w-9" /> : values ? values[card.key].toLocaleString() : "—"}</span>
      </button>)}
    </div> : <div className={`${styles.cards} grid grid-cols-2 gap-2 lg:grid-cols-4`}>
      {CARDS.map(card => <KpiCard key={card.key} label={card.label} hint={card.hint} value={values ? values[card.key].toLocaleString() : "—"} tone={card.tone} loading={loading} active={activeKpi === card.key} onClick={() => onKpiChange?.(card.key)} />)}
    </div>}
    <p className="sr-only">모든 조사 위치를 확인하고 아직 모두 반영하지 않은 품목은 대기, 모두 반영한 품목은 완료입니다. 미편입 대기는 전체 대상에서 제외합니다.</p>
    {children && <div className={variant === "desktop" ? "mt-3" : undefined}>{children}</div>}
  </section>;
}
