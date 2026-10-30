"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { ChevronUp } from "lucide-react";
import type { CostNode, CostIssue } from "@/lib/api/types/cost";
import { useCostActor, useCostQuery } from "@/lib/queries/useCostQuery";
import { costNumber, CostStatusBadge } from "./CostSummaryCard";
import { CostTree } from "./CostCompactTree";
import { CostTable } from "./CostTable";

const ISSUE_LABELS: Record<string, string> = {
  missing_price: "기준 매입단가가 없습니다.",
  missing_work_minutes: "1인 1개 추가 작업시간이 없습니다.",
  missing_hourly_rate: "회사 공통 시급이 없습니다.",
  missing_bom: "하위 품목 구성이 없습니다.",
  incomplete_child_bom: "BOM 완료 표시가 필요합니다.",
  missing_child: "삭제되었거나 찾을 수 없는 품목입니다.",
  cycle: "하위 품목 구성에 같은 품목이 반복 연결되어 있습니다.",
  unit_mismatch: "BOM 수량 단위가 품목 단위와 다릅니다.",
  max_depth_exceeded: "품목 구성 단계가 많아 일부 계산을 마치지 못했습니다.",
  max_nodes_exceeded: "품목 구성이 많아 일부 계산을 마치지 못했습니다.",
};

export function CostIssues({ root, issues, compact = false }: { root: CostNode; issues: CostIssue[]; compact?: boolean }) {
  const names = new Map<string, string>();
  function collect(node: CostNode): void {
    names.set(node.item_id, node.item_name);
    node.children.forEach(collect);
  }
  collect(root);
  if (issues.length === 0) return null;
  return <details className={compact ? "shrink-0 border-t px-4" : "mt-4 rounded-[16px] border p-4"} style={{ borderColor: "var(--c-border)" }} open={!compact}>
    <summary className="min-h-11 cursor-pointer text-sm font-bold">누락·확인 사항 {issues.length}건</summary>
    <ul className="sg mt-2 max-h-[200px] space-y-3 overflow-y-auto pr-2">{issues.map((issue, index) => <li key={`${issue.path.join("/")}:${issue.code}:${index}`} className="rounded-[12px] p-3" style={{ background: "var(--c-s2)" }}><p className="text-sm font-bold">{ISSUE_LABELS[issue.code] ?? "원가 기준값과 품목 구성을 확인해 주세요."}</p><p className="mt-1 break-words text-xs leading-5" style={{ color: "var(--c-muted2)" }}>{issue.path.map((id) => names.get(id) ?? "찾을 수 없는 품목").join(" → ")}</p></li>)}</ul>
  </details>;
}

export { CostTree } from "./CostCompactTree";

export type CostView = "info" | "tree" | "table";

