"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import type { BOMTreeNode } from "@/lib/api/types/catalog";
import { catalogApi } from "@/lib/api/catalog";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { HISTORY_CELL_TRANSITION } from "./historyTableHelpers";

type Props = {
  /** DISASSEMBLE 제외한 자식 로그들. */
  logs: TransactionLog[];
  parentItemId: string;
  colSpan: number;
  compact?: boolean;
};

export function ReworkBatchDetail({ logs, parentItemId, colSpan, compact }: Props) {
  const [bomTree, setBomTree] = useState<BOMTreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    catalogApi
      .getBOMTree(parentItemId)
      .then((tree) => { if (!cancelled) { setBomTree(tree); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [parentItemId]);

  function toggleItem(itemId: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  if (loading) {
    return (
      <tr>
        <td colSpan={colSpan} className="py-3 text-center text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          구성 정보 불러오는 중...
        </td>
      </tr>
    );
  }

  const bomChildren = bomTree?.children ?? [];

  if (bomChildren.length === 0) {
    return (
      <>
        {logs.map((log) => (
          <FlatLogRow key={log.log_id} log={log} compact={compact} />
        ))}
      </>
    );
  }

  return (
    <>
      {bomChildren.map((node) => (
        <NodeRows
          key={node.item_id}
          node={node}
          logs={logs}
          depth={0}
          expanded={expandedItems.has(node.item_id)}
          onToggle={() => toggleItem(node.item_id)}
          expandedItems={expandedItems}
          onToggleItem={toggleItem}
          compact={compact}
        />
      ))}
    </>
  );
}

function NodeRows({
  node,
  logs,
  depth,
  expanded,
  onToggle,
  expandedItems,
  onToggleItem,
  compact,
}: {
  node: BOMTreeNode;
  logs: TransactionLog[];
  depth: number;
  expanded: boolean;
  onToggle: () => void;
  expandedItems: Set<string>;
  onToggleItem: (id: string) => void;
  compact?: boolean;
}) {
  const padX = compact ? "px-2" : "px-4";
  const matchedLogs = logs.filter((l) => l.item_id === node.item_id);
  const hasChildren = node.children.length > 0;
  const indentPx = depth * 16;
  const unit = matchedLogs[0]?.item_unit ?? node.unit;

  // 같은 품목에 회수(RECEIVE) + 폐기(DEFECT_SCRAP) 두 로그가 모두 있는 경우를 처리.
  // 첫 번째 행에만 chevron/└ 표시, 이후 행은 들여쓰기만.
  const renderLogRow = (log: TransactionLog, idx: number) => {
    const isKeep = log.transaction_type === "RECEIVE";
    const qty = Math.abs(log.quantity_change);
    const isFirst = idx === 0;
    return (
      <tr key={log.log_id} style={{ background: isKeep ? "rgba(101,169,255,.02)" : "rgba(239,68,68,.03)" }}>
        {/* 일시 */}
        <td className={`border-b ${padX} py-1.5`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
        {/* 구분 */}
        <td className={`whitespace-nowrap border-b ${padX} py-1.5 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
          <span
            className="inline-flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-bold tracking-wide"
            style={{
              background: `color-mix(in srgb, ${isKeep ? LEGACY_COLORS.green : LEGACY_COLORS.red} 14%, transparent)`,
              color: isKeep ? LEGACY_COLORS.green : LEGACY_COLORS.red,
            }}
          >
            {isKeep ? "회수" : "폐기"}
          </span>
        </td>
        {/* 품목명 */}
        <td className="border-b px-4 py-1.5" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="flex items-center gap-2" style={{ paddingLeft: `${indentPx}px` }}>
            {isFirst && hasChildren ? (
              <button
                type="button"
                onClick={onToggle}
                aria-label={expanded ? "접기" : "펼치기"}
                className="flex h-4 w-4 shrink-0 items-center justify-center"
              >
                {expanded
                  ? <ChevronDown className="h-3 w-3" style={{ color: LEGACY_COLORS.blue }} />
                  : <ChevronRight className="h-3 w-3" style={{ color: LEGACY_COLORS.muted2 }} />}
              </button>
            ) : (
              <span className="shrink-0 text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>└</span>
            )}
            <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
              {node.item_name}
            </span>
            {isFirst && node.mes_code && (
              <span className="w-[6rem] shrink-0 text-right text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                {node.mes_code}
              </span>
            )}
          </div>
        </td>
        {/* 변동요약 */}
        <td
          className="whitespace-nowrap border-b px-4 py-1.5 text-center text-xs font-bold"
          style={{ borderColor: LEGACY_COLORS.border, color: isKeep ? LEGACY_COLORS.green : LEGACY_COLORS.red }}
        >
          {isKeep ? "+" : ""}{formatQty(qty)} {unit}
        </td>
        {/* 요청자 */}
        <td className="hidden sm:table-cell border-b px-4 py-1.5 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
          <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
        </td>
        {/* 메모 */}
        <td className="hidden sm:table-cell border-b px-4 py-1.5 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
          <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
        </td>
      </tr>
    );
  };

  // 로그 없는 BOM 노드 (처리 결정 안 된 항목)
  if (matchedLogs.length === 0) {
    return (
      <>
        <tr style={{ background: "rgba(101,169,255,.02)" }}>
          <td className={`border-b ${padX} py-1.5`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
          <td className={`whitespace-nowrap border-b ${padX} py-1.5 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
            <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
          </td>
          <td className="border-b px-4 py-1.5" style={{ borderColor: LEGACY_COLORS.border }}>
            <div className="flex items-center gap-2" style={{ paddingLeft: `${indentPx}px` }}>
              {hasChildren ? (
                <button type="button" onClick={onToggle} aria-label={expanded ? "접기" : "펼치기"} className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {expanded ? <ChevronDown className="h-3 w-3" style={{ color: LEGACY_COLORS.blue }} /> : <ChevronRight className="h-3 w-3" style={{ color: LEGACY_COLORS.muted2 }} />}
                </button>
              ) : (
                <span className="shrink-0 text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>└</span>
              )}
              <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>{node.item_name}</span>
              {node.mes_code && <span className="w-[6rem] shrink-0 text-right text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>{node.mes_code}</span>}
            </div>
          </td>
          <td className="whitespace-nowrap border-b px-4 py-1.5 text-center text-xs font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>-</td>
          <td className="hidden sm:table-cell border-b px-4 py-1.5 text-center" style={{ borderColor: LEGACY_COLORS.border }}><span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span></td>
          <td className="hidden sm:table-cell border-b px-4 py-1.5 text-center" style={{ borderColor: LEGACY_COLORS.border }}><span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span></td>
        </tr>
        {hasChildren && expanded && node.children.map((child) => (
          <NodeRows key={child.item_id} node={child} logs={logs} depth={depth + 1}
            expanded={expandedItems.has(child.item_id)} onToggle={() => onToggleItem(child.item_id)}
            expandedItems={expandedItems} onToggleItem={onToggleItem} compact={compact} />
        ))}
      </>
    );
  }

  return (
    <>
      {matchedLogs.map((log, idx) => renderLogRow(log, idx))}
      {hasChildren && expanded && node.children.map((child) => (
        <NodeRows
          key={child.item_id}
          node={child}
          logs={logs}
          depth={depth + 1}
          expanded={expandedItems.has(child.item_id)}
          onToggle={() => onToggleItem(child.item_id)}
          expandedItems={expandedItems}
          onToggleItem={onToggleItem}
          compact={compact}
        />
      ))}
    </>
  );
}

function FlatLogRow({ log, compact }: { log: TransactionLog; compact?: boolean }) {
  const padX = compact ? "px-2" : "px-4";
  const isKeep = log.transaction_type === "RECEIVE";
  const qty = Math.abs(log.quantity_change);
  return (
    <tr style={{ background: isKeep ? "rgba(101,169,255,.02)" : "rgba(239,68,68,.03)" }}>
      <td className={`border-b ${padX} py-1.5`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
      <td className={`whitespace-nowrap border-b ${padX} py-1.5 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <span
          className="inline-flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-bold tracking-wide"
          style={{
            background: `color-mix(in srgb, ${isKeep ? LEGACY_COLORS.green : LEGACY_COLORS.red} 14%, transparent)`,
            color: isKeep ? LEGACY_COLORS.green : LEGACY_COLORS.red,
          }}
        >
          {isKeep ? "회수" : "폐기"}
        </span>
      </td>
      <td className="border-b px-4 py-1.5" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>└</span>
          <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
            {log.item_name}
          </span>
          {log.mes_code && (
            <span className="w-[6rem] shrink-0 text-right text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
              {log.mes_code}
            </span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap border-b px-4 py-1.5 text-center text-xs font-bold" style={{ borderColor: LEGACY_COLORS.border, color: isKeep ? LEGACY_COLORS.green : LEGACY_COLORS.red }}>
        {isKeep ? "+" : ""}{formatQty(qty)} {log.item_unit}
      </td>
      <td className="hidden sm:table-cell border-b px-4 py-1.5 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
      </td>
      <td className="hidden sm:table-cell border-b px-4 py-1.5 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
      </td>
    </tr>
  );
}
