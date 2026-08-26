"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Layers } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import type { IoBundle, IoInternalUseBomMode, IoLine, IoSubType, Item } from "./types";
import { IoLineRow, isOutgoing, expectedAfter } from "./IoLineRow";
import { formatQty } from "@/lib/mes/format";
import { findInventoryLocation, locationAvailable, warehouseAvailable } from "@/lib/mes/inventory";
import { PROCESS_TO_DEPT } from "@/lib/mes/process";
import { ExpandableItemName } from "./ExpandableItemName";
import { deductionSourceSummary, IoDeductionSourceBadge } from "./IoDeductionSourceBadge";
import { QuantityStepper } from "./QuantityStepper";
import { IoRemoveButton } from "./IoRemoveButton";
import { INTERNAL_USE_BOM_MODE_LABEL } from "./internalUseBom";
import { isCustomProcessBomBundle, processBomEffectLine } from "./ioWorkType";

interface Props {
  bundle: IoBundle;
  subType: IoSubType;
  itemMap: Map<string, Item>;
  getAvailable: (line: IoLine) => number | null;
  onToggleLine: (lineId: string) => void;
  onQuantityChange: (lineId: string, quantity: number, shortage: number) => void;
  onBundleQuantityChange?: (quantity: number) => void;
  onInternalUseBomModeChange?: (mode: IoInternalUseBomMode) => void;
  internalUseBomBusy?: boolean;
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
  onInternalUseBomModeChange,
  internalUseBomBusy,
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
  const autoCount = bundle.lines.filter((line) => line.origin === "bom_auto").length;
  const hasDirectLine = bundle.lines.some((line) => line.origin === "direct");
  const directParentLine =
    bundle.source_kind === "bom_parent"
      ? bundle.lines.find((line) => line.origin === "direct")
      : undefined;
  const customProcessBom = isCustomProcessBomBundle(subType, bundle);
  const displayedIncluded = customProcessBom
    ? included.filter((line) => line.origin !== "direct")
    : included;
  const displayedLineCount = customProcessBom
    ? bundle.lines.filter((line) => line.origin !== "direct").length
    : bundle.lines.length;
  const excluded = displayedLineCount - displayedIncluded.length;
  const parentAvailable = directParentLine ? getAvailable(directParentLine) : null;
  const parentExpected = directParentLine
    ? expectedAfter(directParentLine, parentAvailable)
    : null;
  const displayedParentExpected = customProcessBom ? parentAvailable : parentExpected;
  const parentExpectedColor =
    displayedParentExpected === null
      ? LEGACY_COLORS.muted2
      : displayedParentExpected < 0
      ? LEGACY_COLORS.red
      : displayedParentExpected === 0
      ? LEGACY_COLORS.yellow
      : LEGACY_COLORS.green;
  // BOM 묶음 — 부모 라인이 있으면 부모 라인 수량을, 없으면 bundle.quantity 를 stepper 로 노출.
  const showBundleQtyStepper =
    bundle.source_kind === "bom_parent" &&
    (directParentLine != null || !!onBundleQuantityChange);
  const compositionLabel = (() => {
    if (bundle.source_kind === "bom_parent" || autoCount > 0) {
      if (customProcessBom) {
        return subType === "disassemble"
          ? "BOM 참고 출고 · 상위 미반영"
          : `BOM 자동 전개 · 상위 미반영 · 하위 ${autoCount}`;
      }
      return hasDirectLine
        ? `BOM 자동 전개 · 상위 1 + 하위 ${autoCount}`
        : `BOM 자동 전개 · 자재 ${autoCount}`;
    }
    return "단품";
  })();
  const visibleLines = directParentLine
    ? bundle.lines.filter((line) => line.line_id !== directParentLine.line_id)
    : bundle.lines;
  const isInternalUse = subType === "internal_use_out";
  const isInternalUseBom = isInternalUse && bundle.source_kind === "bom_parent";
  const deductionSource = isInternalUse ? deductionSourceSummary(visibleLines) : null;
  const parentItem = bundle.source_item_id
    ? itemMap.get(bundle.source_item_id)
    : undefined;
  const parentSourceAvailable = (() => {
    if (parentAvailable !== null) return parentAvailable;
    if (!isInternalUseBom || !parentItem) return null;
    if (bundle.source_location !== "department") {
      return warehouseAvailable(parentItem);
    }
    const sourceDepartment = PROCESS_TO_DEPT[parentItem.process_type_code ?? ""] ?? "조립";
    return locationAvailable(
      findInventoryLocation(parentItem, sourceDepartment, "PRODUCTION"),
    );
  })();
  const parentSummaryExpected = directParentLine
    ? parentExpected
    : parentSourceAvailable === null
      ? null
      : parentSourceAvailable - (Number(bundle.quantity) || 0);
  const parentModeExpected =
    bundle.internal_use_bom_mode === "parent_and_children"
      ? parentSummaryExpected
      : bundle.internal_use_bom_mode === "children_only"
        ? parentSourceAvailable
        : null;
  const parentModeExpectedColor =
    parentModeExpected === null
      ? LEGACY_COLORS.muted2
      : parentModeExpected < 0
        ? LEGACY_COLORS.red
        : parentModeExpected === 0
          ? LEGACY_COLORS.yellow
          : LEGACY_COLORS.green;
  const parentSourceAvailableText =
    parentSourceAvailable === null ? "-" : formatQty(parentSourceAvailable);
  const parentModeExpectedText =
    parentModeExpected === null ? "-" : formatQty(parentModeExpected);
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
  return (
    <article
      className="rounded-[18px] border-2 p-4"
      style={{
        background: tint(tone, 6),
        borderColor: tint(tone, 40),
      }}
    >
      <div
        className={`relative mb-3 grid grid-cols-1 gap-3 lg:items-center ${
          isInternalUse
            ? "lg:grid-cols-[minmax(0,1.6fr)_minmax(208px,auto)_minmax(112px,auto)_minmax(132px,auto)_minmax(80px,auto)_minmax(80px,auto)_44px]"
            : "lg:grid-cols-[minmax(0,1.6fr)_minmax(132px,auto)_minmax(80px,auto)_minmax(80px,auto)_44px]"
        }`}
        onClick={() => { if (isCollapsible) setCollapsed((v) => !v); }}
        style={{
          cursor: isCollapsible ? "pointer" : "default",
        }}
        role={isCollapsible ? "button" : undefined}
        aria-expanded={isCollapsible ? !collapsed : undefined}
      >
        <div className="min-w-0 pr-12 lg:pr-0">
          <div className="flex min-w-0 items-start gap-2 text-left">
            <Layers className="h-5 w-5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
            <ExpandableItemName
              name={bundle.title}
              className="text-base font-black leading-tight"
              collapsedClassName="line-clamp-2 whitespace-normal lg:line-clamp-none"
              style={{ color: LEGACY_COLORS.text }}
            />
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
            {bundleCode && <span>{bundleCode}</span>}
            {bundleCode && <span>·</span>}
            <span>반영 {displayedIncluded.length}개</span>
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
        {isInternalUseBom && (
          <div
            role="group"
            aria-label="BOM 차감 방식"
            onClick={(event) => event.stopPropagation()}
            className="flex min-w-[208px] flex-col items-center gap-0.5"
          >
            <span
              className="text-xs font-bold uppercase tracking-[1.5px]"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              차감 방식
            </span>
            <div className="grid h-11 min-h-[44px] w-full grid-cols-2 gap-1">
              {(
                ["parent_and_children", "children_only"] as IoInternalUseBomMode[]
              ).map((mode) => {
                const active = bundle.internal_use_bom_mode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    aria-label={INTERNAL_USE_BOM_MODE_LABEL[mode]}
                    aria-pressed={active}
                    disabled={internalUseBomBusy || !onInternalUseBomModeChange}
                    onClick={() => onInternalUseBomModeChange?.(mode)}
                    className="h-11 min-h-[44px] rounded-[10px] border px-2 py-2 text-sm font-black whitespace-nowrap transition-[transform,filter,opacity] active:scale-[0.98] hover:brightness-110 disabled:opacity-50"
                    style={{
                      background: active ? tint(LEGACY_COLORS.blue, 16) : LEGACY_COLORS.s2,
                      borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                      color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                    }}
                  >
                    {INTERNAL_USE_BOM_MODE_LABEL[mode]}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {isInternalUse && (
          deductionSource ? (
            <IoDeductionSourceBadge sourceName={deductionSource} variant="field" />
          ) : (
            <span className="text-center text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              차감 위치 확인
            </span>
          )
        )}
        <div onClick={(e) => e.stopPropagation()} className="border-t pt-3 lg:self-center lg:border-t-0 lg:pt-0">
          {showBundleQtyStepper ? (
            <QuantityStepper
              value={stepperQty}
              onChange={applyStepperQty}
              label="기준 수량"
              disabled={internalUseBomBusy}
              decrementDisabled={stepperQty <= 0}
              className="items-center"
            />
          ) : (
            <div
              className="text-center text-xs font-bold uppercase tracking-[1.5px]"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              기준 수량 {formatQty(bundle.quantity)}
            </div>
          )}
        </div>
        {isInternalUseBom && (
          <div
            role="group"
            aria-label="상위 자재 재고"
            onClick={(event) => event.stopPropagation()}
            className="grid grid-cols-2 gap-3 lg:col-span-2"
          >
            <div
              aria-label={`가능 재고 ${parentSourceAvailableText}`}
              className="text-center"
            >
              <div
                className="text-[9px] font-bold uppercase tracking-[1.5px]"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                가능 재고
              </div>
              <div
                className="text-base font-black tabular-nums"
                style={{ color: LEGACY_COLORS.text }}
              >
                {parentSourceAvailableText}
              </div>
            </div>
            <div
              aria-label={`실행 후 ${parentModeExpectedText}`}
              className="text-center"
            >
              <div
                className="text-[9px] font-bold uppercase tracking-[1.5px]"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                실행 후
              </div>
              <div
                className="text-base font-black tabular-nums"
                style={{ color: parentModeExpectedColor }}
              >
                {parentModeExpectedText}
              </div>
            </div>
          </div>
        )}
        {!isInternalUseBom && directParentLine && (
          <div className="grid grid-cols-2 border-t pt-3 lg:contents lg:border-t-0 lg:pt-0" style={{ borderColor: LEGACY_COLORS.border }}>
            <div className="self-center text-center">
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
            <div className="self-center text-center">
              <div
                className="text-[9px] font-bold uppercase tracking-[1.5px]"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                {customProcessBom ? "상위 미반영" : "실행 후"}
              </div>
              <div
                className="text-base font-black tabular-nums"
                style={{ color: parentExpectedColor }}
              >
                {displayedParentExpected === null ? "-" : formatQty(displayedParentExpected)}
              </div>
            </div>
          </div>
        )}
        {!isInternalUseBom && !directParentLine && (
          <>
            <span aria-hidden="true" className="hidden lg:block" />
            <span aria-hidden="true" className="hidden lg:block" />
          </>
        )}
        <IoRemoveButton
          label="묶음 삭제"
          onClick={onRemoveBundle}
          disabled={internalUseBomBusy}
          className="absolute right-0 top-0 lg:static lg:self-center"
        />
      </div>

      {!collapsed && isCollapsible && (
        <ul
          className="divide-y rounded-[12px] border"
          style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
        >
          {visibleLines.map((line) => {
            const inventoryEffect = customProcessBom
              ? processBomEffectLine(subType, bundle, line)
              : undefined;
            return (
            <li key={line.line_id} style={{ borderColor: LEGACY_COLORS.border }}>
              <IoLineRow
                line={line}
                inventoryEffect={inventoryEffect}
                subType={subType}
                isChild={line.origin === "bom_auto"}
                item={itemMap.get(line.item_id)}
                available={getAvailable(inventoryEffect ?? line)}
                pullSelectable={linePullSelectable(line)}
                pullSelected={pullSelected?.has(line.line_id)}
                onTogglePull={onTogglePull ? () => onTogglePull(line.line_id) : undefined}
                onToggle={() => onToggleLine(line.line_id)}
                onQuantityChange={(quantity, shortage) => onQuantityChange(line.line_id, quantity, shortage)}
                onRemove={() => onRemoveLine(line.line_id)}
                editingDisabled={internalUseBomBusy}
              />
            </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
