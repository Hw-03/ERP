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

interface Props {
  line: IoLine;
  subType: IoSubType;
  isChild: boolean;
  item?: Item;
  available: number | null;
  forceShowRemove?: boolean;
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

  function onStep(delta: number) {
    const next = Math.max(0, currentQty + delta);
    const nextShortage = available === null ? line.shortage : Math.max(0, next - available);
    onQuantityChange(next, nextShortage);
  }

  function onInputChange(value: string) {
    const next = Number(value);
    const safe = Number.isFinite(next) ? Math.max(0, next) : 0;
    const nextShortage = available === null ? line.shortage : Math.max(0, safe - available);
    onQuantityChange(safe, nextShortage);
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
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-black" style={{ color: titleColor }}>
            {line.item_name}
          </span>
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
      <div className="flex w-full flex-col items-center gap-0.5 lg:w-auto">
        <span
          className="text-[9px] font-bold uppercase tracking-[1.5px]"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          수량
        </span>
        <div className="flex items-center gap-1">
          <StepBtn tone={LEGACY_COLORS.red} disabled={stepperDisabled} onClick={() => onStep(-10)}>
            -10
          </StepBtn>
          <StepBtn tone={LEGACY_COLORS.red} disabled={stepperDisabled} onClick={() => onStep(-1)}>
            -1
          </StepBtn>
          <input
            type="number"
            min={0}
            step="any"
            value={currentQty}
            disabled={stepperDisabled}
            onChange={(e) => onInputChange(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            title={qtyLocked ? "상위 수량에 비례해 자동 계산" : undefined}
            className="w-[72px] rounded-[10px] border px-2 py-1.5 text-center text-sm font-black tabular-nums outline-none focus:border-[var(--c-blue)] disabled:opacity-60"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          />
          <StepBtn tone={LEGACY_COLORS.green} disabled={incrementDisabled} onClick={() => onStep(1)}>
            +1
          </StepBtn>
          <StepBtn tone={LEGACY_COLORS.green} disabled={incrementDisabled} onClick={() => onStep(10)}>
            +10
          </StepBtn>
        </div>
      </div>

      {/* 5. 현재 재고 */}
      <div className="text-right">
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
      <div className="text-right">
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
      </div>

      {/* 7. 삭제 (manual 또는 forceShowRemove) */}
      {line.origin === "manual" || forceShowRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:brightness-110"
          style={{ color: LEGACY_COLORS.red, background: tint(LEGACY_COLORS.red, 10) }}
          title="삭제"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      ) : (
        <span aria-hidden className="block" />
      )}
    </div>
    {line.has_children && <BomSubExpander itemId={line.item_id} open={showChildren} />}
    </div>
  );
}

function StepBtn({
  tone,
  onClick,
  disabled,
  children,
}: {
  tone: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-[10px] border px-2 py-1 text-xs font-black transition-colors hover:brightness-110 disabled:opacity-40"
      style={{
        background: tint(tone, 10),
        borderColor: tint(tone, 30),
        color: tone,
      }}
    >
      {children}
    </button>
  );
}
