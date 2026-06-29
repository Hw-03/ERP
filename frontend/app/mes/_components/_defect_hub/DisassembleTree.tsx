"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { deptAdjustmentApi } from "@/lib/api/dept-adjustment";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import { InlineErrorNote } from "./InlineErrorNote";

export interface ChildDecision {
  item_id: string;
  item_name: string;
  mes_code: string;
  qty: number;
  normal_qty: number;
  defective_qty: number;
  scrap_qty: number;
  keep_qty: number;
  reason_memo: string;
  has_bom: boolean;
  children: ChildDecision[] | null;
  manuallySet?: boolean;
  nodeMode?: "whole" | "split";
}

interface DisassembleTreeProps {
  parentItemId: string;
  parentItemName: string;
  parentMesCode: string;
  parentQty: number;
  parentDept: string;
  decisions: ChildDecision[];
  onChange: (decisions: ChildDecision[]) => void;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function toChildDecision(line: {
  item_id: string;
  item_name: string;
  mes_code: string | null;
  quantity: number;
  has_children: boolean;
}): ChildDecision {
  const qty = Number(line.quantity);
  return {
    item_id: line.item_id,
    item_name: line.item_name,
    mes_code: line.mes_code ?? "",
    qty,
    normal_qty: qty,
    defective_qty: 0,
    scrap_qty: 0,
    keep_qty: qty,
    reason_memo: "",
    manuallySet: false,
    has_bom: line.has_children,
    children: null,
  };
}

function deptFromCode(mesCode: string): string | null {
  const process = mesCode.split("-")[1] ?? "";
  const prefix = process.slice(0, 1).toUpperCase();
  const map: Record<string, string> = {
    T: "튜브",
    H: "고압",
    V: "진공",
    N: "튜닝",
    A: "조립",
    P: "출하",
  };
  return map[prefix] ?? null;
}

function normalizeSplit(
  node: ChildDecision,
  part: "normal_qty" | "defective_qty" | "scrap_qty",
  raw: number,
): ChildDecision {
  const next = { ...node };
  const value = clamp(raw, 0, node.qty);

  if (part === "normal_qty") {
    const scrapQty = clamp(next.scrap_qty, 0, node.qty - value);
    next.normal_qty = value;
    next.scrap_qty = scrapQty;
    next.defective_qty = node.qty - value - scrapQty;
  } else {
    next[part] = value;
    const defectiveQty = clamp(next.defective_qty, 0, node.qty);
    const scrapQty = clamp(next.scrap_qty, 0, Math.max(0, node.qty - defectiveQty));
    next.defective_qty = defectiveQty;
    next.scrap_qty = scrapQty;
    next.normal_qty = node.qty - defectiveQty - scrapQty;
  }

  next.keep_qty = next.normal_qty;
  return { ...next, manuallySet: true };
}

function cascadeNormalQty(children: ChildDecision[], parentNormalQty: number, parentQty: number): ChildDecision[] {
  if (parentQty <= 0) return children;
  const ratio = parentNormalQty / parentQty;
  return children.map((child) => {
    if (child.manuallySet) return child;
    const normalQty = Math.min(child.qty, Math.round(ratio * child.qty));
    const next = {
      ...child,
      normal_qty: normalQty,
      defective_qty: child.qty - normalQty,
      scrap_qty: 0,
      keep_qty: normalQty,
    };
    if (child.children && child.children.length > 0) {
      return { ...next, children: cascadeNormalQty(child.children, normalQty, child.qty) };
    }
    return next;
  });
}

export function DisassembleTree({
  parentItemId,
  parentItemName,
  parentMesCode,
  parentQty,
  parentDept: _parentDept,
  decisions,
  onChange,
}: DisassembleTreeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parentNormalQty, setParentNormalQty] = useState(parentQty);

