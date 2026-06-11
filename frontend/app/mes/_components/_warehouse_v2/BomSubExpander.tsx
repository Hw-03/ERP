"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import type { BOMTreeNode } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { mesCodeDeptBadge } from "@/lib/mes/process";
import { useDeptColorLookup } from "../DepartmentsContext";

const ROW_H = 34; // 일정한 행 높이(px) — 연결선이 정확히 이어지려면 고정
const GUIDE_W = 22; // 가이드(레일/엘보) 컬럼 폭(px)
const RAIL = tint(LEGACY_COLORS.muted2, 30); // depth 무관 단일 중립 연결선색
const RAIL_W = 1.5;

/** 조상 컬럼: 세로선이 계속 이어지면 풀높이 라인, 아니면 빈 칸 */
function Rail({ show }: { show: boolean }) {
  return (
    <span className="relative shrink-0" style={{ width: GUIDE_W, height: ROW_H }}>
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
function Connector({ isLast }: { isLast: boolean }) {
  return (
    <span className="relative shrink-0" style={{ width: GUIDE_W, height: ROW_H }}>
      {/* 세로: top → 중앙 (위로 연결) */}
      <span
        className="absolute left-1/2 -translate-x-1/2"
        style={{ top: 0, height: ROW_H / 2, width: RAIL_W, background: RAIL }}
      />
      {/* 세로: 중앙 → bottom (막내가 아니면 다음 형제로 계속) */}
      {!isLast && (
        <span
          className="absolute left-1/2 -translate-x-1/2"
          style={{ top: ROW_H / 2, bottom: 0, width: RAIL_W, background: RAIL }}
        />
      )}
      {/* 가로: 중앙 → 우측 끝 */}
      <span
        className="absolute -translate-y-1/2"
        style={{ top: ROW_H / 2, left: "50%", right: 0, height: RAIL_W, background: RAIL }}
      />
    </span>
  );
}

function BomTreeItem({
  node,
  rails,
  isLast,
}: {
  node: BOMTreeNode;
  rails: boolean[];
  isLast: boolean;
}) {
  const getDeptColor = useDeptColorLookup();
  const [open, setOpen] = useState(false);
  const hasKids = node.children.length > 0;
  const deptBadge = node.mes_code ? mesCodeDeptBadge(node.mes_code, getDeptColor) : null;
  const qty = node.required_quantity;

  return (
    <li>
      <div
        className="flex items-center transition-colors duration-150"
        style={{ height: ROW_H, background: "transparent" }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background = LEGACY_COLORS.s4)
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background = "transparent")
        }
      >
        {/* 가이드 레일 + 엘보 */}
        {rails.map((show, i) => (
          <Rail key={i} show={show} />
        ))}
        <Connector isLast={isLast} />

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

        {/* 품목명 */}
        <span
          className="ml-1 min-w-0 flex-1 truncate text-sm font-semibold"
          style={{ color: LEGACY_COLORS.text }}
          title={node.item_name}
        >
          {node.item_name}
        </span>

        {/* 우측 메타: 부서 · 코드 · 수량 — 부모 행 컬럼에 맞춰 정렬.
            col1=부서(분류) · col2=코드(+10 우측끝) · col3=빈(가능재고) · col4=수량(실행후) · col5=빈(삭제) */}
        {/* 모바일: 부서·코드·수량을 컴팩트 flex로(고정 34rem 제거 → 우측 ×수량 잘림 방지).
            데스크톱(lg): 부모 7열 행과 정렬되도록 34rem 5열 그리드 복원. */}
        <span
          className="ml-auto flex shrink-0 items-center justify-end gap-x-2 pr-4 lg:grid lg:w-[34rem] lg:gap-x-0 lg:[grid-template-columns:4rem_1fr_4rem_3rem_2.5rem] lg:[column-gap:1.5rem]"
        >
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

          {/* 수량 — 실행후 자리(col4)에 가운데 정렬 강조. ×는 약한 접두, 숫자가 단독으로 점등 */}
          <span
            className="text-center text-xs tabular-nums leading-none"
            style={{ gridColumn: "4", color: qty > 1 ? LEGACY_COLORS.text : LEGACY_COLORS.muted2, fontWeight: qty > 1 ? 800 : 600 }}
          >
            <span className="mr-px text-[10px] font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>×</span>
            {qty}
          </span>
        </span>
      </div>

      {open && hasKids && (
        <ul>
          {node.children.map((c, i) => (
            <BomTreeItem
              key={c.item_id}
              node={c}
              rails={[...rails, !isLast]}
              isLast={i === node.children.length - 1}
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
}

export function BomSubExpander({ itemId, open }: Props) {
  const [tree, setTree] = useState<BOMTreeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || tree) return;
    setLoading(true);
    setError(false);
    api
      .getBOMTree(itemId)
      .then(setTree)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open, itemId, tree]);

  if (!open) return null;

  return (
    <div
      className="mb-2 ml-12 mr-4 overflow-hidden rounded-xl border"
      style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
    >
      {/* 맥락 헤더 — 읽기전용 명시 */}
      <div
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
      </div>

      {loading && (
        <div className="px-3 py-3 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          불러오는 중…
        </div>
      )}
      {error && !loading && (
        <div className="px-3 py-3 text-xs" style={{ color: LEGACY_COLORS.red }}>
          하위 구성을 불러오지 못했습니다.
        </div>
      )}
      {!loading && !error && tree && tree.children.length > 0 && (
        <ul className="py-1">
          {tree.children.map((c, i) => (
            <BomTreeItem
              key={c.item_id}
              node={c}
              rails={[]}
              isLast={i === tree.children.length - 1}
            />
          ))}
        </ul>
      )}
      {!loading && !error && tree && tree.children.length === 0 && (
        <div className="px-3 py-3 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          하위 품목이 없습니다.
        </div>
      )}
    </div>
  );
}
