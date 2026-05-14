"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Layers, PackageCheck, Trash2 } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import type { IoBundle, IoLine, IoSubType, Item } from "./types";
import { IoLineRow } from "./IoLineRow";
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
}: Props) {
  const included = bundle.lines.filter((line) => line.included);
  const excluded = bundle.lines.length - included.length;
  const autoCount = bundle.lines.filter((line) => line.origin === "bom_auto").length;
  const hasAuto = autoCount > 0 || bundle.lines.some((line) => line.origin === "package_auto");
  const hasDirectLine = bundle.lines.some((line) => line.origin === "direct");
  const directParentLine =
    bundle.source_kind === "bom_parent"
      ? bundle.lines.find((line) => line.origin === "direct")
      : undefined;
  // BOM 묶음 — 부모 라인이 있으면 부모 라인 수량을, 없으면 bundle.quantity 를 stepper 로 노출.
  const showBundleQtyStepper =
    bundle.source_kind === "bom_parent" &&
    (directParentLine != null || !!onBundleQuantityChange);
  const tone = bundle.source_kind === "ship_package" ? LEGACY_COLORS.purple : LEGACY_COLORS.blue;
  const compositionLabel = (() => {
    if (bundle.source_kind === "ship_package") return null;
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
  const [collapsed, setCollapsed] = useState(true);
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
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => {
              if (isCollapsible) setCollapsed((v) => !v);
            }}
            disabled={!isCollapsible}
            className="flex min-w-0 items-center gap-2 text-left disabled:cursor-default"
            title={isCollapsible ? (collapsed ? "펼치기" : "접기") : undefined}
            aria-expanded={isCollapsible ? !collapsed : undefined}
          >
            {bundle.source_kind === "ship_package" ? (
              <PackageCheck className="h-5 w-5 shrink-0" style={{ color: LEGACY_COLORS.purple }} />
            ) : (
              <Layers className="h-5 w-5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
            )}
            <h3 className="truncate text-base font-black" style={{ color: LEGACY_COLORS.text }}>
              {bundle.title}
            </h3>
            {isCollapsible &&
              (collapsed ? (
                <ChevronDown className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
              ) : (
                <ChevronUp className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
              ))}
          </button>
          <div
            className="mt-1 flex flex-wrap items-center gap-1 text-xs font-semibold"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {showBundleQtyStepper ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[1.5px]">
                  기준 수량
                </span>
                <button
                  type="button"
                  onClick={() => stepBundle(-10)}
                  className="rounded-[8px] border px-1.5 py-0.5 text-[11px] font-black transition-colors hover:brightness-110 disabled:opacity-40"
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
                  className="rounded-[8px] border px-1.5 py-0.5 text-[11px] font-black transition-colors hover:brightness-110 disabled:opacity-40"
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
                  className="w-[64px] rounded-[8px] border px-1.5 py-0.5 text-center text-sm font-black tabular-nums outline-none focus:border-[var(--c-blue)]"
                  style={{
                    background: LEGACY_COLORS.s2,
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.text,
                  }}
                />
                <button
                  type="button"
                  onClick={() => stepBundle(1)}
                  className="rounded-[8px] border px-1.5 py-0.5 text-[11px] font-black transition-colors hover:brightness-110"
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
                  className="rounded-[8px] border px-1.5 py-0.5 text-[11px] font-black transition-colors hover:brightness-110"
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
            {bundle.source_kind === "ship_package" && hasAuto && (
              <>
                <span>·</span>
                <span>패키지 자동</span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemoveBundle}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: LEGACY_COLORS.muted2 }}
          title="묶음 삭제"
        >
          <Trash2 className="h-4 w-4" />
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
