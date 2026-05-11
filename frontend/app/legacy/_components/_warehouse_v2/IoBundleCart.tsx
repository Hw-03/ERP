"use client";

import { ClipboardList } from "lucide-react";
import type { IoBundle, IoLine } from "./types";
import { IoBundleCard } from "./IoBundleCard";

interface Props {
  bundles: IoBundle[];
  getAvailable: (line: IoLine) => number | null;
  onToggleLine: (bundleId: string, lineId: string) => void;
  onQuantityChange: (bundleId: string, lineId: string, quantity: number, shortage: number) => void;
  onRemoveLine: (bundleId: string, lineId: string) => void;
  onRemoveBundle: (bundleId: string) => void;
}

export function IoBundleCart({
  bundles,
  getAvailable,
  onToggleLine,
  onQuantityChange,
  onRemoveLine,
  onRemoveBundle,
}: Props) {
  const includedCount = bundles.flatMap((bundle) => bundle.lines).filter((line) => line.included).length;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-slate-900">실제 반영 품목</h2>
          <p className="text-xs font-medium text-slate-500">
            체크된 라인만 재고에 반영되고, 해제한 라인은 작업 내역에 제외로 남습니다.
          </p>
        </div>
        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-white">
          반영 {includedCount}개
        </span>
      </div>

      {bundles.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center">
          <ClipboardList className="mb-2 h-7 w-7 text-slate-400" />
          <p className="text-sm font-black text-slate-700">아직 선택된 품목이 없습니다.</p>
          <p className="mt-1 text-xs font-medium text-slate-500">대상을 선택하면 BOM/패키지가 자동으로 정리됩니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bundles.map((bundle) => (
            <IoBundleCard
              key={bundle.bundle_id}
              bundle={bundle}
              getAvailable={getAvailable}
              onToggleLine={(lineId) => onToggleLine(bundle.bundle_id, lineId)}
              onQuantityChange={(lineId, quantity, shortage) =>
                onQuantityChange(bundle.bundle_id, lineId, quantity, shortage)
              }
              onRemoveLine={(lineId) => onRemoveLine(bundle.bundle_id, lineId)}
              onRemoveBundle={() => onRemoveBundle(bundle.bundle_id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
