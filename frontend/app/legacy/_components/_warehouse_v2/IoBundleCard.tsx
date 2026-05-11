"use client";

import { Layers, PackageCheck, Trash2 } from "lucide-react";
import type { IoBundle, IoLine } from "./types";
import { IoLineRow } from "./IoLineRow";
import { formatQty } from "@/lib/mes/format";

interface Props {
  bundle: IoBundle;
  getAvailable: (line: IoLine) => number | null;
  onToggleLine: (lineId: string) => void;
  onQuantityChange: (lineId: string, quantity: number, shortage: number) => void;
  onRemoveLine: (lineId: string) => void;
  onRemoveBundle: () => void;
}

export function IoBundleCard({
  bundle,
  getAvailable,
  onToggleLine,
  onQuantityChange,
  onRemoveLine,
  onRemoveBundle,
}: Props) {
  const included = bundle.lines.filter((line) => line.included);
  const excluded = bundle.lines.length - included.length;
  const hasAuto = bundle.lines.some((line) => line.origin === "bom_auto" || line.origin === "package_auto");

  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {bundle.source_kind === "ship_package" ? (
              <PackageCheck className="h-5 w-5 text-blue-600" />
            ) : (
              <Layers className="h-5 w-5 text-slate-500" />
            )}
            <h3 className="truncate text-sm font-black text-slate-900">{bundle.title}</h3>
          </div>
          <div className="mt-1 flex flex-wrap gap-1 text-xs font-semibold text-slate-500">
            <span>기준 수량 {formatQty(bundle.quantity)}</span>
            <span>·</span>
            <span>반영 {included.length}개</span>
            {excluded > 0 && (
              <>
                <span>·</span>
                <span>제외 {excluded}개</span>
              </>
            )}
            {hasAuto && (
              <>
                <span>·</span>
                <span>자동 전개</span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemoveBundle}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
          title="묶음 삭제"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        {bundle.lines.map((line) => (
          <IoLineRow
            key={line.line_id}
            line={line}
            available={getAvailable(line)}
            onToggle={() => onToggleLine(line.line_id)}
            onQuantityChange={(quantity, shortage) => onQuantityChange(line.line_id, quantity, shortage)}
            onRemove={() => onRemoveLine(line.line_id)}
          />
        ))}
      </div>
    </article>
  );
}
