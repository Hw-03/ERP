"use client";

import { Check, MinusCircle, Pencil, Trash2 } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { getStockState } from "@/lib/mes/inventory";
import { erpCodeDeptBadge } from "@/lib/mes/process";
import { useDeptColorLookup } from "../DepartmentsContext";
import type { IoLine, IoSubType, Item } from "./types";
import { lineTagLabel, type LineTagTone } from "./ioWorkType";
import { formatQty } from "@/lib/mes/format";

interface Props {
  line: IoLine;
  subType: IoSubType;
  isChild: boolean;
  item?: Item;
  available: number | null;
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

function directionPrefix(line: IoLine): { sign: "+" | "-" | null; suffix: string } {
  if (line.direction === "in") return { sign: "+", suffix: "" };
  if (line.direction === "out" || line.direction === "defective") return { sign: "-", suffix: "" };
  if (line.direction === "adjust") {
    if (line.to_bucket === "production") return { sign: "+", suffix: " 보정" };
    if (line.from_bucket === "production") return { sign: "-", suffix: " 보정" };
  }
  return { sign: null, suffix: "" };
}

function isOutgoing(line: IoLine) {
  if (line.direction === "out" || line.direction === "move" || line.direction === "defective") {
    return true;
  }
  if (line.direction === "adjust" && line.from_bucket === "production") {
    return true;
  }
  return false;
}

function expectedAfter(line: IoLine, available: number | null) {
  if (available === null) return null;
  if (line.direction === "in") return available + line.quantity;
  if (line.direction === "adjust") {
    if (line.to_bucket === "production") return available + line.quantity;
    if (line.from_bucket === "production") return available - line.quantity;
    return available;
  }
  if (line.direction === "out" || line.direction === "defective" || line.direction === "move")
    return available - line.quantity;
  return available;
}

export function IoLineRow({
  line,
  subType,
  isChild,
  item,
  available,
  onToggle,
  onQuantityChange,
  onRemove,
}: Props) {
  const getDeptColor = useDeptColorLookup();
  const disabled = !line.included;
  const shortage = line.included && line.shortage > 0;
  const titleColor = disabled ? LEGACY_COLORS.muted2 : LEGACY_COLORS.text;
  const rowBackground = shortage ? tint(LEGACY_COLORS.red, 8) : "transparent";
  const stock = item ? getStockState(Number(item.quantity), item.min_stock == null ? null : Number(item.min_stock)) : null;
  const deptBadge = item ? erpCodeDeptBadge(item.erp_code, getDeptColor) : null;
  const expected = expectedAfter(line, available);
  const tag = lineTagLabel(line, subType);
  const tagColor = toneToColor(tag.tone);
  const dirInfo = directionPrefix(line);
  const expectedColor =
    expected === null
      ? LEGACY_COLORS.muted2
      : expected < 0
      ? LEGACY_COLORS.red
      : expected === 0
      ? LEGACY_COLORS.yellow
      : LEGACY_COLORS.green;

  function onStep(delta: number) {
    const next = Math.max(0, line.quantity + delta);
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
    <div
      className="grid items-center gap-3 py-3 pr-4"
      style={{
        gridTemplateColumns:
          "32px minmax(0,1.6fr) minmax(70px,auto) auto minmax(80px,auto) minmax(80px,auto) 32px",
        background: rowBackground,
        paddingLeft: isChild ? 32 : 16,
        borderLeft: isChild ? `3px solid ${tint(LEGACY_COLORS.muted2, 30)}` : "none",
      }}
    >
      {/* 1. 체크박스 */}
      <button
        type="button"
        onClick={onToggle}
        className="flex h-6 w-6 items-center justify-center rounded-[6px] border transition-colors"
        style={{
          background: line.included ? LEGACY_COLORS.blue : "transparent",
          borderColor: line.included ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
          color: line.included ? LEGACY_COLORS.white : LEGACY_COLORS.muted2,
        }}
        title={line.included ? "재고 반영 포함" : line.exclusion_note || "이번 작업 제외"}
        aria-pressed={line.included}
      >
        {line.included ? <Check className="h-4 w-4" /> : <MinusCircle className="h-3.5 w-3.5" />}
      </button>

      {/* 2. 품목명 + 코드 + 메타 */}
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-black" style={{ color: titleColor }}>
            {line.item_name}
          </span>
          {line.has_children && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: tint(LEGACY_COLORS.yellow, 14), color: LEGACY_COLORS.yellow }}
            >
              하위 있음
            </span>
          )}
          {line.edited && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: tint(LEGACY_COLORS.purple, 14), color: LEGACY_COLORS.purple }}
            >
              <Pencil className="h-3 w-3" />
              수동 수정
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
          <span className="truncate">{line.erp_code ?? "-"}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: tint(tagColor, 14), color: tagColor }}
          >
            {tag.text}
          </span>
          {dirInfo.sign && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
              style={{
                background: tint(dirInfo.sign === "+" ? LEGACY_COLORS.green : LEGACY_COLORS.red, 12),
                color: dirInfo.sign === "+" ? LEGACY_COLORS.green : LEGACY_COLORS.red,
              }}
            >
              {dirInfo.sign}
              {formatQty(line.quantity)}
              {dirInfo.suffix}
            </span>
          )}
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

      {/* 4. 수량 stepper */}
      <div className="flex flex-col items-center gap-0.5">
        <span
          className="text-[9px] font-bold uppercase tracking-[1.5px]"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          수량
        </span>
        <div className="flex items-center gap-1">
          <StepBtn tone={LEGACY_COLORS.red} disabled={disabled} onClick={() => onStep(-10)}>
            -10
          </StepBtn>
          <StepBtn tone={LEGACY_COLORS.red} disabled={disabled} onClick={() => onStep(-1)}>
            -1
          </StepBtn>
          <input
            type="number"
            min={0}
            step="0.0001"
            value={Number.isFinite(line.quantity) ? line.quantity : 0}
            disabled={disabled}
            onChange={(e) => onInputChange(e.target.value)}
            className="w-[72px] rounded-[10px] border px-2 py-1.5 text-center text-sm font-black tabular-nums outline-none focus:border-[var(--c-blue)] disabled:opacity-60"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          />
          <StepBtn tone={LEGACY_COLORS.green} disabled={disabled} onClick={() => onStep(1)}>
            +1
          </StepBtn>
          <StepBtn tone={LEGACY_COLORS.green} disabled={disabled} onClick={() => onStep(10)}>
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

      {/* 7. 삭제 (manual만) */}
      {line.origin === "manual" ? (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: LEGACY_COLORS.muted2 }}
          title="수동 라인 삭제"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : (
        <span aria-hidden className="block" />
      )}
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
