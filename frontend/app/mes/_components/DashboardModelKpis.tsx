"use client";

import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ProductionCapacity, ProductionCapacityPfVariant } from "@/lib/api/types/production";
import type { CostActor } from "@/lib/api/types/cost";
import { costsApi } from "@/lib/api/costs";
import { useCostSummaryQueries } from "@/lib/queries/useCostQuery";
import { getModelLabel } from "@/lib/mes/model-labels";
import { formatQty } from "@/lib/mes/format";
import { costNumber } from "./_cost/CostSummaryCard";
import { tableAmount } from "./_cost/CostTable";
import styles from "./DashboardModelKpis.module.css";

/** Round nonnegative API money for KPI display without changing precise detail values. */
function kpiWon(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const rounded = BigInt(whole) + ((fraction[0] ?? "0") >= "5" ? BigInt(1) : BigInt(0));
  return costNumber(rounded.toString());
}

export type CapacityKpiSource = {
  capacityData?: ProductionCapacity | null; capacityLoading?: boolean;
  capacityError?: string | null; onCapacityRetry?: () => void;
};
export type CostKpiTarget = { modelKey: string; label: string; pfItemId: string; code: string; name: string };

/** Keep cost targets independent of capacity quantities so their source can change later. */
export function toCostKpiTargets(variants: ProductionCapacityPfVariant[]): CostKpiTarget[] {
  return [...variants].sort((a, b) => (a.model_symbol ?? "").localeCompare(b.model_symbol ?? "", undefined, { numeric: true })).map(v => ({
    modelKey: v.model_symbol ?? "미분류", label: getModelLabel(v.model_symbol ?? "", v.pf_name) || "미분류",
    pfItemId: v.pf_item_id, code: v.pf_code ?? "—", name: v.pf_name,
  }));
}

function KpiPanel({ title, loading, error, onRetry, children, empty, note }: {
  title: string; loading?: boolean; error?: string | null; onRetry?: () => void;
  children: ReactNode; empty: boolean; note?: string;
}): ReactNode {
  return <section aria-label={title} aria-busy={loading || undefined} className="shrink-0 rounded-[24px] border px-4 py-[14px]" style={{ background: "var(--c-s1)", borderColor: "var(--c-border)" }}>
    {note && <p className="sr-only">{note}</p>}
    {error && <div role="alert" className="mb-2 flex items-center gap-3 text-sm" style={{ color: "var(--c-red)" }}>최신 수량을 갱신하지 못했습니다.<button type="button" className="min-h-11 font-bold" onClick={onRetry}>다시 시도</button></div>}
    {empty ? <p role={loading ? "status" : undefined} className={`rounded-xl p-4 text-sm ${loading ? "animate-pulse" : ""}`} style={{ background: "var(--c-s2)" }}>{loading ? "기준 PF를 불러오는 중입니다." : error ? "기준 PF를 확인하지 못했습니다." : "표시할 기준 PF가 없습니다."}</p>
      : <div className={styles.grid}>{children}</div>}
  </section>;
}

/** Fade the whole row from left to right without assigning official model colors. */
function ModelCard({ target, index, count, children, onClick, tone = "var(--c-blue)" }: { target: CostKpiTarget; index: number; count: number; children: ReactNode; onClick: (event: MouseEvent<HTMLButtonElement>) => void; tone?: string }): ReactNode {
  const tint = 22 - 16 * index / Math.max(1, count - 1);
  return <button type="button" className={styles.card} style={{ "--model-tint": `${tint}%`, "--model-accent": tone } as CSSProperties} aria-label={`${target.label} ${target.code} ${target.name}`} onClick={onClick}>
    <span className={styles.model}>{target.label}</span>
    {children}
  </button>;
}

