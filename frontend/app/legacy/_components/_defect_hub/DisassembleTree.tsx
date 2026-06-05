"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { deptAdjustmentApi } from "@/lib/api/dept-adjustment";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";

/**
 * BOM 분해 결정 노드 — 재귀 트리.
 * - leaf 노드 (children=null 또는 nodeMode="whole"): keep_qty 입력 → 그 품목 자체 입고.
 * - split 노드 (nodeMode="split", children 있음): 자식들이 각각 결정 단위.
 * - has_bom=true 이고 미펼침이면 ▶ 버튼 노출, 클릭 시 BOM 자식 lazy load.
 */
export interface ChildDecision {
  item_id: string;
  item_name: string;
  mes_code: string;
  qty: number;            // 해당 노드의 총 수량
  keep_qty: number;       // 정상 복귀 수량 (0..qty). split 모드에서는 cascade 기준값.
  reason_memo: string;
  has_bom: boolean;
  children: ChildDecision[] | null;  // null=미펼침, []=펼쳤지만 자식 없음, [...]=펼친 결과
  manuallySet?: boolean;
  nodeMode?: "whole" | "split"; // 펼친 상태일 때만 의미. "whole"=이 품목 통째로, "split"=하위 품목별 처리
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
    keep_qty: 0,
    reason_memo: "",
    manuallySet: false,
    has_bom: line.has_children,
    children: null,
  };
}

