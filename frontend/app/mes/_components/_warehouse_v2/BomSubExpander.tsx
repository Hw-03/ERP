"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, GitBranch } from "lucide-react";
import { api } from "@/lib/api";
import type { BOMTreeNode } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatBomQuantity } from "@/lib/mes/bomFormat";
import { formatQty } from "@/lib/mes/format";
import { mesCodeDeptBadge, processTypeColor } from "@/lib/mes/process";
import { useDeptColorLookup } from "../DepartmentsContext";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import { ReadFailure, ReadLoading } from "../common/ReadState";
import { SkeletonBlock, dataRevealClassName } from "../common/LoadingSkeleton";

const ROW_H = 34; // 일정한 행 높이(px) — 연결선이 정확히 이어지려면 고정
const GUIDE_W = 22; // 가이드(레일/엘보) 컬럼 폭(px)
const MODAL_TREE_DEPTH_INDENT_PX = 48;
const MODAL_TREE_CHEVRON_TEXT_OFFSET_PX = 10;
const MODAL_TREE_MAX_VISIBLE_DEPTH = 8; // 현재 BOM 최대 9단계 중 최상위 표시 행은 기본 표면색(depth 0)
const RAIL = tint(LEGACY_COLORS.muted2, 30); // depth 무관 단일 중립 연결선색
const RAIL_W = 1.5;

/** 조상 컬럼: 세로선이 계속 이어지면 풀높이 라인, 아니면 빈 칸 */
function Rail({ show, stretch = false, mobile = false }: { show: boolean; stretch?: boolean; mobile?: boolean }) {
  return (
    <span
      data-testid={stretch ? "bom-modal-rail" : undefined}
      className={`relative shrink-0${stretch ? " self-stretch" : ""}`}
      style={{ width: mobile ? 12 : GUIDE_W, height: stretch ? undefined : ROW_H }}
    >
      {show && (
        <span
          className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2"
          style={{ width: RAIL_W, background: RAIL }}
        />
      )}
    </span>
  );
}

/** 현재 노드 엘보(├ 또는 └) */
function Connector({ isLast, stretch = false, mobile = false }: { isLast: boolean; stretch?: boolean; mobile?: boolean }) {
  return (
    <span
      data-testid={stretch ? "bom-modal-connector" : undefined}
      className={`relative shrink-0${stretch ? " self-stretch" : ""}`}
      style={{ width: mobile ? 12 : GUIDE_W, height: stretch ? undefined : ROW_H }}
    >
      {/* 세로: top → 중앙 (위로 연결) */}
      <span
        data-testid={stretch ? "bom-modal-connector-line" : undefined}
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          top: 0,
          height: stretch ? isLast ? "50%" : "100%" : isLast ? ROW_H / 2 : ROW_H,
          width: RAIL_W,
          background: RAIL,
        }}
      />
      {/* 가로: 중앙 → 우측 끝 */}
      <span
        className="absolute -translate-y-1/2"
        style={{ top: stretch ? "50%" : ROW_H / 2, left: "50%", right: 0, height: RAIL_W, background: RAIL }}
      />
    </span>
  );
}

