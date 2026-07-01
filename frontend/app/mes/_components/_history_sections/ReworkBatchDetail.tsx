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

  const renderLogRow = (log: TransactionLog, idx: number) => {
    const role = getReworkRole(log);
    const isFirst = idx === 0;
    return (
      <tr key={log.log_id} style={{ background: role.background }}>
        <td className={`border-b ${padX} py-1.5`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
        <td className={`whitespace-nowrap border-b ${padX} py-1.5 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
          <RoleBadge label={role.label} color={role.color} />
        </td>
        <td className="border-b px-4 py-1.5" style={{ borderColor: LEGACY_COLORS.border }}>
          <ItemNameCodeCell
            title={node.item_name}
            code={node.mes_code}
            depth={depth}
            hasChildren={hasChildren && isFirst}
            expanded={expanded}
            onToggle={onToggle}
          />
        </td>
        <td className="whitespace-nowrap border-b px-4 py-1.5 text-center text-xs font-semibold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
          {role.flow}
        </td>
        <td className="whitespace-nowrap border-b px-4 py-1.5 text-center text-xs font-bold" style={{ borderColor: LEGACY_COLORS.border, color: role.color }}>
          {role.sign}{formatQty(Math.abs(log.quantity_change))} {log.item_unit}
        </td>
        <td className="border-b px-4 py-1.5" style={{ borderColor: LEGACY_COLORS.border }}>
          <EmptyStatus />
        </td>
      </tr>
    );
  };

  if (matchedLogs.length === 0) {
    return (
      <>
        <tr style={{ background: "color-mix(in srgb, var(--c-blue) 2%, transparent)" }}>
          <td className={`border-b ${padX} py-1.5`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
          <td className={`whitespace-nowrap border-b ${padX} py-1.5 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
            <RoleBadge label="처리 제외" color={LEGACY_COLORS.muted2} />
          </td>
          <td className="border-b px-4 py-1.5" style={{ borderColor: LEGACY_COLORS.border }}>
            <ItemNameCodeCell
              title={node.item_name}
              code={node.mes_code}
              depth={depth}
              hasChildren={hasChildren}
              expanded={expanded}
              onToggle={onToggle}
            />
          </td>
          <td className="whitespace-nowrap border-b px-4 py-1.5 text-center text-xs font-semibold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
            처리 제외
          </td>
          <td className="whitespace-nowrap border-b px-4 py-1.5 text-center text-xs font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>-</td>
          <td className="border-b px-4 py-1.5" style={{ borderColor: LEGACY_COLORS.border }}>
            <EmptyStatus />
          </td>
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
  const role = getReworkRole(log);
  return (
    <tr style={{ background: role.background }}>
      <td className={`border-b ${padX} py-1.5`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
      <td className={`whitespace-nowrap border-b ${padX} py-1.5 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <RoleBadge label={role.label} color={role.color} />
      </td>
      <td className="border-b px-4 py-1.5" style={{ borderColor: LEGACY_COLORS.border }}>
        <ItemNameCodeCell title={log.item_name} code={log.mes_code} depth={0} />
      </td>
      <td className="whitespace-nowrap border-b px-4 py-1.5 text-center text-xs font-semibold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
        {role.flow}
      </td>
      <td className="whitespace-nowrap border-b px-4 py-1.5 text-center text-xs font-bold" style={{ borderColor: LEGACY_COLORS.border, color: role.color }}>
        {role.sign}{formatQty(Math.abs(log.quantity_change))} {log.item_unit}
      </td>
      <td className="border-b px-4 py-1.5" style={{ borderColor: LEGACY_COLORS.border }}>
        <EmptyStatus />
      </td>
    </tr>
  );
}

function ItemNameCodeCell({
  title,
  code,
  depth,
  hasChildren = false,
  expanded = false,
  onToggle,
}: {
  title: string;
  code: string | null;
  depth: number;
  hasChildren?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2" style={{ paddingLeft: `${depth * 16}px` }}>
      {hasChildren && onToggle ? (
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
        <span className="mt-0.5 shrink-0 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>└</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
          {title}
        </div>
        {code && (
          <div className="mt-0.5 truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
            {code}
          </div>
        )}
      </div>
    </div>
  );
}

function RoleBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-bold tracking-wide"
      style={{
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
      }}
    >
      {label}
    </span>
  );
}

function EmptyStatus() {
  return <span className="block text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>;
}

function getReworkRole(log: TransactionLog): {
  label: string;
  flow: string;
  sign: "+" | "-";
  color: string;
  background: string;
} {
  const isKeep = log.transaction_type === "RECEIVE";
  return {
    label: isKeep ? "회수" : "폐기",
    flow: isKeep ? "하위 회수" : "하위 폐기",
    sign: isKeep ? "+" : "-",
    color: isKeep ? LEGACY_COLORS.green : LEGACY_COLORS.red,
    background: isKeep
      ? "color-mix(in srgb, var(--c-blue) 2%, transparent)"
      : "color-mix(in srgb, var(--c-red) 3%, transparent)",
  };
}