// 부모 keep 비율을 자식 전체에 비례 전파.
// 중간 노드도 keep_qty를 업데이트해야 "whole" 모드에서 cascade가 반영됨.
function cascadeKeepQty(
  children: ChildDecision[],
  parentKeepQty: number,
  parentQty: number,
): ChildDecision[] {
  if (parentQty <= 0) return children;
  const ratio = parentKeepQty / parentQty;
  return children.map((child) => {
    if (child.manuallySet) return child;
    const newKeep = Math.min(child.qty, Math.round(ratio * child.qty));
    if (child.children && child.children.length > 0) {
      // 중간 노드도 keep_qty 갱신 (whole 모드 receipt에 사용) + 자식 재귀
      return { ...child, keep_qty: newKeep, children: cascadeKeepQty(child.children, newKeep, child.qty) };
    }
    return { ...child, keep_qty: newKeep };
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
  const [parentKeepQty, setParentKeepQty] = useState(0);

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
    // BOM 템플릿 1회 로드 패턴. onChange 는 호출부에서 항상 setDecisions(안정적 setter)
    // 라 deps 에 넣어도 재실행되지 않고, decisions 는 일부러 제외 — 넣으면 입력 편집마다
    // effect 가 재평가돼 불필요(상단 length>0 가드로 재요청은 막지만 호출 자체가 낭비).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentItemId, parentQty]);

  if (loading) {
    return (
      <div className="py-4 text-center text-xs font-bold" style={{ color: LEGACY_COLORS.muted }}>
        BOM 하위 품목 로딩 중...
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="rounded-[10px] border px-3 py-2 text-xs font-bold text-red-700"
        style={{ background: "#fef2f2", borderColor: "#fca5a5" }}
      >
        {error}
      </div>
    );
  }

  function updateAt(idx: number, next: ChildDecision) {
    onChange(decisions.map((d, i) => (i === idx ? next : d)));
  }

  function handleParentKeepChange(raw: number) {
    const next = clamp(raw, 0, parentQty);
    setParentKeepQty(next);
    onChange(cascadeKeepQty(decisions, next, parentQty));
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 상위 품목 — 전량 분해 대상 */}
      <div
        className="rounded-[14px] border"
        style={{ borderColor: LEGACY_COLORS.red, background: tint(LEGACY_COLORS.red, 6) }}
      >
        <div className="flex items-center gap-2 px-4 py-2.5">
          <ChevronDown className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.red }} />
          <Layers className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.red }} />
          <span className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
            {parentItemName}
          </span>
          {parentMesCode && (
            <span className="text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              {parentMesCode}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black" style={{ color: LEGACY_COLORS.blue }}>정상</span>
            <input
              type="number"
              min={0}
              max={parentQty}
              value={parentKeepQty}
              onChange={(e) => handleParentKeepChange(Number(e.target.value))}
              className="w-16 rounded-[8px] border px-2 py-1 text-center text-base font-black"
              style={{
                borderColor: parentKeepQty === 0 ? LEGACY_COLORS.red : parentKeepQty === parentQty ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                background: LEGACY_COLORS.s1,
                color: LEGACY_COLORS.text,
              }}
              aria-label="상위 품목 정상 수량"
            />
            <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>/</span>
            <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.yellow }}>격리</span>
            <span className="inline-block min-w-[2rem] text-center text-base font-black" style={{ color: LEGACY_COLORS.yellow }}>
              {formatQty(Math.max(0, parentQty - parentKeepQty), { maximumFractionDigits: 2, trimTrailingZeros: true })}
            </span>
          </div>
          <span className="text-[10px] font-black tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
            — 하위 품목 회수 결정 (회수 외 = 격리) —
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
            cascadeRatio={parentQty > 0 ? parentKeepQty / parentQty : 0}
            onChange={(n) => updateAt(idx, n)}
          />
        ))
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// TreeNode — 재귀 노드 행
// ──────────────────────────────────────────────────────────────────

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
  const nodeMode = node.nodeMode ?? "whole"; // 펼쳤을 때 기본: 이 품목 통째로
  // isDecomposed: "하위 품목별 처리" 모드일 때만 true (백엔드 중간 노드 처리)
  const isDecomposed = hasChildren && nodeMode === "split";

  const scrapQty = Math.max(0, node.qty - node.keep_qty);
  const allKeep = !isDecomposed && node.keep_qty === node.qty;
  const allScrap = !isDecomposed && node.keep_qty === 0 && node.qty > 0;
  const isSplitQty = !isDecomposed && !allKeep && !allScrap;

  const keepColor = LEGACY_COLORS.blue;
  // 회수 외 잔량은 폐기가 아니라 격리로 이동 — 폐기(red)와 구분되는 보류 톤(yellow).
  const scrapColor = LEGACY_COLORS.yellow;
  const borderColor = isDecomposed
    ? LEGACY_COLORS.border
    : allKeep
      ? keepColor
      : allScrap
        ? scrapColor
        : LEGACY_COLORS.border;
  const bgColor = isDecomposed
    ? LEGACY_COLORS.s2
    : allKeep
      ? tint(keepColor, 6)
      : allScrap
        ? tint(scrapColor, 6)
        : LEGACY_COLORS.s1;

  async function handleExpand() {
    if (!node.has_bom || expanding) return;
    setExpanding(true);
    setExpandError(null);
    try {
      const res = await deptAdjustmentApi.getBomTemplate(node.item_id, "disassembly", node.qty);
      const rawChildren = res.lines.filter((l) => l.item_id !== node.item_id).map(toChildDecision);
      const effectiveKeep = node.manuallySet
        ? node.keep_qty
        : Math.min(node.qty, Math.round(cascadeRatio * node.qty));
      const children = cascadeKeepQty(rawChildren, effectiveKeep, node.qty);
      // 기본값: "이 품목 통째로" — keep_qty 보존
      onChange({ ...node, children, keep_qty: effectiveKeep, nodeMode: "whole" });
    } catch (err) {
      setExpandError(err instanceof Error ? err.message : "하위 품목 BOM 로드 실패");
    } finally {
      setExpanding(false);
    }
  }

  function handleCollapse() {
    const cascadedKeep = Math.min(node.qty, Math.round(cascadeRatio * node.qty));
    onChange({ ...node, children: null, keep_qty: cascadedKeep, manuallySet: false, nodeMode: undefined });
  }

  function switchToSplit() {
    const children = cascadeKeepQty(node.children!, node.keep_qty, node.qty);
    onChange({ ...node, nodeMode: "split", children });
  }

  function switchToWhole() {
    onChange({ ...node, nodeMode: "whole" });
  }

  return (
    <div
      className="rounded-[14px] border transition-colors"
      style={{
        borderColor,
        background: bgColor,
        marginLeft: depth > 0 ? depth * 20 : undefined,
      }}
    >
      {/* 헤더 행 */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        {node.has_bom ? (
          <button
            type="button"
            onClick={expanded ? handleCollapse : handleExpand}
            disabled={expanding}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:brightness-110"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`,
              border: `1px solid color-mix(in srgb, ${LEGACY_COLORS.blue} 30%, transparent)`,
            }}
            aria-label={expanded ? "접기" : "펼치기"}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
            ) : (
              <ChevronRight className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
            )}
          </button>
        ) : (
          <span className="inline-block w-7 shrink-0" />
        )}
        <Layers className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
        <span className="text-sm font-black truncate" style={{ color: LEGACY_COLORS.text }}>
          {node.item_name}
        </span>
        {node.mes_code && (
          <span className="text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            {node.mes_code}
          </span>
        )}
        {node.manuallySet && !isDecomposed && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-black"
            style={{ background: "#fef3c7", color: "#92400e" }}
          >
            수동
          </span>
        )}
        <span className="ml-auto whitespace-nowrap text-xs font-bold" style={{ color: LEGACY_COLORS.muted }}>
          총 {formatQty(node.qty, { maximumFractionDigits: 2, trimTrailingZeros: true })}개
        </span>
      </div>

      {/* 수량 입력 행 */}
      {!isDecomposed ? (
        /* leaf 또는 "이 품목 통째로" 모드: 정상/격리 입력 (회수 외 = 격리) */
        <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black" style={{ color: keepColor }}>정상</span>
            <input
              type="number"
              min={0}
              max={node.qty}
              value={Number(node.keep_qty) || 0}
              onChange={(e) => {
                const raw = Number(e.target.value);
                onChange({ ...node, keep_qty: clamp(raw, 0, node.qty), manuallySet: true });
              }}
              className="w-16 rounded-[8px] border px-2 py-1 text-center text-base font-black"
              style={{
                borderColor: isSplitQty ? LEGACY_COLORS.border : borderColor,
                background: LEGACY_COLORS.s1,
                color: LEGACY_COLORS.text,
              }}
              aria-label={`${node.item_name} 정상 수량`}
            />
            <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>/</span>
            <span className="text-xs font-bold" style={{ color: scrapColor }}>격리</span>
            <span
              className="inline-block min-w-[2rem] text-center text-base font-black"
              style={{ color: scrapColor }}
            >
              {formatQty(scrapQty, { maximumFractionDigits: 2, trimTrailingZeros: true })}
            </span>
          </div>
          <input
            type="text"
            placeholder="메모 (선택)"
            value={node.reason_memo}
            onChange={(e) => onChange({ ...node, reason_memo: e.target.value })}
            className="flex-1 min-w-[200px] rounded-[8px] border px-3 py-1.5 text-xs"
            style={{
              borderColor: LEGACY_COLORS.border,
              background: LEGACY_COLORS.s1,
              color: LEGACY_COLORS.text,
            }}
            aria-label={`${node.item_name} 메모`}
          />
        </div>
      ) : (
        /* "하위 품목별 처리" 모드: cascade 기준 입력 */
        <div className="flex items-center gap-2 px-4 pb-2.5">
          <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>하위 분배 기준</span>
          <input
            type="number"
            min={0}
            max={node.qty}
            value={Number(node.keep_qty) || 0}
            onChange={(e) => {
              const newKeep = clamp(Number(e.target.value), 0, node.qty);
              const children = cascadeKeepQty(node.children!, newKeep, node.qty);
              onChange({ ...node, keep_qty: newKeep, children, manuallySet: true });
            }}
            className="w-14 rounded-[8px] border px-2 py-1 text-center text-sm font-bold"
            style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}
            aria-label={`${node.item_name} 하위 분배 기준`}
          />
          <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>/ {formatQty(node.qty, { maximumFractionDigits: 2, trimTrailingZeros: true })}</span>
        </div>
      )}

      {/* 펼쳐진 상태: "이 품목 통째로" / "하위 품목별 처리" 토글 */}
      {hasChildren && (
        <div className="flex items-center gap-1.5 px-4 pb-3">
          <button
            type="button"
            onClick={switchToWhole}
            className="rounded-full px-3 py-1 text-[11px] font-black transition-colors"
            style={{
              background: nodeMode === "whole" ? LEGACY_COLORS.blue : "transparent",
              color: nodeMode === "whole" ? "#fff" : LEGACY_COLORS.muted2,
              border: `1px solid ${nodeMode === "whole" ? LEGACY_COLORS.blue : LEGACY_COLORS.border}`,
            }}
          >
            이 품목 통째로
          </button>
          <button
            type="button"
            onClick={switchToSplit}
            className="rounded-full px-3 py-1 text-[11px] font-black transition-colors"
            style={{
              background: nodeMode === "split" ? LEGACY_COLORS.blue : "transparent",
              color: nodeMode === "split" ? "#fff" : LEGACY_COLORS.muted2,
              border: `1px solid ${nodeMode === "split" ? LEGACY_COLORS.blue : LEGACY_COLORS.border}`,
            }}
          >
            하위 품목별 처리
          </button>
        </div>
      )}

      {/* 펼침 에러 */}
      {expandError && (
        <div
          className="mx-4 mb-3 rounded-[8px] border px-3 py-2 text-[11px] font-bold text-red-700"
          style={{ background: "#fef2f2", borderColor: "#fca5a5" }}
        >
          {expandError}
        </div>
      )}

      {/* 재귀 자식 — "이 품목 통째로" 모드에서는 흐릿하게 비활성 */}
      {expanded && (node.children?.length ?? 0) > 0 && (
        <div
          className="flex flex-col gap-2 px-3 pb-3"
          style={nodeMode === "whole" ? { opacity: 0.35, pointerEvents: "none" } : undefined}
        >
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

// ──────────────────────────────────────────────────────────────────
// 검증 + 서버 페이로드 변환 (외부 사용)
// ──────────────────────────────────────────────────────────────────

export function validateDecisionTree(decisions: ChildDecision[]): boolean {
  for (const d of decisions) {
    if (!isValidNode(d)) return false;
  }
  return true;
}

function isValidNode(node: ChildDecision): boolean {
  const nodeMode = node.nodeMode ?? "whole";
  if (node.children !== null && node.children.length > 0 && nodeMode === "split") {
    // "하위 품목별 처리" 중간 노드 — 자식 모두 valid
    return node.children.every(isValidNode);
  }
  // leaf 또는 "이 품목 통째로" — keep_qty 범위 체크
  return Number.isFinite(node.keep_qty) && node.keep_qty >= 0 && node.keep_qty <= node.qty;
}

/** 트리 → 백엔드 child_decisions 페이로드 */
export function toServerDecision(node: ChildDecision): Record<string, unknown> {
  const nodeMode = node.nodeMode ?? "whole";
  if (node.children !== null && node.children.length > 0 && nodeMode === "split") {
    // "하위 품목별 처리" — 중간 노드 (자식들만 재귀)
    return {
      item_id: node.item_id,
      qty: node.qty,
      children: node.children.map(toServerDecision),
    };
  }
  // leaf 또는 "이 품목 통째로" — 이 품목 자체 keep_qty 반영
  return {
    item_id: node.item_id,
    qty: node.qty,
    keep_qty: node.keep_qty,
    reason_memo: node.reason_memo || null,
  };
}