  useEffect(() => {
    if (decisions.length > 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    deptAdjustmentApi
      .getBomTemplate(parentItemId, "disassembly", parentQty)
      .then((res) => {
        if (cancelled) return;
        onChange(res.lines.filter((l) => l.item_id !== parentItemId).map(toChildDecision));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "BOM 템플릿 로드 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentItemId, parentQty]);

  function handleParentNormalChange(raw: number) {
    const next = clamp(raw, 0, parentQty);
    setParentNormalQty(next);
    onChange(cascadeNormalQty(decisions, next, parentQty));
  }

  if (loading) {
    return (
      <div className="py-4 text-center text-xs font-bold" style={{ color: LEGACY_COLORS.muted }}>
        BOM 하위 품목 로딩 중...
      </div>
    );
  }
  if (error) return <InlineErrorNote>{error}</InlineErrorNote>;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="rounded-[14px] border"
        style={{ borderColor: LEGACY_COLORS.red, background: tint(LEGACY_COLORS.red, 6) }}
      >
        <div className="flex items-center gap-2 px-4 py-2.5">
          <ChevronDown className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.red }} />
          <Layers className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.red }} />
          <span className="min-w-0 break-keep text-sm font-black lg:truncate" style={{ color: LEGACY_COLORS.text }}>
            {parentItemName}
          </span>
          {parentMesCode && (
            <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{parentMesCode}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
          <span className="text-xs font-black" style={{ color: LEGACY_COLORS.blue }}>하위 기본 정상</span>
          <input
            type="number"
            min={0}
            max={parentQty}
            value={parentNormalQty}
            onChange={(e) => handleParentNormalChange(Number(e.target.value))}
            className="h-11 w-20 rounded-[10px] border px-2 text-center text-base font-black"
            style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1, color: LEGACY_COLORS.text }}
            aria-label="하위 기본 정상 수량"
          />
          <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            / {formatQty(parentQty, { maximumFractionDigits: 2, trimTrailingZeros: true })} 기준으로 하위 품목에 배분
          </span>
        </div>
      </div>

      {decisions.length === 0 ? (
        <div className="py-2 pl-5 text-xs font-bold" style={{ color: LEGACY_COLORS.muted }}>
          BOM 하위 품목이 없습니다.
        </div>
      ) : (
        decisions.map((d, idx) => (
          <TreeNode
            key={`${d.item_id}-${idx}`}
            node={d}
            depth={1}
            cascadeRatio={parentQty > 0 ? parentNormalQty / parentQty : 0}
            onChange={(next) => onChange(decisions.map((cur, i) => (i === idx ? next : cur)))}
          />
        ))
      )}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  cascadeRatio,
  onChange,
}: {
  node: ChildDecision;
  depth: number;
  cascadeRatio: number;
  onChange: (next: ChildDecision) => void;
}) {
  const [expanding, setExpanding] = useState(false);
  const [expandError, setExpandError] = useState<string | null>(null);

  const expanded = node.children !== null;
  const hasChildren = expanded && (node.children?.length ?? 0) > 0;
  const nodeMode = node.nodeMode ?? "whole";
  const isDecomposed = hasChildren && nodeMode === "split";
  const total = node.normal_qty + node.defective_qty + node.scrap_qty;
  const invalid = !isDecomposed && total !== node.qty;
  const nodeDept = deptFromCode(node.mes_code);

  async function handleExpand() {
    if (!node.has_bom || expanding) return;
    setExpanding(true);
    setExpandError(null);
    try {
      const res = await deptAdjustmentApi.getBomTemplate(node.item_id, "disassembly", node.qty);
      const rawChildren = res.lines.filter((l) => l.item_id !== node.item_id).map(toChildDecision);
      const effectiveNormal = node.manuallySet
        ? node.normal_qty
        : Math.min(node.qty, Math.round(cascadeRatio * node.qty));
      const children = cascadeNormalQty(rawChildren, effectiveNormal, node.qty);
      onChange({ ...node, children, normal_qty: effectiveNormal, defective_qty: node.qty - effectiveNormal, scrap_qty: 0, keep_qty: effectiveNormal, nodeMode: "whole" });
    } catch (err) {
      setExpandError(err instanceof Error ? err.message : "하위 품목 BOM 로드 실패");
    } finally {
      setExpanding(false);
    }
  }

  function handleCollapse() {
    const normalQty = Math.min(node.qty, Math.round(cascadeRatio * node.qty));
    onChange({ ...node, children: null, normal_qty: normalQty, defective_qty: node.qty - normalQty, scrap_qty: 0, keep_qty: normalQty, manuallySet: false, nodeMode: undefined });
  }

  function updatePart(part: "normal_qty" | "defective_qty" | "scrap_qty", raw: number) {
    onChange(normalizeSplit(node, part, raw));
  }

  const borderColor = invalid ? LEGACY_COLORS.red : isDecomposed ? LEGACY_COLORS.border : LEGACY_COLORS.blue;
  const bgColor = invalid ? tint(LEGACY_COLORS.red, 5) : isDecomposed ? LEGACY_COLORS.s2 : LEGACY_COLORS.s1;

  return (
    <div
      className="rounded-[14px] border transition-colors"
      style={{ borderColor, background: bgColor, marginLeft: depth > 0 ? depth * 20 : undefined }}
    >
      <div className="flex items-center gap-2 px-4 py-2.5">
        {node.has_bom ? (
          <button
            type="button"
            onClick={expanded ? handleCollapse : handleExpand}
            disabled={expanding}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] transition-colors hover:brightness-110"
            style={{ background: tint(LEGACY_COLORS.blue, 12), border: `1px solid ${tint(LEGACY_COLORS.blue, 30)}` }}
            aria-label={expanded ? "접기" : "펼치기"}
          >
            {expanded ? <ChevronDown className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} /> : <ChevronRight className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />}
          </button>
        ) : <span className="inline-block w-11 shrink-0" />}
        <Layers className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
        <span className="min-w-0 break-keep text-sm font-black lg:truncate" style={{ color: LEGACY_COLORS.text }}>
          {node.item_name}
        </span>
        {node.mes_code && <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{node.mes_code}</span>}
        {nodeDept && (
          <span className="rounded-full px-2 py-0.5 text-xs font-black" style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}>
            입고 부서 · {nodeDept}
          </span>
        )}
        <span className="ml-auto whitespace-nowrap text-xs font-bold" style={{ color: LEGACY_COLORS.muted }}>
          총 {formatQty(node.qty, { maximumFractionDigits: 2, trimTrailingZeros: true })}개
        </span>
      </div>

      {!isDecomposed ? (
        <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
          <QtyInput label="정상" value={node.normal_qty} color={LEGACY_COLORS.blue} onChange={(v) => updatePart("normal_qty", v)} ariaLabel={`${node.item_name} 정상 수량`} />
          <QtyInput label="격리" value={node.defective_qty} color={LEGACY_COLORS.yellow} onChange={(v) => updatePart("defective_qty", v)} ariaLabel={`${node.item_name} 격리 수량`} />
          <QtyInput label="폐기" value={node.scrap_qty} color={LEGACY_COLORS.red} onChange={(v) => updatePart("scrap_qty", v)} ariaLabel={`${node.item_name} 폐기 수량`} />
          <input
            type="text"
            placeholder="메모 (선택)"
            value={node.reason_memo}
            onChange={(e) => onChange({ ...node, reason_memo: e.target.value })}
            className="min-h-11 min-w-[180px] flex-1 rounded-[10px] border px-3 text-xs"
            style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1, color: LEGACY_COLORS.text }}
            aria-label={`${node.item_name} 메모`}
          />
          {invalid && <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>합계가 총 수량과 같아야 합니다.</span>}
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 pb-2.5">
          <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>하위 품목별 처리 중</span>
        </div>
      )}

      {hasChildren && (
        <div className="flex items-center gap-1.5 px-4 pb-3">
          <button
            type="button"
            onClick={() => onChange({ ...node, nodeMode: "whole" })}
            className="min-h-11 rounded-full px-3 py-1 text-xs font-black transition-colors"
            style={{ background: nodeMode === "whole" ? LEGACY_COLORS.blue : "transparent", color: nodeMode === "whole" ? LEGACY_COLORS.white : LEGACY_COLORS.muted2, border: `1px solid ${nodeMode === "whole" ? LEGACY_COLORS.blue : LEGACY_COLORS.border}` }}
          >
            이 품목 통째로
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...node, nodeMode: "split", children: cascadeNormalQty(node.children!, node.normal_qty, node.qty) })}
            className="min-h-11 rounded-full px-3 py-1 text-xs font-black transition-colors"
            style={{ background: nodeMode === "split" ? LEGACY_COLORS.blue : "transparent", color: nodeMode === "split" ? LEGACY_COLORS.white : LEGACY_COLORS.muted2, border: `1px solid ${nodeMode === "split" ? LEGACY_COLORS.blue : LEGACY_COLORS.border}` }}
          >
            하위 품목별 처리
          </button>
        </div>
      )}

      {expandError && <InlineErrorNote className="mx-4 mb-3">{expandError}</InlineErrorNote>}

      {expanded && (node.children?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-2 px-3 pb-3" style={nodeMode === "whole" ? { opacity: 0.35, pointerEvents: "none" } : undefined}>
          {node.children!.map((child, idx) => (
            <TreeNode
              key={`${child.item_id}-${idx}`}
              node={child}
              depth={depth + 1}
              cascadeRatio={cascadeRatio}
              onChange={(updated) => {
                const next = [...(node.children ?? [])];
                next[idx] = updated;
                onChange({ ...node, children: next });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QtyInput({ label, value, color, onChange, ariaLabel }: { label: string; value: number; color: string; onChange: (value: number) => void; ariaLabel: string }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-xs font-black" style={{ color }}>{label}</span>
      <input
        type="number"
        min={0}
        step="1"
        value={Number(value) || 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-20 rounded-[10px] border px-2 text-center text-base font-black"
        style={{ borderColor: color, background: LEGACY_COLORS.s1, color: LEGACY_COLORS.text }}
        aria-label={ariaLabel}
      />
    </label>
  );
}

export function validateDecisionTree(decisions: ChildDecision[]): boolean {
  return decisions.every(isValidNode);
}

function isValidNode(node: ChildDecision): boolean {
  const nodeMode = node.nodeMode ?? "whole";
  if (node.children !== null && node.children.length > 0 && nodeMode === "split") {
    return node.children.every(isValidNode);
  }
  const total = node.normal_qty + node.defective_qty + node.scrap_qty;
  return [node.normal_qty, node.defective_qty, node.scrap_qty].every((n) => Number.isFinite(n) && n >= 0) && total === node.qty;
}

export function toServerDecision(node: ChildDecision): Record<string, unknown> {
  const nodeMode = node.nodeMode ?? "whole";
  if (node.children !== null && node.children.length > 0 && nodeMode === "split") {
    return {
      item_id: node.item_id,
      qty: node.qty,
      children: node.children.map(toServerDecision),
    };
  }
  return {
    item_id: node.item_id,
    qty: node.qty,
    normal_qty: node.normal_qty,
    defective_qty: node.defective_qty,
    scrap_qty: node.scrap_qty,
    reason_memo: node.reason_memo || null,
  };
}