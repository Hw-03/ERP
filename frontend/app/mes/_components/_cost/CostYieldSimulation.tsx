"use client";
import type { ReactElement, ReactNode } from "react";
import type { ItemCost } from "@/lib/api/types/cost";
import { costNumber, CostStatusBadge } from "./CostSummaryCard";

/** Saved stage yields are read-only here; editing belongs to the information tab. */
export function CostYieldSummary({ cost, busy, invalidHourly, compact = false, inline = false, expanded = false, onExpandedChange, children }: {
  cost: Pick<ItemCost, "unit_cost" | "status" | "issues" | "hourly_labor_rate" | "yield_adjusted_unit_cost" | "yield_cost_difference" | "yield_stages">;
  assumedHourly?: boolean; busy: boolean; invalidHourly: boolean; compact?: boolean; inline?: boolean; expanded?: boolean; onExpandedChange?: (expanded: boolean) => void; children?: ReactNode;
}): ReactElement {
  const stages = cost.yield_stages ?? [];
  const applied = stages.some(s => s.standard_yield_percent !== null && Number(s.standard_yield_percent) < 100);
  const status = invalidHourly ? "시급 입력을 확인해 주세요. 예상 결과를 보류합니다." : busy ? "이전 계산값 · 기준 원가를 다시 계산 중입니다." : cost.unit_cost === null ? "계산 불가 · 원가 기준 정보가 없습니다." : null;
  const collapsed = compact && !expanded;
  const showComparison = !busy && !invalidHourly;
  return <section aria-label="기준 수율 적용 비교" data-collapsed={collapsed} className={inline ? `max-w-full ${collapsed ? "shrink-0" : "basis-full py-1"}` : "shrink-0 border-b px-5 py-2"} style={{ background: "var(--c-s1)", borderColor: "var(--c-border)" }}>
    <div className="flex min-h-11 flex-wrap items-center gap-3">{applied && <span className="text-xs font-bold" style={{ color: "var(--c-blue)" }}>기준 수율 적용 중</span>}{status && <p role="status" className="text-sm">{status}</p>}{compact && <button type="button" aria-label={`원가 상세 ${expanded ? "접기" : "더보기"}`} aria-expanded={expanded} onClick={() => onExpandedChange?.(!expanded)} className="ml-auto min-h-11 rounded-lg px-2 text-xs font-bold hover:bg-[var(--c-s2)]" style={{ color: "var(--c-blue)" }}>{expanded ? "접기" : "더보기"}</button>}</div>
    {!collapsed && <>{children}<CostStatusBadge status={cost.status} issues={cost.issues} />
      {showComparison && <dl className="grid grid-cols-3 gap-2 py-2">{[["수율 적용 전", cost.unit_cost], ["수율 반영 예상 원가", cost.yield_adjusted_unit_cost ?? null], ["차액", cost.yield_cost_difference ?? null]].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border px-3 py-2" style={{ borderColor: "var(--c-border)", background: "var(--c-s2)" }}><dt className="text-xs" style={{ color: "var(--c-muted2)" }}>{label}</dt><dd className="mt-1 break-all text-base font-bold tabular-nums">{costNumber(value)}{value !== null && " 원"}</dd></div>)}</dl>}
      {showComparison && (stages.length ? <div className="overflow-x-auto"><table aria-label="단계별 기준 수율" className="w-full text-left text-sm"><thead><tr>{["적용 품목", "기준 수율", "보정 직전", "보정 직후"].map(label => <th key={label} className="border-b px-2 py-2 text-xs" style={{ borderColor: "var(--c-border)" }}>{label}</th>)}</tr></thead><tbody>{stages.map((s, i) => <tr key={`${s.path.join("/")}:${i}`}><td className="px-2 py-2">{s.item_name}<span className="block text-xs" style={{ color: "var(--c-muted2)" }}>{s.mes_code}</span></td><td className="whitespace-nowrap px-2 py-2">{s.standard_yield_percent === null ? "미등록 · 100% 가정" : `${costNumber(s.standard_yield_percent)}%`}</td><td className="whitespace-nowrap px-2 py-2 tabular-nums">{costNumber(s.input_unit_cost)}{s.input_unit_cost !== null && " 원"}</td><td className="whitespace-nowrap px-2 py-2 tabular-nums">{costNumber(s.output_unit_cost)}{s.output_unit_cost !== null && " 원"}</td></tr>)}</tbody></table></div> : <p className="py-2 text-sm">기준 수율 적용 대상 공정이 없습니다.</p>)}
      <p className="py-2 text-xs leading-5" style={{ color: "var(--c-muted2)" }}>원가 계산용 기준이며 실제 검사실적이 아닙니다. 발생부 보정 직전 비용에는 하위 튜브의 수율 보정이 포함됩니다. 단계 금액은 각 품목 1개 기준이며 서로 합산하지 않습니다. 실패품에도 해당 단계까지 비용이 투입되고 재작업·회수 가치는 없는 것으로 계산합니다. 기준 변경은 해당 품목의 정보 탭에서 합니다.</p>
      {cost.status === "partial" && <p className="text-xs" style={{ color: "var(--c-yellow)" }}>등록된 비용의 부분 합계이며 미등록 비용은 포함되지 않습니다.</p>}
    </>}
  </section>;
}
