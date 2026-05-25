"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { deptAdjustmentApi } from "@/lib/api/dept-adjustment";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";

/**
 * BOM 분해 결정 노드 — 재귀 트리.
 * - leaf 노드: `keep_qty` (0..qty) 입력. 폐기 수량 = qty - keep_qty 자동 계산.
 * - 중간 노드(children != null && children.length > 0): "분해됨" — 자기 자체 정상/폐기 결정 없음, 자식 재귀.
 * - has_bom=true 이고 미펼침이면 ▶ 버튼 노출, 클릭 시 BOM 자식 lazy load.
 */
export interface ChildDecision {
  item_id: string;
  item_name: string;
  item_code: string;
  qty: number;            // 부모 × 자식 1개당 수량 (해당 노드의 총 수량)
  keep_qty: number;       // 정상 복귀 수량 (0..qty). children 있으면 무시.
  reason_memo: string;
  has_bom: boolean;       // 자식이 또 BOM 부모인가 (펼치기 버튼 노출 여부)
  children: ChildDecision[] | null;  // null=미펼침, []=펼침했지만 자식 없음, [...]=펼친 결과
}

interface DisassembleTreeProps {
  parentItemId: string;
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
  item_code: string | null;
  quantity: number;
  has_children: boolean;
}): ChildDecision {
  // 백엔드 Decimal 직렬화는 string("2.00") 일 수 있음 → api wrapper 가 1차 정규화하지만,
  // 컴포넌트 내부에서도 Number() 안전망. input value 에 소수점 노출 차단.
  const qty = Number(line.quantity);
  return {
    item_id: line.item_id,
    item_name: line.item_name,
    item_code: line.item_code ?? "",
    qty,
    keep_qty: qty,   // 기본: 전부 정상
    reason_memo: "",
    has_bom: line.has_children,
    children: null,
  };
}

