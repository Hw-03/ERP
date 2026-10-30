"use client";

import { useState } from "react";
import { ArrowUpRight, Calculator, ChevronDown, ChevronUp } from "lucide-react";
import type { ItemCost, CostIssue, CostStatus } from "@/lib/api/types/cost";
import { useCostActor, useCostQuery } from "@/lib/queries/useCostQuery";

export function costNumber(value: string | null): string {
  if (value === null) return "정보 없음";
  const [integer, fraction] = value.split(".");
  return `${BigInt(integer).toLocaleString("ko-KR")}${fraction === undefined || /^0+$/.test(fraction) ? "" : `.${fraction}`}`;
}

const ISSUE_BADGES: Record<string, string> = {
  missing_price: "자재 단가 미등록",
  missing_work_minutes: "인건비 미등록",
  missing_hourly_rate: "인건비 미등록",
  missing_bom: "BOM 미등록",
  incomplete_child_bom: "BOM 등록 미완료",
  missing_child: "하위 품목 확인 필요",
  cycle: "BOM 순환 참조",
  unit_mismatch: "단위 불일치",
  max_depth_exceeded: "BOM 깊이 초과",
  max_nodes_exceeded: "BOM 표시 한도 초과",
};

/** Summarize all missing cost inputs, including issues inherited from children. */
export function CostStatusBadge({ status, issues = [] }: { status: CostStatus; issues: CostIssue[] }) {
  if (status === "complete") return null;
  const labels = [...new Set(issues.map(issue => ISSUE_BADGES[issue.code] ?? "원가 기준 확인 필요"))];
  if (labels.length === 0) labels.push(status === "unavailable" ? "정보 없음" : "원가 기준 확인 필요");
  return <span className="inline-flex max-w-full flex-wrap justify-end gap-1">{labels.map(label => <span key={label} className="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "var(--c-warning-bg)", color: "var(--c-yellow)" }}>{label}</span>)}</span>;
}

export function CostSummaryContent({ cost, onOpen }: { cost: ItemCost; onOpen: () => void }) {
  const [compositionOpen, setCompositionOpen] = useState(false);
  return <section aria-label="관리 기준 원가" className="mb-4 overflow-hidden rounded-[20px] border" style={{ borderColor: "color-mix(in srgb, var(--c-blue) 22%, var(--c-border))", background: "var(--c-s1)" }}>
    <div className="px-4 py-3" style={{ background: "color-mix(in srgb, var(--c-blue) 6%, transparent)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold"><Calculator size={16} style={{ color: "var(--c-blue)" }} />관리 기준 원가</h3><CostStatusBadge status={cost.status} issues={cost.issues} /></div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <strong className="min-w-0 break-all text-2xl font-bold tracking-tight tabular-nums" style={{ color: "var(--c-blue)" }}>{costNumber(cost.unit_cost)}</strong>
        {cost.unit_cost !== null && <span className="shrink-0 text-xs" style={{ color: "var(--c-muted2)" }}>원 / 개</span>}
        {cost.status === "partial" && <span className="text-xs" style={{ color: "var(--c-muted2)" }}>부분 합계</span>}
      </div>
    </div>
    <div className="flex items-center border-t px-2" style={{ borderColor: "var(--c-border)" }}>
      <button type="button" aria-expanded={compositionOpen} onClick={() => setCompositionOpen((value) => !value)} className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-1 rounded-[12px] px-2 text-xs font-bold" style={{ color: "var(--c-muted2)" }}>비용 구성 {compositionOpen ? "접기" : "펼치기"}{compositionOpen ? <ChevronUp size={16} className="shrink-0" /> : <ChevronDown size={16} className="shrink-0" />}</button>
      <span aria-hidden className="mx-1 h-4 border-l" style={{ borderColor: "var(--c-border)" }} />
      <button type="button" aria-label="원가 분석 펼치기" onClick={onOpen} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-[12px] px-2 text-xs font-bold transition hover:brightness-110 active:scale-[0.98]" style={{ color: "var(--c-blue)" }}>원가 분석<ArrowUpRight size={16} /></button>
    </div>
    {compositionOpen && <div className="border-t px-4 py-3" style={{ borderColor: "var(--c-border)" }}>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="min-w-0"><dt style={{ color: "var(--c-muted2)" }}>재료비</dt><dd className="mt-1 break-all font-bold tabular-nums">{costNumber(cost.material_cost)}{cost.material_cost !== null && " 원"}</dd></div>
        <div className="min-w-0"><dt style={{ color: "var(--c-muted2)" }}>누적 인건비</dt><dd className="mt-1 break-all font-bold tabular-nums">{costNumber(cost.labor_cost)}{cost.labor_cost !== null && " 원"}</dd></div>
      </dl>
      {cost.status !== "complete" && <p className="mt-2 text-xs leading-5" style={{ color: "var(--c-muted2)" }}>미등록 비용은 합계에서 제외됩니다.</p>}
    </div>}
  </section>;
}

export function CostSummaryCard({ itemId, onOpen }: { itemId: string; onOpen: () => void }) {
  const actor = useCostActor();
  const query = useCostQuery(itemId, actor);
  if (!actor) return <p className="mb-4 rounded-[16px] border p-4 text-sm" style={{ borderColor: "var(--c-border)", color: "var(--c-muted2)" }}>원가를 보려면 작업자 인증이 필요합니다.</p>;
  if (query.isError) return <div role="alert" className="mb-4 rounded-[16px] border p-4 text-sm" style={{ borderColor: "var(--c-border)" }}><p>{query.error.message}</p><button className="mt-2 min-h-11 font-bold" onClick={() => void query.refetch()}>원가 다시 불러오기</button></div>;
  if (!query.data) return <p role="status" className="mb-4 p-4 text-sm" style={{ color: "var(--c-muted2)" }}>원가를 불러오는 중입니다.</p>;
  return <CostSummaryContent cost={query.data} onOpen={onOpen} />;
}
