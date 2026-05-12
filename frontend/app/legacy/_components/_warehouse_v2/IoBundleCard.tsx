"use client";

import { Layers, PackageCheck, Trash2 } from "lucide-react";
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
  onRemoveLine,
  onRemoveBundle,
}: Props) {
  const included = bundle.lines.filter((line) => line.included);
  const excluded = bundle.lines.length - included.length;
  const autoCount = bundle.lines.filter((line) => line.origin === "bom_auto").length;
  const hasAuto = autoCount > 0 || bundle.lines.some((line) => line.origin === "package_auto");
  const tone = bundle.source_kind === "ship_package" ? LEGACY_COLORS.purple : LEGACY_COLORS.blue;
  const compositionLabel = (() => {
    if (bundle.source_kind === "ship_package") return null;
    if (bundle.source_kind === "bom_parent" || autoCount > 0) {
      return `BOM 자동 전개 · 상위 1 + 하위 ${autoCount}`;
    }
    return "단품";
  })();

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
          <div className="flex items-center gap-2">
            {bundle.source_kind === "ship_package" ? (
              <PackageCheck className="h-5 w-5" style={{ color: LEGACY_COLORS.purple }} />
            ) : (
              <Layers className="h-5 w-5" style={{ color: LEGACY_COLORS.blue }} />
            )}
            <h3 className="truncate text-base font-black" style={{ color: LEGACY_COLORS.text }}>
              {bundle.title}
            </h3>
          </div>
          <div
            className="mt-1 flex flex-wrap gap-1 text-xs font-semibold"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            <span>기준 수량 {formatQty(bundle.quantity)}</span>
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

      <ul
        className="divide-y rounded-[12px] border"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
      >
        {bundle.lines.map((line) => (
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
    </article>
  );
}
