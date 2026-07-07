"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, MinusCircle, Trash2 } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { getStockState } from "@/lib/mes/inventory";
import { mesCodeDeptBadge } from "@/lib/mes/process";
import { useDeptColorLookup } from "../DepartmentsContext";
import type { IoLine, IoSubType, Item } from "./types";
import { isBomForced, lineTagLabel, type LineTagTone } from "./ioWorkType";
import { formatQty } from "@/lib/mes/format";
import { BomSubExpander } from "./BomSubExpander";
import { ExpandableItemName } from "./ExpandableItemName";
import { QuantityStepper } from "./QuantityStepper";

interface Props {
  line: IoLine;
  subType: IoSubType;
  isChild: boolean;
  item?: Item;
  available: number | null;
  forceShowRemove?: boolean;
  /** 항목 7 — 부족 라인 '창고에서 가져오기' 선택 체크박스 노출 여부(부모가 included&&shortage>0 일 때만 true). */
  pullSelectable?: boolean;
  pullSelected?: boolean;
  onTogglePull?: () => void;
  onToggle: () => void;
  onQuantityChange: (quantity: number, shortage: number) => void;
  onRemove: () => void;
}

// originLabel 은 lineTagLabel 로 대체됨 (현장 친화 태그 + 입출고 부호 배지)

function toneToColor(tone: LineTagTone): string {
  if (tone === "green") return LEGACY_COLORS.green;
  if (tone === "red") return LEGACY_COLORS.red;
  if (tone === "blue") return LEGACY_COLORS.blue;
  if (tone === "purple") return LEGACY_COLORS.purple;
  return LEGACY_COLORS.muted2;
}

export function isOutgoing(line: IoLine) {
  if (line.direction === "out" || line.direction === "move" || line.direction === "defective") {
    return true;
  }
  if (line.direction === "adjust" && line.from_bucket === "production") {
    return true;
  }
  return false;
}

export function expectedAfter(line: IoLine, available: number | null) {
  if (available === null) return null;
  const qty = Number(line.quantity) || 0;
  if (line.direction === "in") return available + qty;
  if (line.direction === "adjust") {
    if (line.to_bucket === "production") return available + qty;
    if (line.from_bucket === "production") return available - qty;
    return available;
  }
  if (line.direction === "out" || line.direction === "defective" || line.direction === "move")
    return available - qty;
  return available;
}

