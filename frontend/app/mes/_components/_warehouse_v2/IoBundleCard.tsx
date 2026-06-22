"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Layers, Trash2 } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import type { IoBundle, IoLine, IoSubType, Item } from "./types";
import { IoLineRow, isOutgoing, expectedAfter } from "./IoLineRow";
import { formatQty } from "@/lib/mes/format";

interface Props {
  bundle: IoBundle;
  subType: IoSubType;
  itemMap: Map<string, Item>;
  getAvailable: (line: IoLine) => number | null;
  onToggleLine: (lineId: string) => void;
  onQuantityChange: (lineId: string, quantity: number, shortage: number) => void;
  onBundleQuantityChange?: (quantity: number) => void;
  onRemoveLine: (lineId: string) => void;
  onRemoveBundle: () => void;
  /** 항목 7 — 부족 라인 '창고에서 가져오기' 선택 활성 여부(생산 4단계에서만 true). */
  pullEnabled?: boolean;
  pullSelected?: ReadonlySet<string>;
  onTogglePull?: (lineId: string) => void;
}

export function IoBundleCard({
  bundle,
  subType,
  itemMap,
  getAvailable,
  onToggleLine,
  onQuantityChange,
  onBundleQuantityChange,
  onRemoveLine,
  onRemoveBundle,
  pullEnabled,
  pullSelected,
  onTogglePull,
}: Props) {
  const tone = LEGACY_COLORS.blue;
  const linePullSelectable = (line: IoLine) =>
    !!pullEnabled && line.included && line.shortage > 0;
  // React Hook 규칙: 조건부 early return 전에 호출해야 하므로 항상 선언.
  // 단품 분기에서는 사용되지 않지만 hook 호출 순서를 안정시키려는 용도.
  const [collapsed, setCollapsed] = useState(true);

  // 단일 라인 비-BOM 묶음(낱개 manual + "이 품목만" direct_item) 은 헤더/카드 래퍼 생략하고
  // IoLineRow 만 단독 노출. trash 는 forceShowRemove 로 항상 보이게 하고 onRemoveBundle 연결.
  if (bundle.source_kind !== "bom_parent" && bundle.lines.length === 1) {
    const line = bundle.lines[0];
    return (
      <IoLineRow
        line={line}
        subType={subType}
        isChild={false}
        item={itemMap.get(line.item_id)}
        available={getAvailable(line)}
        forceShowRemove
        pullSelectable={linePullSelectable(line)}
        pullSelected={pullSelected?.has(line.line_id)}
        onTogglePull={onTogglePull ? () => onTogglePull(line.line_id) : undefined}
        onToggle={() => onToggleLine(line.line_id)}
        onQuantityChange={(quantity, shortage) => onQuantityChange(line.line_id, quantity, shortage)}
        onRemove={onRemoveBundle}
      />
    );
  }

  // BOM 상위 헤더에 품목 코드 표시 — itemMap 우선, 없으면 번들이 들고 온 source_mes_code 폴백.
  const bundleCode =
    (bundle.source_item_id ? itemMap.get(bundle.source_item_id)?.mes_code : null) ??
    bundle.source_mes_code ??
    null;
  const included = bundle.lines.filter((line) => line.included);
  const excluded = bundle.lines.length - included.length;
  const autoCount = bundle.lines.filter((line) => line.origin === "bom_auto").length;
  const hasDirectLine = bundle.lines.some((line) => line.origin === "direct");
  const directParentLine =
    bundle.source_kind === "bom_parent"
      ? bundle.lines.find((line) => line.origin === "direct")
      : undefined;
  const parentAvailable = directParentLine ? getAvailable(directParentLine) : null;
  const parentExpected = directParentLine
    ? expectedAfter(directParentLine, parentAvailable)
    : null;
  const parentExpectedColor =
    parentExpected === null
      ? LEGACY_COLORS.muted2
      : parentExpected < 0
      ? LEGACY_COLORS.red
      : parentExpected === 0
      ? LEGACY_COLORS.yellow
      : LEGACY_COLORS.green;
  // BOM 묶음 — 부모 라인이 있으면 부모 라인 수량을, 없으면 bundle.quantity 를 stepper 로 노출.
  const showBundleQtyStepper =
    bundle.source_kind === "bom_parent" &&
    (directParentLine != null || !!onBundleQuantityChange);
  const compositionLabel = (() => {
    if (bundle.source_kind === "bom_parent" || autoCount > 0) {
      return hasDirectLine
        ? `BOM 자동 전개 · 상위 1 + 하위 ${autoCount}`
        : `BOM 자동 전개 · 자재 ${autoCount}`;
    }
    return "단품";
  })();
  const visibleLines = directParentLine
    ? bundle.lines.filter((line) => line.line_id !== directParentLine.line_id)
    : bundle.lines;
  const isCollapsible = visibleLines.length > 0;
  const stepperQty = directParentLine
    ? Number(directParentLine.quantity) || 0
    : Number(bundle.quantity) || 0;
  function applyStepperQty(next: number) {
    const safe = Math.max(0, next);
    if (directParentLine) {
      // 부모 라인의 onQuantityChange 가 이미 bom_auto 자식들에게 bom_expected
      // 비율로 cascade 시키므로 그 경로를 그대로 재사용한다.
      onQuantityChange(directParentLine.line_id, safe, 0);
    } else if (onBundleQuantityChange) {
      onBundleQuantityChange(safe);
    }
  }
  function stepBundle(delta: number) {
    applyStepperQty(stepperQty + delta);
  }
  function setBundleFromInput(value: string) {
    const next = Number(value);
    applyStepperQty(Number.isFinite(next) ? next : 0);
  }

  return (
    <article
      className="rounded-[18px] border-2 p-4"
      style={{
        background: tint(tone, 6),
        borderColor: tint(tone, 40),
      }}
    >
      <div
        // 항목 14 — 모바일: 휴지통 우상단 분리 + 가능재고/실행후는 아래 행. 데스크톱(lg)은 기존 한 줄 배치.
        className="relative mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between lg:gap-3"
        onClick={() => { if (isCollapsible) setCollapsed((v) => !v); }}
        style={{ cursor: isCollapsible ? "pointer" : "default" }}
        role={isCollapsible ? "button" : undefined}
        aria-expanded={isCollapsible ? !collapsed : undefined}
      >
        <div className="min-w-0 pr-12 lg:pr-0">
          <div
            className="flex min-w-0 items-center gap-2 text-left"
            title={isCollapsible ? (collapsed ? "펼치기" : "접기") : undefined}
          >
            <Layers className="h-5 w-5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
            <h3 className="truncate text-base font-black" style={{ color: LEGACY_COLORS.text }}>
              {bundle.title}
            </h3>
            {bundleCode && (
              <span
                className="shrink-0 truncate text-[11px] font-semibold"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                {bundleCode}
              </span>
            )}
            {isCollapsible &&
              (collapsed ? (
                <ChevronDown className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
              ) : (
                <ChevronUp className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
              ))}
          </div>
          <div
            className="mt-1 flex flex-wrap items-center gap-1 text-xs font-semibold"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {showBundleQtyStepper ? (
              <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <span className="text-[10px] font-bold uppercase tracking-[1.5px]">
                  기준 수량
                </span>
                <button
                  type="button"
                  onClick={() => stepBundle(-10)}
                  className="rounded-[8px] border px-2.5 py-1.5 text-xs font-black transition-colors hover:brightness-110 lg:px-1.5 lg:py-0.5 lg:text-[11px] disabled:opacity-40"
                  style={{
                    background: tint(LEGACY_COLORS.red, 10),
                    borderColor: tint(LEGACY_COLORS.red, 30),
                    color: LEGACY_COLORS.red,
                  }}
                  disabled={stepperQty <= 0}
                >
                  -10
                </button>
                <button
                  type="button"
                  onClick={() => stepBundle(-1)}
                  className="rounded-[8px] border px-2.5 py-1.5 text-xs font-black transition-colors hover:brightness-110 lg:px-1.5 lg:py-0.5 lg:text-[11px] disabled:opacity-40"
                  style={{
                    background: tint(LEGACY_COLORS.red, 10),
                    borderColor: tint(LEGACY_COLORS.red, 30),
                    color: LEGACY_COLORS.red,
                  }}
                  disabled={stepperQty <= 0}
                >
                  -1
                </button>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={stepperQty}
                  onChange={(e) => setBundleFromInput(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-[64px] rounded-[8px] border px-1.5 py-2 text-center text-sm font-black tabular-nums outline-none focus:border-[var(--c-blue)] lg:py-0.5"
                  style={{
                    background: LEGACY_COLORS.s2,
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.text,
                  }}
                />
                <button
                  type="button"
                  onClick={() => stepBundle(1)}
                  className="rounded-[8px] border px-2.5 py-1.5 text-xs font-black transition-colors hover:brightness-110 lg:px-1.5 lg:py-0.5 lg:text-[11px]"
                  style={{
                    background: tint(LEGACY_COLORS.green, 10),
                    borderColor: tint(LEGACY_COLORS.green, 30),
                    color: LEGACY_COLORS.green,
                  }}
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => stepBundle(10)}
                  className="rounded-[8px] border px-2.5 py-1.5 text-xs font-black transition-colors hover:brightness-110 lg:px-1.5 lg:py-0.5 lg:text-[11px]"
                  style={{
                    background: tint(LEGACY_COLORS.green, 10),
                    borderColor: tint(LEGACY_COLORS.green, 30),
                    color: LEGACY_COLORS.green,
                  }}
                >
                  +10
                </button>
              </span>
            ) : (
              <span>기준 수량 {formatQty(bundle.quantity)}</span>
            )}
            <span>·</span>
            <span>반영 {included.length}개</span>
            {excluded > 0 && (
              <>
                <span>·</span>
                <span>제외 {excluded}개</span>
              </>
            )}
            {compositionLabel && (
              <>
                <span>·</span>
                <span>{compositionLabel}</span>
              </>
            )}
          </div>
        </div>
        {directParentLine && (
          <div className="flex items-center gap-6 self-start lg:shrink-0 lg:self-center">
            <div className="text-center lg:text-right">
              <div
                className="text-[9px] font-bold uppercase tracking-[1.5px]"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                {isOutgoing(directParentLine) ? "가능 재고" : "현재 재고"}
              </div>
              <div
                className="text-base font-black tabular-nums"
                style={{ color: LEGACY_COLORS.text }}
              >
                {parentAvailable === null ? "-" : formatQty(parentAvailable)}
              </div>
            </div>
            <div className="text-center lg:text-right">
              <div
                className="text-[9px] font-bold uppercase tracking-[1.5px]"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                실행 후
              </div>
              <div
                className="text-base font-black tabular-nums"
                style={{ color: parentExpectedColor }}
              >
                {parentExpected === null ? "-" : formatQty(parentExpected)}
              </div>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemoveBundle(); }}
          className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center rounded-full transition-colors hover:brightness-110 lg:static lg:shrink-0 lg:self-center"
          style={{ color: LEGACY_COLORS.red, background: tint(LEGACY_COLORS.red, 10) }}
          title="묶음 삭제"
        >
          <Trash2 className="h-7 w-7" />
        </button>
      </div>

      {!collapsed && isCollapsible && (
        <ul
          className="divide-y rounded-[12px] border"
          style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
        >
          {visibleLines.map((line) => (
            <li key={line.line_id} style={{ borderColor: LEGACY_COLORS.border }}>
              <IoLineRow
                line={line}
                subType={subType}
                isChild={line.origin === "bom_auto"}
                item={itemMap.get(line.item_id)}
                available={getAvailable(line)}
                pullSelectable={linePullSelectable(line)}
                pullSelected={pullSelected?.has(line.line_id)}
                onTogglePull={onTogglePull ? () => onTogglePull(line.line_id) : undefined}
                onToggle={() => onToggleLine(line.line_id)}
                onQuantityChange={(quantity, shortage) => onQuantityChange(line.line_id, quantity, shortage)}
                onRemove={() => onRemoveLine(line.line_id)}
              />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
