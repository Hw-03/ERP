"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, GitBranch } from "lucide-react";
import { api } from "@/lib/api";
import type { BOMTreeNode } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import { mesCodeDeptBadge } from "@/lib/mes/process";
import { useDeptColorLookup } from "../DepartmentsContext";

const ROW_H = 34; // 일정한 행 높이(px) — 연결선이 정확히 이어지려면 고정
const GUIDE_W = 22; // 가이드(레일/엘보) 컬럼 폭(px)
const RAIL = tint(LEGACY_COLORS.muted2, 30); // depth 무관 단일 중립 연결선색
const RAIL_W = 1.5;

/** 조상 컬럼: 세로선이 계속 이어지면 풀높이 라인, 아니면 빈 칸 */
function Rail({ show, stretch = false }: { show: boolean; stretch?: boolean }) {
  return (
    <span
      data-testid={stretch ? "bom-modal-rail" : undefined}
      className={`relative shrink-0${stretch ? " self-stretch" : ""}`}
      style={{ width: GUIDE_W, height: stretch ? undefined : ROW_H }}
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
function Connector({ isLast, stretch = false }: { isLast: boolean; stretch?: boolean }) {
  return (
    <span
      data-testid={stretch ? "bom-modal-connector" : undefined}
      className={`relative shrink-0${stretch ? " self-stretch" : ""}`}
      style={{ width: GUIDE_W, height: stretch ? undefined : ROW_H }}
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
}: {
  node: BOMTreeNode;
  rails: boolean[];
  isLast: boolean;
  compact?: boolean;
  /** 항목 2-1 (모바일 전용) — 이름 행을 탭하면 풀네임 펼침. 데스크톱 호출처는 미전달(기본 false). */
  tapToExpandName?: boolean;
  stock?: boolean;
  modal?: boolean;
}) {
  const getDeptColor = useDeptColorLookup();
  const [open, setOpen] = useState(false);
  // 항목 2-1 — 이름 탭 펼침 상태(모바일 전용). tapToExpandName=false 면 항상 false 라 데스크톱 영향 없음.
  const [nameExpanded, setNameExpanded] = useState(stock && !modal);
  const hasKids = node.children.length > 0;
  const deptBadge = node.mes_code ? mesCodeDeptBadge(node.mes_code, getDeptColor) : null;
  const qty = node.required_quantity;

  // 우측 메타(부서 · 코드 · ×수량) — 1줄(collapsed)·펼침(reflow) 양쪽에서 동일하게 재사용.
  const metaChildren = (
    <>
      {/* 부서 — 색 = 1차 앵커. 좌정렬 */}
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

      {/* 코드 — 보조 모노스페이스. 우정렬로 우변 기준선 고정 */}
      <span
        className="min-w-0 truncate whitespace-nowrap text-right font-mono text-[11px] tracking-tight"
        style={{ color: tint(LEGACY_COLORS.muted2, 70) }}
        title={node.mes_code ?? undefined}
      >
        {node.mes_code || ""}
      </span>

      {/* 수량 — 실행후 자리(col4)에 가운데 정렬 강조. ×는 약한 접두 */}
      <span
        className="text-center text-xs tabular-nums leading-none"
        style={{ gridColumn: "4", color: qty > 1 ? LEGACY_COLORS.text : LEGACY_COLORS.muted2, fontWeight: qty > 1 ? 800 : 600 }}
      >
        <span className="mr-px text-[10px] font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>×</span>
        {qty}
      </span>
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
        className={`flex ${modal ? "w-full items-start rounded-[14px] border px-3" : tapToExpandName && nameExpanded ? "items-start" : "items-center"} transition-colors duration-150 hover:bg-[var(--c-s4)]`}
        style={{
          height: modal || tapToExpandName && nameExpanded ? undefined : ROW_H,
          minHeight: ROW_H,
          ...(modal ? { background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border } : {}),
        }}
      >
        {/* 가이드 레일 + 엘보 */}
        {rails.map((show, i) => (
          <Rail key={i} show={show} stretch={modal} />
        ))}
        <Connector isLast={isLast} stretch={modal} />

        {/* chevron(자식 보유) 또는 정렬용 spacer(잎) */}
        {hasKids ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:brightness-110"
            style={{ color: LEGACY_COLORS.muted2 }}
            aria-expanded={open}
            title={open ? "접기" : "펼치기"}
          >
            <ChevronRight
              className="h-3.5 w-3.5 transition-transform duration-150"
              style={{ transform: open ? "rotate(90deg)" : "none" }}
            />
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
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
                <span className="mr-px text-[10px] font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>×</span>
                {qty}
              </span>
              <span className="text-right text-xs font-bold tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>
                현재 재고 {formatQty(node.current_stock)} {node.unit}
              </span>
            </span>
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
            />
          ))}
        </ul>
      )}
    </li>
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
}

export function BomSubExpander({ itemId, open, compact = false, tapToExpandName = false, modal = false }: Props) {
  const [tree, setTree] = useState<BOMTreeNode | false | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const loadedItemRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!open || loadedItemRef.current === itemId) return;
    setTree(null);
    api
      .getBOMTree(itemId)
      .then((nextTree) => {
        if (!active) return;
        loadedItemRef.current = itemId;
        setTree(nextTree);
      })
      .catch(() => {
        if (!active) return;
        setTree(false);
      });
    return () => {
      active = false;
    };
  }, [open, itemId, requestVersion]);

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
          className="text-[11px] font-bold tracking-wide"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          하위 구성
        </span>
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
          style={{ color: LEGACY_COLORS.muted2, background: tint(LEGACY_COLORS.muted2, 12) }}
        >
          읽기 전용
        </span>
      </div>}

      {tree === null && (
        <div className="px-3 py-3 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          불러오는 중…
        </div>
      )}
      {tree === false && (
        <div className="px-3 py-3 text-xs" style={{ color: LEGACY_COLORS.red }}>
          하위 구성을 불러오지 못했습니다.
        </div>
      )}
      {modal && tree === false && <button
        type="button"
        onClick={() => {
          setTree(null);
          setRequestVersion((version) => version + 1);
        }}
        className="mb-4 rounded-lg border px-3 py-2 text-sm font-bold"
        style={{ borderColor: LEGACY_COLORS.red, color: LEGACY_COLORS.red }}
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
            className="mt-0.5 flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black"
            style={{ color: LEGACY_COLORS.blue, background: tint(LEGACY_COLORS.blue, 12) }}
          >
            <GitBranch className="h-3 w-3" />
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
          <div className="px-3 py-3 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            하위 품목이 없습니다.
          </div>
        ) : modal ? (
          <div
            data-testid="bom-modal-tree-list"
            className="w-full overflow-hidden rounded-[18px] border p-2"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <ul className="space-y-1">
              {tree.children.map((child, index) => <BomTreeItem
                key={child.item_id}
                node={child}
                rails={[]}
                isLast={index === tree.children.length - 1}
                compact={compact}
                tapToExpandName={modal || tapToExpandName}
                stock={modal}
                modal={modal}
              />)}
            </ul>
          </div>
        ) : (
          <ul className="py-1">
            {tree.children.map((child, index) => <BomTreeItem
              key={child.item_id}
              node={child}
              rails={[]}
              isLast={index === tree.children.length - 1}
              compact={compact}
              tapToExpandName={tapToExpandName}
              stock={false}
            />)}
          </ul>
        )}
      </>}
    </div>
  );
}