export function IoLineRow({
  line,
  subType,
  isChild,
  item,
  available,
  forceShowRemove,
  pullSelectable,
  pullSelected,
  onTogglePull,
  onToggle,
  onQuantityChange,
  onRemove,
}: Props) {
  const getDeptColor = useDeptColorLookup();
  const [showChildren, setShowChildren] = useState(false);
  const disabled = !line.included;
  // BOM 강제 모드: process(produce/disassemble) 한정 — bom_auto 하위는 상위 비례 자동 계산 → 체크/수량 차단.
  // 창고 입출고는 묶음 선택 후 내부 자유 편집 허용 (qtyLocked=false).
  const qtyLocked =
    isBomForced(subType) &&
    line.origin === "bom_auto" &&
    line.bom_expected != null &&
    Number(line.bom_expected) > 0;
  const stepperDisabled = disabled || qtyLocked;
  // + 버튼은 미체크 상태에서도 활성 — qty=0 자동 해제된 라인 복귀용. qtyLocked 만 차단.
  const incrementDisabled = qtyLocked;
  const shortage = line.included && line.shortage > 0;
  const titleColor = disabled ? LEGACY_COLORS.muted2 : LEGACY_COLORS.text;
  const rowBackground = shortage ? tint(LEGACY_COLORS.red, 8) : "transparent";
  const stock = item ? getStockState(Number(item.quantity), item.min_stock == null ? null : Number(item.min_stock)) : null;
  const deptBadge = item ? mesCodeDeptBadge(item.mes_code, getDeptColor) : null;
  const expected = expectedAfter(line, available);
  const tag = lineTagLabel(line, subType);
  const tagColor = toneToColor(tag.tone);
  const expectedColor =
    expected === null
      ? LEGACY_COLORS.muted2
      : expected < 0
      ? LEGACY_COLORS.red
      : expected === 0
      ? LEGACY_COLORS.yellow
      : LEGACY_COLORS.green;

  // line.quantity 는 backend Decimal 직렬화로 string 일 수 있어 Number 강제 변환 (string concat 방지)
  const currentQty = Number(line.quantity) || 0;

  function nextShortageFor(quantity: number) {
    if (!isOutgoing(line)) return 0;
    return available === null ? line.shortage : Math.max(0, quantity - available);
  }

  function onStepperChange(next: number) {
    onQuantityChange(next, nextShortageFor(next));
  }

  return (
    <div>
    <div
      // 모바일: flex-wrap 으로 줄바꿈(품목명 칸이 0폭 붕괴 → 세로글자 나던 문제 해소).
      // 데스크톱(lg): 기존 7열 그리드 유지(인라인 gridTemplateColumns 는 display:grid 일 때만 의미).
      className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 pr-4 lg:grid lg:gap-3"
      style={{
        gridTemplateColumns:
          "32px minmax(0,1.6fr) minmax(70px,auto) auto minmax(80px,auto) minmax(80px,auto) 40px",
        background: rowBackground,
        paddingLeft: isChild ? 32 : 16,
        borderLeft: isChild ? `3px solid ${tint(LEGACY_COLORS.muted2, 30)}` : "none",
      }}
    >
      {/* 1. 체크박스 */}
      <button
        type="button"
        onClick={onToggle}
        disabled={qtyLocked}
        className="flex h-6 w-6 items-center justify-center rounded-[6px] border transition-colors disabled:cursor-not-allowed"
        style={{
          background: line.included ? LEGACY_COLORS.blue : "transparent",
          borderColor: line.included ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
          color: line.included ? LEGACY_COLORS.white : LEGACY_COLORS.muted2,
        }}
        aria-pressed={line.included}
      >
        {line.included ? <Check className="h-4 w-4" /> : <MinusCircle className="h-3.5 w-3.5" />}
      </button>

      {/* 2. 품목명 + 코드 + 메타 (모바일에선 flex-1 로 한 줄 폭 확보) */}
      <div className="min-w-0 flex-1 basis-[60%] lg:flex-none lg:basis-auto">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {/* 항목 4-7A — 모바일에서 긴 품목명 탭하면 전체 펼침(PC 는 1줄+title 유지). */}
          <ExpandableItemName
            name={line.item_name}
            className="text-sm font-black leading-tight"
            collapsedClassName="line-clamp-2 whitespace-normal lg:line-clamp-none"
            style={{ color: titleColor }}
          />
          {line.has_children && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowChildren((v) => !v); }}
              className="shrink-0 flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors hover:brightness-110"
              style={{ background: tint(LEGACY_COLORS.yellow, 14), color: LEGACY_COLORS.yellow }}
            >
              {showChildren ? (
                <ChevronDown className="h-2.5 w-2.5" />
              ) : (
                <ChevronRight className="h-2.5 w-2.5" />
              )}
              {showChildren ? "하위 접기" : "하위 있음"}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
          <span className="truncate">{line.mes_code ?? "-"}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: tint(tagColor, 14), color: tagColor }}
          >
            {tag.text}
          </span>
          <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
            {qtyLocked
              ? "상위 품목과 함께 자동 처리"
              : line.included
                ? "재고 반영 포함"
                : line.exclusion_note || "이번 작업 제외"}
          </span>
        </div>
      </div>

      {/* 3. 분류 배지 */}
      {deptBadge ? (
        <span
          className="justify-self-start rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ color: deptBadge.color, background: deptBadge.bg }}
        >
          {deptBadge.label}
        </span>
      ) : (
        <span className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
      )}

      {/* 4. 수량 stepper (모바일에선 한 줄 차지) */}
      <QuantityStepper
        value={currentQty}
        onChange={onStepperChange}
        disabled={qtyLocked}
        decrementDisabled={stepperDisabled}
        incrementDisabled={incrementDisabled}
        inputTitle={qtyLocked ? "상위 수량에 비례해 자동 계산" : undefined}
        className="w-full lg:w-auto"
      />

      {/* 항목 5-6 — 모바일만 가능재고+실행후를 가운데 정렬·간격 확보. lg:contents 로 데스크톱 7열 그리드 유지. */}
      <div className="flex w-full items-start justify-center gap-10 lg:contents">
      {/* 5. 현재 재고 */}
      <div className="text-center lg:text-right">
        <div
          className="text-[9px] font-bold uppercase tracking-[1.5px]"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          {isOutgoing(line) ? "가능 재고" : "현재 재고"}
        </div>
        <div
          className="text-base font-black tabular-nums"
          style={{ color: stock ? stock.color : available === null ? LEGACY_COLORS.muted2 : LEGACY_COLORS.text }}
        >
          {available === null ? "-" : formatQty(available)}
        </div>
      </div>

      {/* 6. 실행 후 재고 */}
      <div className="text-center lg:text-right">
        <div
          className="text-[9px] font-bold uppercase tracking-[1.5px]"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          실행 후
        </div>
        <div
          className="text-base font-black tabular-nums"
          style={{ color: expectedColor }}
        >
          {expected === null ? "-" : formatQty(expected)}
        </div>
        {shortage && (
          <div
            className="text-[9px] font-bold uppercase tracking-[1px]"
            style={{ color: LEGACY_COLORS.red }}
          >
            재고 부족
          </div>
        )}
        {pullSelectable && onTogglePull && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePull();
            }}
            className="mt-1 inline-flex items-center gap-1 rounded-[8px] border px-1.5 py-0.5 text-[10px] font-bold transition-colors hover:brightness-110"
            style={{
              background: pullSelected ? LEGACY_COLORS.red : tint(LEGACY_COLORS.red, 8),
              borderColor: tint(LEGACY_COLORS.red, 40),
              color: pullSelected ? LEGACY_COLORS.white : LEGACY_COLORS.red,
            }}
            aria-pressed={pullSelected}
            title="창고에서 가져오기 대상으로 선택"
          >
            {pullSelected ? <Check className="h-3 w-3" /> : <MinusCircle className="h-3 w-3" />}
            가져오기
          </button>
        )}
      </div>
      </div>

      {/* 7. 삭제 (manual 또는 forceShowRemove) */}
      {line.origin === "manual" || forceShowRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:brightness-110"
          style={{ color: LEGACY_COLORS.red, background: tint(LEGACY_COLORS.red, 10) }}
          title="삭제"
        >
          <Trash2 className="h-6 w-6" />
        </button>
      ) : (
        <span aria-hidden className="block" />
      )}
    </div>
    {line.has_children && (
      <BomSubExpander
        itemId={line.item_id}
        open={showChildren}
        compact
        tapToExpandName
      />
    )}
    </div>
  );
}