export function DisassembleTree({
  parentItemId,
  parentQty,
  parentDept: _parentDept,
  decisions,
  onChange,
}: DisassembleTreeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // mount 시 1-depth BOM 자식 로드 → decisions 초기화 (decisions 이미 있으면 skip — draft 복원 대비)
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
        onChange(res.lines.map(toChildDecision));
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

  if (loading) {
    return (
      <div className="py-4 text-center text-xs font-bold" style={{ color: LEGACY_COLORS.muted }}>
        BOM 자식 목록 로딩 중...
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
  if (decisions.length === 0) {
    return (
      <div className="py-2 text-xs font-bold" style={{ color: LEGACY_COLORS.muted }}>
        BOM 자식 항목이 없습니다.
      </div>
    );
  }

  function updateAt(idx: number, next: ChildDecision) {
    onChange(decisions.map((d, i) => (i === idx ? next : d)));
  }

  return (
    <div className="flex flex-col gap-2">
      {decisions.map((d, idx) => (
        <TreeNode key={`${d.item_id}-${idx}`} node={d} depth={0} onChange={(n) => updateAt(idx, n)} />
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// TreeNode — 재귀 노드 행
// ──────────────────────────────────────────────────────────────────

function TreeNode({
  node,
  depth,
  onChange,
}: {
  node: ChildDecision;
  depth: number;
  onChange: (next: ChildDecision) => void;
}) {
  const [expanding, setExpanding] = useState(false);
  const [expandError, setExpandError] = useState<string | null>(null);

  const expanded = node.children !== null;
  const isDecomposed = expanded && (node.children?.length ?? 0) > 0;
  const scrapQty = Math.max(0, node.qty - node.keep_qty);
  const allKeep = !isDecomposed && node.keep_qty === node.qty;
  const allScrap = !isDecomposed && node.keep_qty === 0 && node.qty > 0;
  const split = !isDecomposed && !allKeep && !allScrap;

  // 정상/폐기 톤
  const keepColor = LEGACY_COLORS.blue;
  const scrapColor = LEGACY_COLORS.red;
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
      const children = res.lines.map(toChildDecision);
      onChange({ ...node, children, keep_qty: 0 });
    } catch (err) {
      setExpandError(err instanceof Error ? err.message : "자식 BOM 로드 실패");
    } finally {
      setExpanding(false);
    }
  }

  function handleCollapse() {
    // 접으면 leaf 모드로 전환 — 기본 전부 정상
    onChange({ ...node, children: null, keep_qty: node.qty });
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
      {/* 헤더 행: chevron + 품목명 + 코드 + 총 수량 */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        {node.has_bom ? (
          <button
            type="button"
            onClick={expanded ? handleCollapse : handleExpand}
            disabled={expanding}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-black/5"
            aria-label={expanded ? "접기" : "펼치기"}
            title={expanded ? "접기 (leaf 모드로 전환)" : "분해해서 자식 결정"}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
            ) : (
              <ChevronRight className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
            )}
          </button>
        ) : (
          <span className="inline-block w-6 shrink-0" />
        )}
        <Layers className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
        <span className="text-sm font-black truncate" style={{ color: LEGACY_COLORS.text }}>
          {node.item_name}
        </span>
        {node.item_code && (
          <span className="text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            {node.item_code}
          </span>
        )}
        <span className="ml-auto whitespace-nowrap text-xs font-bold" style={{ color: LEGACY_COLORS.muted }}>
          총 {formatQty(node.qty)}개
        </span>
      </div>

      {/* leaf: 정상/폐기 수량 입력 행 */}
      {!isDecomposed && (
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
                onChange({ ...node, keep_qty: clamp(raw, 0, node.qty) });
              }}
              className="w-16 rounded-[8px] border px-2 py-1 text-center text-base font-black"
              style={{
                borderColor: split ? LEGACY_COLORS.border : borderColor,
                background: LEGACY_COLORS.s1,
                color: LEGACY_COLORS.text,
              }}
              aria-label={`${node.item_name} 정상 수량`}
            />
            <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>/</span>
            <span className="text-xs font-bold" style={{ color: scrapColor }}>폐기</span>
            <span
              className="inline-block min-w-[2rem] text-center text-base font-black"
              style={{ color: scrapColor }}
            >
              {formatQty(scrapQty)}
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
      )}

      {/* 분해됨 라벨 */}
      {isDecomposed && (
        <div
          className="px-4 pb-2 text-[10px] font-black tracking-[1.5px]"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          — 분해됨 (자식들이 결정 단위) —
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

      {/* 재귀 자식 */}
      {expanded && (node.children?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          {node.children!.map((child, idx) => (
            <TreeNode
              key={`${child.item_id}-${idx}`}
              node={child}
              depth={depth + 1}
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

/** 트리 전체 valid? leaf 는 0<=keep_qty<=qty, 중간 노드는 children 비어있지 않음. */
export function validateDecisionTree(decisions: ChildDecision[]): boolean {
  for (const d of decisions) {
    if (!isValidNode(d)) return false;
  }
  return true;
}

function isValidNode(node: ChildDecision): boolean {
  if (node.children !== null && node.children.length > 0) {
    // 중간 노드 — 자식 모두 valid
    return node.children.every(isValidNode);
  }
  // leaf — keep_qty 범위
  return Number.isFinite(node.keep_qty) && node.keep_qty >= 0 && node.keep_qty <= node.qty;
}

/** 트리 → 백엔드 child_decisions 페이로드. children 있으면 nested, 없으면 leaf. */
export function toServerDecision(node: ChildDecision): Record<string, unknown> {
  if (node.children !== null && node.children.length > 0) {
    return {
      item_id: node.item_id,
      qty: node.qty,
      children: node.children.map(toServerDecision),
    };
  }
  return {
    item_id: node.item_id,
    qty: node.qty,
    keep_qty: node.keep_qty,
    reason_memo: node.reason_memo || null,
  };
}