/** Keep analysis views mounted, but discard the information form after guarded exit. */
export function CostViews({ root, canEdit, information, simulationControls, activeView, onViewChange, beforeViewChange, navigationDisabled = false }: {
  root: CostNode; canEdit: boolean; information?: ReactNode; simulationControls?: ReactNode;
  activeView?: CostView; onViewChange?: (view: CostView) => void; beforeViewChange?: (action: () => void) => void; navigationDisabled?: boolean;
}): ReactElement {
  const [localView, setLocalView] = useState<CostView>("tree");
  const showInformation = Boolean(canEdit && information);
  const requested = activeView ?? localView;
  const active = requested === "info" && !showInformation ? "tree" : requested;
  const options: { value: CostView; label: string }[] = [...(showInformation ? [{ value: "info" as const, label: "정보" }] : []), { value: "tree", label: "가계도" }, { value: "table", label: "표" }];
  const id = useId();
  const focusTab = useRef(false);
  useEffect(() => { if (!showInformation && localView === "info") setLocalView("tree"); }, [showInformation, localView]);
  useLayoutEffect(() => {
    if (!focusTab.current) return;
    document.getElementById(`${id}-${active}-tab`)?.focus();
    focusTab.current = false;
  }, [active, id]);
  function change(next: CostView, keyboard = false): void {
    if (navigationDisabled || next === active) return;
    const action = (): void => {
      focusTab.current = keyboard;
      if (onViewChange) onViewChange(next);
      else setLocalView(next);
    };
    if (beforeViewChange) beforeViewChange(action);
    else action();
  }
  function switchWithKeyboard(event: KeyboardEvent<HTMLButtonElement>): void {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = options.findIndex(option => option.value === active);
    const next = options[event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowRight" ? 1 : options.length - 1)) % options.length].value;
    change(next, true);
    if (next === active) document.getElementById(`${id}-${next}-tab`)?.focus();
  }
  const tabs = <div role="tablist" aria-label="BOM 원가 보기" className="flex gap-1 rounded-[12px] p-1" style={{ background: "var(--c-s2)" }}>
        {options.map(({ value, label }) => <button key={value} id={`${id}-${value}-tab`} type="button" role="tab" disabled={navigationDisabled} aria-selected={active === value} aria-controls={`${id}-${value}-panel`} tabIndex={active === value ? 0 : -1} onClick={() => change(value)} onKeyDown={switchWithKeyboard} className="min-h-9 rounded-[10px] px-4 text-sm font-bold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)]" style={{ background: active === value ? "var(--c-s1)" : undefined, color: active === value ? "var(--c-blue)" : "var(--c-muted2)" }}>{label}</button>)}
      </div>;
  const analysisToolbar = <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">{tabs}{simulationControls}</div>;
  return <>
    {showInformation && active === "info" && <div id={`${id}-info-panel`} role="tabpanel" aria-label="정보" className="h-full min-h-0"><div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border" style={{ borderColor: "var(--c-border)", background: "var(--c-s1)" }}><div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-2 py-1" style={{ borderColor: "var(--c-border)" }}>{tabs}</div><div className="flex min-h-0 flex-1">{information}</div></div></div>}
    <div id={`${id}-tree-panel`} role="tabpanel" aria-label="가계도" hidden={active !== "tree"}><CostTree root={root} active={active === "tree"} toolbar={active === "tree" ? exploration => <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">{tabs}{exploration}{simulationControls}</div> : undefined} /></div>
    <div id={`${id}-table-panel`} role="tabpanel" aria-label="표" hidden={active !== "table"}><CostTable root={root} toolbar={active === "table" ? analysisToolbar : undefined} /></div>
  </>;
}

export function CostAnalysisPanel({ itemId, onCollapse, onReady }: { itemId: string; onCollapse: () => void; onReady?: () => void }) {
  const actor = useCostActor();
  const query = useCostQuery(itemId, actor);
  const cost = query.data;
  const ready = Boolean(cost);
  useEffect(() => { if (ready) onReady?.(); }, [ready, onReady]);
  return <section aria-label="원가 분석" className="card desktop-flat-surface p-4">
    {process.env.NEXT_PUBLIC_COST_PREVIEW === "1" && <p className="mb-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "var(--c-warning-bg)", color: "var(--c-yellow)" }}>BOM 참고 단가 · 검수용</p>}
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold leading-4" style={{ color: "var(--c-blue)" }}>관리 기준 원가</p><h2 className="mt-0.5 text-base font-bold leading-5">{cost?.tree.item_name ?? "선택 품목"} 원가 분석</h2><p className="mt-1 text-xs leading-4" style={{ color: "var(--c-muted2)" }}>선택 품목 1개를 만드는 데 필요한 구성과 비용을 확인합니다.</p></div><button type="button" onClick={onCollapse} className="flex min-h-9 shrink-0 items-center gap-1 rounded-[12px] border px-3 text-sm font-bold" style={{ borderColor: "var(--c-border)" }}><ChevronUp size={16} />분석 접기</button></div>
    {!actor ? <p className="mt-4 text-sm">작업자 인증이 필요합니다.</p> : query.isError ? <div role="alert" className="mt-4 text-sm"><p>{query.error.message}</p><button className="min-h-11 font-bold" onClick={() => void query.refetch()}>다시 불러오기</button></div> : !cost ? <p role="status" className="mt-4 text-sm">원가를 불러오는 중입니다.</p> : <>
      <div className="my-2 grid gap-2 rounded-[16px] border p-2.5 sm:grid-cols-3" style={{ borderColor: "var(--c-border)", background: "var(--c-s2)" }}>{[{ label: cost.status === "partial" ? "개당 원가 · 부분 합계" : "개당 원가", value: cost.unit_cost }, { label: "재료비", value: cost.material_cost }, { label: "누적 인건비", value: cost.labor_cost }].map(({ label, value }, index) => <div key={label} className="min-w-0"><p className="text-xs leading-4" style={{ color: "var(--c-muted2)" }}>{label}</p><p className={`${index === 0 ? "text-xl" : "text-base"} mt-0.5 break-all font-bold leading-6 tabular-nums`} style={{ color: index === 0 ? "var(--c-blue)" : "var(--c-text)" }}>{costNumber(value)}{value !== null && <span className="ml-1 text-xs">원</span>}</p></div>)}</div>
      {cost.status !== "complete" && <div className="mb-2 flex items-start gap-2 rounded-[12px] px-3 py-2" style={{ background: "var(--c-warning-bg)" }}><CostStatusBadge status={cost.status} issues={cost.issues} /><p className="text-xs leading-4" style={{ color: "var(--c-muted2)" }}>매입단가·작업시간·회사 공통 시급 중 빠진 기준값을 확인해 주세요. 정보가 없는 금액은 합계에 포함하지 않습니다.</p></div>}
      <CostViews key={`${actor.token}:${itemId}`} root={cost.tree} canEdit={cost.can_edit} />
      <CostIssues root={cost.tree} issues={cost.issues} />
    </>}
  </section>;
}