function BomTreeItem({
  node,
  rails,
  isLast,
  compact = false,
  tapToExpandName = false,
  stock = false,
  modal = false,
  mobilePresentation = false,
}: {
  node: BOMTreeNode;
  rails: boolean[];
  isLast: boolean;
  compact?: boolean;
  /** 항목 2-1 (모바일 전용) — 이름 행을 탭하면 풀네임 펼침. 데스크톱 호출처는 미전달(기본 false). */
  tapToExpandName?: boolean;
  stock?: boolean;
  modal?: boolean;
  mobilePresentation?: boolean;
}) {
  const getDeptColor = useDeptColorLookup();
  const [open, setOpen] = useState(false);
  // 항목 2-1 — 이름 탭 펼침 상태(모바일 전용). tapToExpandName=false 면 항상 false 라 데스크톱 영향 없음.
  const [nameExpanded, setNameExpanded] = useState(stock && !modal);
  const hasKids = node.children.length > 0;
  const deptBadge = node.mes_code ? mesCodeDeptBadge(node.mes_code, getDeptColor) : null;
  const qty = node.required_quantity;

  // 우측 메타(부서 · 코드 · 소요량) — 1줄(collapsed)·펼침(reflow) 양쪽에서 동일하게 재사용.
  const metaChildren = (
    <>
      {/* 부서 — 색 = 1차 앵커. 좌정렬 */}
      <span className="flex min-w-0 justify-start">
        {deptBadge && (
          <span
            className={mobilePresentation ? "rounded-full px-2 py-0.5 text-xs font-medium leading-none" : "rounded-full px-2 py-0.5 text-[10px] font-bold leading-none"}
            style={{ color: deptBadge.color, background: deptBadge.bg }}
          >
            {deptBadge.label}
          </span>
        )}
      </span>

      {/* 코드 — 보조 모노스페이스. 우정렬로 우변 기준선 고정 */}
      <span
        className={mobilePresentation ? "min-w-0 break-all font-mono text-xs" : "min-w-0 truncate whitespace-nowrap text-right font-mono text-[11px] tracking-tight"}
        style={{ color: tint(LEGACY_COLORS.muted2, 70) }}
        title={node.mes_code ?? undefined}
      >
        {node.mes_code || ""}
      </span>

      {/* 소요량 — 실행후 자리(col4)에 가운데 정렬 강조. */}
      {!mobilePresentation && <span
        className="text-center text-xs tabular-nums leading-none"
        style={{ gridColumn: "4", color: qty > 1 ? LEGACY_COLORS.text : LEGACY_COLORS.muted2, fontWeight: mobilePresentation ? 600 : qty > 1 ? 800 : 600 }}
      >
        {formatBomQuantity(qty, node.unit)}
      </span>}
      {stock && (
        <span
          className="text-xs font-bold tabular-nums"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          현재 재고 {formatQty(node.current_stock)} {node.unit}
        </span>
      )}
    </>
  );

  return (
    <li>
      <div
        data-testid={modal ? "bom-modal-row" : undefined}
        className={`flex ${modal ? "w-full items-start rounded-[14px] border px-3" : mobilePresentation ? "items-start border-b last:border-b-0 pr-3" : tapToExpandName && nameExpanded ? "items-start" : "items-center"} transition-colors duration-150 hover:bg-[var(--c-s4)]`}
        style={{
          height: modal || mobilePresentation || tapToExpandName && nameExpanded ? undefined : ROW_H,
          minHeight: mobilePresentation ? 44 : ROW_H,
          ...(mobilePresentation ? { borderColor: LEGACY_COLORS.border } : {}),
          ...(modal ? { background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border } : {}),
        }}
      >
        {/* 가이드 레일 + 엘보 */}
        {(mobilePresentation ? rails.slice(-3) : rails).map((show, i) => (
          <Rail key={i} show={show} stretch={modal || mobilePresentation} mobile={mobilePresentation} />
        ))}
        <Connector isLast={isLast} stretch={modal || mobilePresentation} mobile={mobilePresentation} />

        {/* chevron(자식 보유) 또는 정렬용 spacer(잎) */}
        {hasKids ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={mobilePresentation ? "flex h-11 w-11 shrink-0 items-center justify-center rounded hover:brightness-110" : "flex h-5 w-5 shrink-0 items-center justify-center rounded hover:brightness-110"}
            style={{ color: LEGACY_COLORS.muted2 }}
            aria-expanded={open}
            aria-label={mobilePresentation ? `${node.item_name} ${open ? "접기" : "펼치기"}` : undefined}
            title={open ? "접기" : "펼치기"}
          >
            <ChevronRight
              className="h-3.5 w-3.5 transition-transform duration-150"
              style={{ transform: open ? "rotate(90deg)" : "none" }}
            />
          </button>
        ) : (
          <span className={mobilePresentation ? "w-2 shrink-0" : "h-5 w-5 shrink-0"} />
        )}

        {modal ? (
          <div className="ml-2 flex min-w-0 flex-1 flex-wrap items-start gap-x-4 gap-y-1 py-2 pr-4">
            <span
              className="min-w-[12rem] flex-1 break-words text-sm font-semibold leading-snug"
              style={{ color: LEGACY_COLORS.text }}
            >
              {node.item_name}
            </span>
            <span
              data-testid="bom-modal-row-meta"
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:ml-auto sm:w-auto sm:min-w-[18.25rem] sm:shrink-0 sm:grid-cols-[4.5rem_minmax(0,1fr)_3.5rem_8rem]"
            >
              <span className="flex min-w-0 justify-start">
                {deptBadge && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold leading-none"
                    style={{ color: deptBadge.color, background: deptBadge.bg }}
                  >
                    {deptBadge.label}
                  </span>
                )}
              </span>
              <span
                className="min-w-0 truncate whitespace-nowrap text-right font-mono text-[11px] tracking-tight"
                style={{ color: tint(LEGACY_COLORS.muted2, 70) }}
                title={node.mes_code ?? undefined}
              >
                {node.mes_code || ""}
              </span>
              <span
                className="text-center text-xs tabular-nums leading-none"
                style={{ color: qty > 1 ? LEGACY_COLORS.text : LEGACY_COLORS.muted2, fontWeight: qty > 1 ? 800 : 600 }}
              >
                {formatBomQuantity(qty, node.unit)}
              </span>
              <span className="text-right text-xs font-bold tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>
                현재 재고 {formatQty(node.current_stock)} {node.unit}
              </span>
            </span>
          </div>
        ) : mobilePresentation ? (
          <div className="min-w-0 flex-1 py-2">
            <div className="flex items-start gap-2">
            {tapToExpandName ? (
              <button
                type="button"
                disabled={stock}
                onClick={() => setNameExpanded((current) => !current)}
                className={`no-btn-inset flex min-h-11 min-w-0 flex-1 items-center text-left text-[15px] font-semibold leading-5 ${nameExpanded ? "[overflow-wrap:anywhere]" : "truncate"}`}
                style={{ color: LEGACY_COLORS.text }}
              >
                <span className={nameExpanded ? "[overflow-wrap:anywhere]" : "truncate"}>{node.item_name}</span>
              </button>
            ) : (
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere] text-[15px] font-semibold leading-5" style={{ color: LEGACY_COLORS.text }}>{node.item_name}</span>
            )}
            <span className="shrink-0 pt-3 text-sm font-semibold tabular-nums" style={{ color: LEGACY_COLORS.text }}>{formatBomQuantity(qty, node.unit)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">{metaChildren}</div>
          </div>
        ) : (
        tapToExpandName && nameExpanded ? (
          <button
            type="button"
            disabled={stock}
            onClick={() => setNameExpanded(false)}
            className="no-btn-inset ml-1 flex min-w-0 flex-1 flex-col gap-1 py-1.5 text-left"
          >
            <span
              className="break-words text-sm font-semibold leading-snug"
              style={{ color: LEGACY_COLORS.text }}
            >
              {node.item_name}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">{metaChildren}</span>
          </button>
        ) : (
          <>
            {tapToExpandName ? (
              <button
                type="button"
                onClick={() => setNameExpanded(true)}
                className="no-btn-inset ml-1 min-w-0 flex-1 truncate text-left text-sm font-semibold"
                style={{ color: LEGACY_COLORS.text }}
              >
                {node.item_name}
              </button>
            ) : (
              <span
                className="ml-1 min-w-0 flex-1 truncate text-sm font-semibold"
                style={{ color: LEGACY_COLORS.text }}
                title={node.item_name}
              >
                {node.item_name}
              </span>
            )}

            <span
              className={
                compact
                  ? "ml-auto flex shrink-0 items-center justify-end gap-x-2 pr-3"
                  : "ml-auto flex shrink-0 items-center justify-end gap-x-2 pr-4 lg:grid lg:w-[34rem] lg:gap-x-0 lg:[grid-template-columns:4rem_1fr_4rem_3rem_2.5rem] lg:[column-gap:1.5rem]"
              }
            >
              {metaChildren}
            </span>
          </>
        )
        )}
      </div>

      {open && hasKids && (
        <ul>
          {node.children.map((c, i) => (
            <BomTreeItem
              key={c.item_id}
              node={c}
              rails={[...rails, !isLast]}
              isLast={i === node.children.length - 1}
              compact={compact}
              tapToExpandName={tapToExpandName}
              stock={stock}
              modal={modal}
              mobilePresentation={mobilePresentation}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function ModalBomCode({ code }: { code: string | null }) {
  if (!code) return <span data-testid="bom-modal-code">-</span>;
  const parts = code.split("-");
  const processIndex = parts.length === 3 && parts.every(Boolean) ? 1 : -1;

  return (
    <span data-testid="bom-modal-code" title={code} className="font-mono text-sm">
      {processIndex === -1
        ? code
        : parts.map((part, index) => (
          <span
            key={`${part}-${index}`}
            className={index === processIndex ? "font-black" : undefined}
            style={index === processIndex ? { color: processTypeColor(part) } : undefined}
          >
            {index > 0 ? "-" : ""}{part}
          </span>
        ))}
    </span>
  );
}

function ModalBomTreeItem({ node, depth }: { node: BOMTreeNode; depth: number }) {
  const [open, setOpen] = useState(false);
  const hasKids = node.children.length > 0;

  return (
    <>
      <li
        data-testid="bom-modal-row"
        data-depth={depth}
        className="bom-modal-grid min-h-[52px] border-b bg-[var(--c-s1)] text-sm"
        style={{
          borderColor: LEGACY_COLORS.border,
        }}
      >
        <div className="flex h-11 w-11 items-center justify-center">
          {hasKids ? (
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              className="bom-modal-toggle"
              style={{ color: LEGACY_COLORS.muted2 }}
              aria-expanded={open}
              title={open ? "접기" : "펼치기"}
            >
              <ChevronRight
                className="h-4 w-4 transition-transform duration-150"
                style={{ transform: open ? "rotate(90deg)" : "none" }}
              />
            </button>
          ) : (
            <span aria-hidden className="h-11 w-11" />
          )}
        </div>
        <span
          data-testid="bom-modal-name-cell"
          className="min-w-0 break-words px-3 py-2 font-semibold leading-snug"
          style={{ color: LEGACY_COLORS.text, paddingLeft: 12 + depth * 24 }}
        >
          {node.item_name}
        </span>
        <span
          className="min-w-0 truncate px-3 font-mono text-sm"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          <ModalBomCode code={node.mes_code} />
        </span>
        <span className="text-center font-bold tabular-nums" style={{ color: LEGACY_COLORS.text }}>
          {formatBomQuantity(node.required_quantity, node.unit)}
        </span>
        <span className="pr-3 text-right font-bold tabular-nums" style={{ color: LEGACY_COLORS.muted }}>
          {formatQty(node.current_stock)} {node.unit}
        </span>
      </li>
      {open && hasKids && node.children.map((child) => (
        <ModalBomTreeItem key={child.item_id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

interface Props {
  itemId: string;
  open: boolean;
  /** 좁은 컨테이너(대시보드 상세 패널 등)용 — lg 고정 그리드를 끄고 패널 폭에 맞춘다. */
  compact?: boolean;
  /** 항목 2-1 (모바일 전용) — 이름 탭 풀네임 펼침. 데스크톱 호출처는 미전달(기본 false). */
  tapToExpandName?: boolean;
  /** 팝업 본문용 — 부모 식별, 현재 재고, 재시도를 표시한다. */
  modal?: boolean;
  /** 주간보고 모바일 시트용 — 현재 재고·생산 가능 수량과 구성품 재고를 함께 표시한다. */
  mobileDetail?: boolean;
  /** 표시만 변경하는 모바일 전용 옵션. 데스크톱과 기존 호출의 출력은 유지한다. */
  mobilePresentation?: boolean;
}

export function useBomTree(itemId: string, open: boolean, departmentOrder?: "desc") {
  const revision = useRealtimeRevision();
  const [tree, setTree] = useState<BOMTreeNode | false | null>(null);
  const [treeItemId, setTreeItemId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const loadedItemRef = useRef<string | null>(null);
  const loadedRequestRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const requestKey = `${itemId}:${departmentOrder ?? "default"}:${revision ?? "initial"}:${requestVersion}`;
    if (!open || loadedRequestRef.current === requestKey) return;
    const refreshingCurrentItem = loadedItemRef.current === itemId;
    setError(false);
    if (!refreshingCurrentItem) {
      loadedItemRef.current = null;
      loadedRequestRef.current = null;
      setTree(null);
    }
    api
      .getBOMTree(itemId, departmentOrder ? { departmentOrder } : undefined)
      .then((nextTree) => {
        if (!active) return;
        loadedItemRef.current = itemId;
        loadedRequestRef.current = requestKey;
        setError(false);
        setTreeItemId(itemId);
        setTree(nextTree);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        if (!refreshingCurrentItem) {
          setTreeItemId(itemId);
          setTree(false);
        }
      });
    return () => {
      active = false;
    };
  }, [open, itemId, departmentOrder, requestVersion, revision]);

  return {
    tree: treeItemId === itemId ? tree : null,
    error: treeItemId === itemId && error,
    refreshError: error && tree && loadedItemRef.current === itemId ? "하위 구성을 갱신하지 못했습니다." : null,
    retry: () => {
      setError(false);
      if (loadedItemRef.current !== itemId) setTree(null);
      setRequestVersion((version) => version + 1);
    },
  };
}

export function getBomBranchItemIds(tree: BOMTreeNode): string[] {
  const itemIds: string[] = [];
  const visit = (node: BOMTreeNode) => {
    if (node.children.length === 0) return;
    itemIds.push(node.item_id);
    node.children.forEach(visit);
  };
  tree.children.forEach(visit);
  return itemIds;
}

type ModalBomTreeProps = {
  tree: BOMTreeNode;
  expandedItemIds: ReadonlySet<string>;
  onToggleItem: (itemId: string) => void;
  showStockBreakdown?: boolean;
  mobilePresentation?: boolean;
};

function hasSelectedRowText(row: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return false;

  const range = selection.getRangeAt(0);
  return row.contains(range.startContainer) || row.contains(range.endContainer);
}

function formatModalBomQuantity(quantity: number, unit: string): string {
  return `${formatQty(quantity, { maximumFractionDigits: 2, trimTrailingZeros: true })} ${unit}`;
}

function ModalBomTreeRow({ node, depth, expandedItemIds, onToggleItem, showStockBreakdown = false, mobilePresentation = false }: {
  node: BOMTreeNode;
  depth: number;
  expandedItemIds: ReadonlySet<string>;
  onToggleItem: (itemId: string) => void;
  showStockBreakdown?: boolean;
  mobilePresentation?: boolean;
}) {
  const gridClass = showStockBreakdown ? "bom-capacity-stock-grid" : "bom-detail-modal-grid";
  const hasKids = node.children.length > 0;
  const open = expandedItemIds.has(node.item_id);
  const isCapacityIgnoredZeroStock = node.production_capacity_ignored === true && node.current_stock === 0;
  const isZeroStockWarning = node.current_stock === 0 && !isCapacityIgnoredZeroStock;
  const depthClass = !isZeroStockWarning && depth > 0
    ? ` bom-tree-depth bom-tree-depth-${Math.min(depth, MODAL_TREE_MAX_VISIBLE_DEPTH)}`
    : "";
  const background = isZeroStockWarning
    ? tint(LEGACY_COLORS.red, 15, "var(--c-s1)")
    : depth === 0
      ? LEGACY_COLORS.s1
      : undefined;
  const cells = (
    <>
      <span
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center"
        style={{
          color: LEGACY_COLORS.muted2,
          transform: `translateX(${depth * MODAL_TREE_DEPTH_INDENT_PX + MODAL_TREE_CHEVRON_TEXT_OFFSET_PX}px)`,
        }}
      >
        {hasKids && <ChevronRight
          className="h-4 w-4 transition-transform duration-150"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        />}
      </span>
      <span
        data-testid="bom-modal-name-cell"
        className="min-w-0 cursor-text select-text break-words px-3 py-2 font-semibold leading-snug"
        style={{ color: LEGACY_COLORS.text, paddingLeft: 12 + depth * MODAL_TREE_DEPTH_INDENT_PX }}
      >
        {node.item_name}
      </span>
      <span className="min-w-0 cursor-text select-text truncate px-3 font-mono text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
        <ModalBomCode code={node.mes_code} />
      </span>
      <span className="text-center font-bold tabular-nums" style={{ color: LEGACY_COLORS.text }}>
        {formatModalBomQuantity(node.required_quantity, node.unit)}
      </span>
      {showStockBreakdown && <>
        {/* 요청한 보조 재고 수치는 기존 14px보다 1pt 작게 표시한다. */}
        <span className="pr-3 text-right tabular-nums" style={{ color: LEGACY_COLORS.muted, fontSize: "calc(0.875rem - 1pt)" }}>
          {node.warehouse_stock == null ? "—" : `${formatQty(node.warehouse_stock)} ${node.unit}`}
        </span>
        <span className="pr-3 text-right tabular-nums" style={{ color: LEGACY_COLORS.muted, fontSize: "calc(0.875rem - 1pt)" }}>
          {node.department_stock == null ? "—" : `${formatQty(node.department_stock)} ${node.unit}`}
        </span>
      </>}
      <span
        className={`pr-3 text-right font-bold tabular-nums${isCapacityIgnoredZeroStock ? " line-through" : ""}`}
        style={{ color: node.current_stock === 0 ? LEGACY_COLORS.red : showStockBreakdown ? LEGACY_COLORS.text : LEGACY_COLORS.muted }}
      >
        {formatQty(node.current_stock)} {node.unit}
      </span>
    </>
  );

  return (
    <>
      <li data-testid="bom-modal-row" data-depth={depth}>
        {mobilePresentation ? (
          <div className="min-w-0 border-b py-3 pr-3" style={{ borderColor: LEGACY_COLORS.border, background, paddingLeft: 12 + Math.min(depth, 3) * 12 }}>
            <div className="flex min-w-0 items-start gap-1">
              {hasKids && <button
                type="button"
                onClick={() => onToggleItem(node.item_id)}
                aria-expanded={open}
                aria-label={`${node.item_name} ${open ? "접기" : "펼치기"}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                <ChevronRight className="h-4 w-4" style={{ transform: open ? "rotate(90deg)" : "none" }} />
              </button>}
              <div className="min-w-0 flex-1 py-2">
                <div className="text-sm font-bold leading-snug [overflow-wrap:anywhere]" style={{ color: LEGACY_COLORS.text }}>{node.item_name}</div>
                <div className="mt-1 break-all text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{node.mes_code}</div>
              </div>
            </div>
            <dl className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              <div><dt>현재 총 재고</dt><dd className={`mt-0.5 text-base font-semibold tabular-nums [overflow-wrap:anywhere]${isCapacityIgnoredZeroStock ? " line-through" : ""}`} style={{ color: node.current_stock === 0 ? LEGACY_COLORS.red : LEGACY_COLORS.text }}>{formatQty(node.current_stock)} {node.unit}</dd></div>
            </dl>
          </div>
        ) : hasKids ? (
          <div
            role="button"
            tabIndex={0}
            onClick={(event) => {
              if (!hasSelectedRowText(event.currentTarget)) onToggleItem(node.item_id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onToggleItem(node.item_id);
              }
            }}
            className={`bom-modal-grid ${gridClass} min-h-[52px] w-full cursor-pointer border-b text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)] focus-visible:outline-offset-[-2px]${depthClass}`}
            style={{ borderColor: LEGACY_COLORS.border, background }}
            aria-expanded={open}
          >
            {cells}
          </div>
        ) : (
          <div
            className={`bom-modal-grid ${gridClass} min-h-[52px] border-b text-sm${depthClass}`}
            style={{ borderColor: LEGACY_COLORS.border, background }}
          >
            {cells}
          </div>
        )}
      </li>
      {open && hasKids && node.children.map((child) => (
        <ModalBomTreeRow
          key={child.item_id}
          node={child}
          depth={depth + 1}
          showStockBreakdown={showStockBreakdown}
          mobilePresentation={mobilePresentation}
          expandedItemIds={expandedItemIds}
          onToggleItem={onToggleItem}
        />
      ))}
    </>
  );
}

export function ModalBomTree({ tree, expandedItemIds, onToggleItem, showStockBreakdown = false, mobilePresentation = false }: ModalBomTreeProps) {
  return (
    <div
      data-testid="bom-modal-tree-scroll"
      className={mobilePresentation ? "min-h-0 min-w-0 flex-1 overflow-y-auto" : `min-h-0 flex-1 overflow-y-scroll${showStockBreakdown ? " overflow-x-auto" : ""}`}
    >
      <div
        data-testid="bom-modal-tree-table"
        className={mobilePresentation ? "min-h-full min-w-0 overflow-clip rounded-[14px] border" : `min-h-full overflow-clip rounded-[18px] border${showStockBreakdown ? " min-w-[820px]" : ""}`}
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        {!mobilePresentation && <div
          data-testid="bom-modal-grid-header"
          className={`bom-modal-grid ${showStockBreakdown ? "bom-capacity-stock-grid text-sm" : "bom-detail-modal-grid text-xs"} sticky top-0 z-10 min-h-11 border-b font-bold`}
          style={{
            background: "var(--c-popup-bg)",
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.muted2,
          }}
        >
          <span aria-hidden />
          <span className="px-3">구성품명</span>
          <span className="px-3">품목코드</span>
          <span className="text-center">소요량</span>
          {showStockBreakdown && <>
            <span className="pr-3 text-right">창고 재고</span>
            <span className="pr-3 text-right">부서 재고</span>
          </>}
          <span className="pr-3 text-right">{showStockBreakdown ? "현재 총 재고" : "현재 재고"}</span>
        </div>}
        <ul>
          {tree.children.map((child) => (
            <ModalBomTreeRow
              key={child.item_id}
              node={child}
              depth={0}
              showStockBreakdown={showStockBreakdown}
              mobilePresentation={mobilePresentation}
              expandedItemIds={expandedItemIds}
              onToggleItem={onToggleItem}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

export function BomSubExpander({
  itemId,
  open,
  compact = false,
  tapToExpandName = false,
  modal = false,
  mobileDetail = false,
  mobilePresentation = false,
}: Props) {
  const { tree, retry, refreshError } = useBomTree(itemId, open);

  if (!open) return null;

  return (
    <div
      className={
        modal
          ? ""
          : compact
          ? "overflow-hidden rounded-[14px] border"
          : "mb-2 ml-12 mr-4 overflow-hidden rounded-xl border"
      }
      style={modal ? undefined : { borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
    >
      {/* 맥락 헤더 — 읽기전용 명시 */}
      {!modal && <div
        className="flex items-center justify-between border-b px-3 py-1.5"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <span
          className={mobilePresentation ? "text-xs font-medium" : "text-[11px] font-bold tracking-wide"}
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          하위 구성
        </span>
        <span
          className={mobilePresentation ? "rounded-full px-1.5 py-0.5 text-xs font-medium" : "rounded-full px-1.5 py-0.5 text-[10px] font-bold"}
          style={{ color: LEGACY_COLORS.muted2, background: tint(LEGACY_COLORS.muted2, 12) }}
        >
          읽기 전용
        </span>
      </div>}

      {mobileDetail && tree && <div
        data-testid="bom-mobile-detail-summary"
        className="flex flex-wrap gap-2 border-b px-3 py-3"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <span
          className="rounded-full px-2.5 py-1 text-xs font-bold tabular-nums"
          style={{
            color: tree.current_stock === 0 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2,
            background: LEGACY_COLORS.s1,
          }}
        >
          현재 재고 {formatQty(tree.current_stock)} {tree.unit}
        </span>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-bold tabular-nums"
          style={{
            color: tree.additional_producible_quantity && tree.additional_producible_quantity > 0
              ? LEGACY_COLORS.purple
              : LEGACY_COLORS.muted2,
            background: tree.additional_producible_quantity && tree.additional_producible_quantity > 0
              ? tint(LEGACY_COLORS.purple, 12)
              : LEGACY_COLORS.s1,
          }}
        >
          {typeof tree.additional_producible_quantity === "number"
            ? `추가 생산 가능 ${formatQty(tree.additional_producible_quantity)} ${tree.unit}`
            : "추가 생산 가능 계산 불가"}
        </span>
      </div>}

      {(mobileDetail || mobilePresentation) && refreshError && <ReadFailure message={refreshError} onRetry={retry} refresh />}
      {tree === null && (mobileDetail || mobilePresentation) ? <ReadLoading label="BOM 구성 불러오는 중" skeleton={<MobileBomSkeleton />} /> : tree === null && (
        <div
          className={modal ? "rounded-[18px] border px-4 py-8 text-center text-sm" : "px-3 py-3 text-xs"}
          style={modal
            ? { color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }
            : { color: LEGACY_COLORS.muted2 }}
        >
          불러오는 중…
        </div>
      )}
      {tree === false && (
        <div
          className={modal ? "rounded-[18px] border px-4 py-5 text-center text-sm" : "px-3 py-3 text-xs"}
          style={modal
            ? { color: LEGACY_COLORS.red, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }
            : { color: LEGACY_COLORS.red }}
        >
          하위 구성을 불러오지 못했습니다.
        </div>
      )}
      {(modal || mobileDetail) && tree === false && <button
        type="button"
        onClick={retry}
        className="mt-3 min-h-11 rounded-[10px] border px-4 py-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
        style={{ borderColor: LEGACY_COLORS.red, color: LEGACY_COLORS.red, background: LEGACY_COLORS.s2 }}
      >다시 시도</button>}
      {tree && <>
        {modal && <div
          data-testid="bom-tree-parent-header"
          className="mb-3 flex items-start gap-3 rounded-[18px] border px-4 py-3"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
          }}
        >
          <span
            className="mt-0.5 flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-black"
            style={{ color: LEGACY_COLORS.blue, background: tint(LEGACY_COLORS.blue, 12) }}
          >
            <GitBranch className="h-4 w-4" />
            BOM
          </span>
          <div className="min-w-0">
            <p className="break-words text-base font-black" style={{ color: LEGACY_COLORS.text }}>
              {tree.item_name}
            </p>
            <p className="mt-1 font-mono text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {tree.mes_code}
            </p>
          </div>
        </div>}
        {tree.children.length === 0 ? (
          <div
            className={modal ? "rounded-[18px] border px-4 py-8 text-center text-sm" : "px-3 py-3 text-xs"}
            style={modal
              ? { color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }
              : { color: LEGACY_COLORS.muted2 }}
          >
            하위 품목이 없습니다.
          </div>
        ) : modal ? (
          <div
            data-testid="bom-modal-tree-list"
            className="w-full overflow-clip rounded-[18px] border"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <div
              data-testid="bom-modal-grid-header"
              className="bom-modal-grid sticky top-0 z-10 min-h-11 border-b text-xs font-bold"
              style={{
                background: "var(--c-popup-bg)",
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.muted2,
              }}
            >
              <span aria-hidden />
              <span className="px-3">구성품명</span>
              <span className="px-3">품목코드</span>
              <span className="text-center">소요량</span>
              <span className="pr-3 text-right">현재재고</span>
            </div>
            <ul>
              {tree.children.map((child) => <ModalBomTreeItem
                key={child.item_id}
                node={child}
                depth={0}
              />)}
            </ul>
          </div>
        ) : (
          <ul className={`py-1${mobileDetail || mobilePresentation ? ` ${dataRevealClassName}` : ""}`}>
            {tree.children.map((child, index) => <BomTreeItem
              key={child.item_id}
              node={child}
              rails={[]}
              isLast={index === tree.children.length - 1}
              compact={compact}
              tapToExpandName={tapToExpandName}
              stock={mobileDetail}
              mobilePresentation={mobilePresentation}
            />)}
          </ul>
        )}
      </>}
    </div>
  );
}

/** Preview only row geometry; no placeholder is presented as a real component. */
export function MobileBomSkeleton() {
  return <div className="py-1">
    {Array.from({ length: 4 }, (_, index) => <div key={index} className="flex min-h-11 items-center gap-3 border-b px-3 py-2 last:border-b-0" style={{ borderColor: LEGACY_COLORS.border }}>
      <SkeletonBlock className="h-4 w-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1"><SkeletonBlock className="h-4 w-2/3" /><SkeletonBlock className="h-3 w-1/3" /></div>
      <SkeletonBlock className="h-4 w-12 shrink-0" />
    </div>)}
  </div>;
}