export function CapacityModelKpis({ capacityData, capacityLoading, capacityError, onCapacityRetry, onOpen }: CapacityKpiSource & {
  onOpen: (variant: ProductionCapacityPfVariant, button: HTMLButtonElement) => void;
}): ReactNode {
  const variants = capacityData?.af?.auto_representatives ?? [];
  const targets = toCostKpiTargets(variants);
  return <KpiPanel title="모델별 생산 가능 KPI" loading={capacityLoading} error={capacityError} onRetry={onCapacityRetry} empty={!targets.length}>
    {targets.map((target, index) => {
      const variant = variants.find(v => v.pf_item_id === target.pfItemId && (v.model_symbol ?? "미분류") === target.modelKey)!;
      return <ModelCard key={target.modelKey} target={target} index={index} count={targets.length} tone="var(--c-yellow)" onClick={event => onOpen(variant, event.currentTarget)}>
        <dl className={styles.capacity}>
          <div><dt>출하 대기</dt><dd style={{ color: "var(--c-cyan)" }}>{formatQty(variant.ship_ready)}</dd></div>
          <div><dt>빠른 생산</dt><dd>{formatQty(variant.fast_production)}</dd></div>
          <div><dt>총생산</dt><dd style={{ color: "var(--c-purple)" }}>{formatQty(variant.total_production)}</dd></div>
        </dl>
      </ModelCard>;
    })}
  </KpiPanel>;
}

export function CostModelKpis({ targets, actor, hourlyRate, capacityLoading, capacityError, onCapacityRetry, onOpen }: CapacityKpiSource & {
  targets: CostKpiTarget[]; actor: CostActor | null; hourlyRate?: string; onOpen: (id: string) => void;
}): ReactNode {
  const ids = [...new Set(targets.map(t => t.pfItemId))];
  const pages: string[][] = []; for (let i = 0; i < ids.length; i += 100) pages.push(ids.slice(i, i + 100));
  const queries = useCostSummaryQueries(pages, actor, hourlyRate);
  const standards = useQuery({ queryKey: ["costs", "kpi-standards", actor?.employee_id, actor?.token], queryFn: ({ signal }) => costsApi.getStandards(actor!.token, signal), enabled: Boolean(actor && hourlyRate === undefined), retry: false });
  const rate = hourlyRate ?? standards.data?.hourly_labor_rate;
  const error = queries.some(q => q.isError) || standards.isError;
  const summaries = new Map(queries.flatMap(q => q.data ?? []).map(s => [s.item_id, s]));
  return <KpiPanel title="모델별 원가 KPI" loading={capacityLoading} error={capacityError} onRetry={onCapacityRetry} empty={!targets.length} note={`대표 출하품 1개 기준 · 수율 100% · 가정 시급 ${rate == null ? standards.isError ? "조회 실패" : standards.isSuccess ? "미등록" : "확인 중" : `${costNumber(rate)}원`}`}>
    {error && <div role="alert" className="col-span-full flex items-center gap-3 text-sm" style={{ color: "var(--c-red)" }}>원가 기준 또는 금액 갱신 실패<button type="button" className="min-h-11 font-bold" onClick={() => { queries.filter(q => q.isError).forEach(q => void q.refetch()); if (standards.isError) void standards.refetch(); }}>원가 다시 시도</button></div>}
    {targets.map((target, index) => { const summary = summaries.get(target.pfItemId); const query = queries[Math.floor(ids.indexOf(target.pfItemId) / 100)]; return <ModelCard key={target.modelKey} target={target} index={index} count={targets.length} tone="var(--c-purple)" onClick={() => onOpen(target.pfItemId)}>
      <dl className={styles.cost}><dt className={summary?.status === "partial" ? undefined : "sr-only"}>{summary?.status === "partial" ? "부분 원가" : "원가"}</dt><dd role={!summary && !query?.isError && query?.data === undefined ? "status" : undefined}>
        {!summary ? query?.isError ? "조회 실패" : query?.data !== undefined ? "정보 없음" : "불러오는 중…" : summary.unit_cost !== null && costNumber(summary.unit_cost) !== "0" ? <>{kpiWon(summary.unit_cost)}<span className={styles.unit}> 원</span></> : tableAmount(summary.unit_cost)}
      </dd></dl>
    </ModelCard>; })}
  </KpiPanel>;
}
