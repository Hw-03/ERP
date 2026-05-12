"use client";

import { ClipboardCheck } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { EmptyState } from "../common";
import type { IoBundle, IoLine, IoSubType, Item } from "./types";
import { IoBundleCard } from "./IoBundleCard";
import { formatQty } from "@/lib/mes/format";

interface Props {
  bundles: IoBundle[];
  subType: IoSubType;
  itemMap: Map<string, Item>;
  getAvailable: (line: IoLine) => number | null;
  onToggleLine: (bundleId: string, lineId: string) => void;
  onQuantityChange: (bundleId: string, lineId: string, quantity: number, shortage: number) => void;
  onRemoveLine: (bundleId: string, lineId: string) => void;
  onRemoveBundle: (bundleId: string) => void;
  onAdvance: () => void;
  canAdvance: boolean;
}

export function IoBundleCart({
  bundles,
  subType,
  itemMap,
  getAvailable,
  onToggleLine,
  onQuantityChange,
  onRemoveLine,
  onRemoveBundle,
  onAdvance,
  canAdvance,
}: Props) {
  const includedCount = bundles.flatMap((bundle) => bundle.lines).filter((line) => line.included).length;
  const totalQty = bundles
    .flatMap((bundle) => bundle.lines)
    .filter((line) => line.included)
    .reduce((acc, line) => acc + (Number.isFinite(line.quantity) ? line.quantity : 0), 0);

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
        체크된 품목만 재고에 반영됩니다. 체크를 끄면 이번 작업에서 제외됩니다.
      </p>

      {bundles.length > 0 && (
        <div
          className="flex items-center justify-between rounded-[14px] border px-4 py-2.5"
          style={{
            background: tint(LEGACY_COLORS.blue, 6),
            borderColor: tint(LEGACY_COLORS.blue, 24),
          }}
        >
          <span
            className="text-[11px] font-bold uppercase tracking-[1.5px]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            반영 라인 {includedCount}개 · 총 수량
          </span>
          <span className="text-2xl font-black tabular-nums" style={{ color: LEGACY_COLORS.blue }}>
            {formatQty(totalQty)}
          </span>
        </div>
      )}

      {bundles.length === 0 ? (
        <EmptyState
          compact
          variant="no-data"
          title="아직 선택된 품목이 없습니다."
          description="이전 단계에서 대상을 다시 선택하세요."
        />
      ) : (
        <div className="space-y-3">
          {bundles.map((bundle) => (
            <IoBundleCard
              key={bundle.bundle_id}
              bundle={bundle}
              subType={subType}
              itemMap={itemMap}
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

      {bundles.length > 0 && (
        <button
          type="button"
          onClick={onAdvance}
          disabled={!canAdvance}
          className="flex w-full items-center justify-center gap-1.5 rounded-[14px] px-6 py-3 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40"
          style={{ background: LEGACY_COLORS.blue }}
        >
          <ClipboardCheck className="h-4 w-4" />
          제출 확인으로 →
        </button>
      )}
    </div>
  );
}
