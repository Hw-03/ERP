"use client";

import { Fragment, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { CostNode } from "@/lib/api/types/cost";
import { costNumber, CostStatusBadge } from "./CostSummaryCard";
import { useDashboardScrollSnapshot, useDashboardSnapshot } from "../DashboardNavigation";

const DEPTH_INDENT_PX = 24;
const CONTROL_CLASS = "min-h-11 rounded-[10px] px-3 text-xs font-bold transition hover:bg-[var(--c-s3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)]";

/** Keep missing amounts distinct while reducing registered zero amounts to a dash. */
export function tableAmount(value: string | null): string {
  const formatted = costNumber(value);
  return value === null ? formatted : formatted === "0" ? "—" : `${formatted} 원`;
}

/** Include the occurrence index so repeated items retain independent branch state. */
function collectBranches(root: CostNode): string[] {
  const paths: string[] = [];
  function visit(node: CostNode, path: string): void {
    if (node.children.length > 0) paths.push(path);
    node.children.forEach((child, index) => visit(child, `${path}/${index}:${child.item_id}`));
  }
  visit(root, "root");
  return paths;
}

/** Display API amounts per BOM occurrence; parent totals already include their children. */
export function CostTable({ root, toolbar }: { root: CostNode; toolbar?: ReactNode }): ReactElement {
  const surface = useRef<HTMLDivElement>(null);
  useDashboardScrollSnapshot(`cost:table-scroll:${root.item_id}`, surface);
  const branches = useMemo(() => collectBranches(root), [root]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(branches));
  useDashboardSnapshot(`cost:table:${root.item_id}`, () => expanded, setExpanded);

  function renderNode(node: CostNode, path: string, depth: number): ReactElement {
    const open = expanded.has(path);
    const hasChildren = node.children.length > 0;
    const repeatedTotal = node.own_labor_cost !== null && costNumber(node.own_labor_cost) === "0" && node.unit_cost !== null && node.amount !== null && costNumber(node.unit_cost) === costNumber(node.amount);
    return <Fragment key={path}>
      <tr className={`h-[52px] text-sm [&>td]:border-b [&>td]:border-[var(--c-border)] ${depth > 0 ? `bom-tree-depth bom-tree-depth-${Math.min(depth, 8)}` : "bg-[var(--c-s1)]"}`}>
        <td className="py-1 pr-3" style={{ paddingLeft: 12 + depth * DEPTH_INDENT_PX }}>
          <div className="flex min-h-11 items-center gap-1">
            <div className="min-w-0 flex-1 py-1">
              <div className="flex flex-wrap items-center gap-2"><span className="min-w-0 font-semibold leading-snug [overflow-wrap:anywhere]">{node.item_name}</span><CostStatusBadge status={node.status} issues={node.issues} /></div>
            </div>
            {hasChildren ? <button type="button" aria-label={`${node.item_name} 하위 품목 ${open ? "접기" : "펼치기"}`} aria-expanded={open}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)]"
              style={{ color: "var(--c-muted2)" }}
              onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next; })}>
              {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button> : null}
          </div>
        </td>
        <td className="px-3 py-2 text-center font-mono [overflow-wrap:anywhere]" style={{ color: "var(--c-muted2)" }}>{node.mes_code}</td>
        <td className="px-3 py-2 text-center tabular-nums [overflow-wrap:anywhere]">{BigInt(node.required_quantity).toLocaleString("ko-KR")}</td>
        <td className="px-3 py-2 text-center tabular-nums [overflow-wrap:anywhere]">{tableAmount(node.unit_cost)}</td>
        <td className="px-3 py-2 text-center tabular-nums [overflow-wrap:anywhere]">{node.own_labor_cost === null ? <span style={{ color: "var(--c-muted2)" }}>미등록</span> : tableAmount(node.own_labor_cost)}</td>
        <td className="px-3 py-2 text-center font-bold tabular-nums [overflow-wrap:anywhere]" style={{ color: "var(--c-blue)" }}>{node.status === "partial" && <span className="sr-only">부분 합계 </span>}{repeatedTotal ? <span title={`개당 원가와 동일: ${costNumber(node.amount)} 원`}>—</span> : tableAmount(node.amount)}</td>
      </tr>
      {open && node.children.map((child, index) => renderNode(child, `${path}/${index}:${child.item_id}`, depth + 1))}
    </Fragment>;
  }

  return <div ref={surface} className="relative rounded-[16px] border" style={{ borderColor: "var(--c-border)", background: "var(--c-s1)" }}>
    <div className="flex flex-wrap items-center justify-between gap-x-2 rounded-t-[16px] border-b px-2 py-1" style={{ borderColor: "var(--c-border)" }}>
      {toolbar ?? <p className="px-2 text-xs" style={{ color: "var(--c-muted2)" }}>단계별 구성과 비용</p>}
      <div role="group" aria-label="표 펼침 조절" className="flex items-center" style={{ color: "var(--c-muted2)" }}>
        <button type="button" className={CONTROL_CLASS} onClick={() => setExpanded(new Set(branches))}>모두 펼치기</button>
        <button type="button" className={CONTROL_CLASS} onClick={() => setExpanded(new Set())}>모두 접기</button>
      </div>
    </div>
    <div className="relative min-h-0" style={{ height: "var(--cost-view-height, clamp(360px, calc(100dvh - 360px), 640px))" }}>
    <div role="region" aria-label="BOM 원가 표 스크롤" tabIndex={0} className="sg absolute inset-y-0 left-0 right-0 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--c-blue)] lg:-right-2.5 lg:[scrollbar-gutter:stable]">
      <div className="min-h-full min-w-full" style={{ background: "var(--c-s1)" }}>
      <table aria-label="BOM 원가 표" className="w-full table-fixed border-separate border-spacing-0 text-left" style={{ minWidth: 1040 }}>
        <colgroup><col /><col style={{ width: 140 }} /><col style={{ width: 100 }} /><col style={{ width: 145 }} /><col style={{ width: 120 }} /><col style={{ width: 145 }} /></colgroup>
        <thead><tr>{["품목명", "품목코드", "소요량", "개당 원가", "단계 인건비", "합계"].map((label, index) => <th key={label} scope="col" title={label === "단계 인건비" ? "이 단계 1개당 인건비 (개당 원가에 포함)" : undefined} className={`sticky top-0 z-10 h-11 border-b px-3 text-xs font-bold ${index > 0 ? "text-center" : "text-left"}`} style={{ background: "var(--c-popup-bg)", borderColor: "var(--c-border)", color: "var(--c-muted2)" }}>{label}</th>)}</tr></thead>
        <tbody>{renderNode(root, "root", 0)}</tbody>
      </table>
      </div>
    </div>
    <div aria-hidden data-scrollbar-rail-corners className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-between">
      <span className="h-4 w-4" style={{ background: "radial-gradient(circle at 100% 0, transparent 0 15px, var(--c-bg) 16px)" }} />
      <span className="h-4 w-4" style={{ background: "radial-gradient(circle at 0 0, transparent 0 15px, var(--c-bg) 16px)" }} />
    </div>
    <div aria-hidden data-scrollbar-rail-frame className="pointer-events-none absolute -inset-px z-20 rounded-b-[16px] border border-t-0" style={{ borderColor: "var(--c-border)" }} />
    </div>
  </div>;
}
