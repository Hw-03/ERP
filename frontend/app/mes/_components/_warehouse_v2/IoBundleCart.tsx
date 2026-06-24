"use client";

import { ClipboardCheck, Save } from "lucide-react";
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
  onBundleQuantityChange?: (bundleId: string, quantity: number) => void;
  onRemoveLine: (bundleId: string, lineId: string) => void;
  onRemoveBundle: (bundleId: string) => void;
  onAdvance: () => void;
  canAdvance: boolean;
  hasShortage?: boolean;
  /** 항목 3-4 — 모바일 전용: Step4에도 임시저장 버튼 노출. 데스크톱은 미전달(버튼 없음 → 무변경). */
  onSaveDraft?: () => void;
  /** 항목 7 — 부족 품목 '창고에서 가져오기'(생산 4단계, 데스크톱 전용). */
  pullEnabled?: boolean;
  pullSelected?: ReadonlySet<string>;
  onTogglePull?: (lineId: string) => void;
  onPullFromWarehouse?: () => void;
  /** 가져오기 버튼 라벨용 — 선택 0이면 부족 라인 전체 개수. */
  pullCount?: number;
}

export function IoBundleCart({
  bundles,
  subType,
  itemMap,
  getAvailable,
  onToggleLine,
  onQuantityChange,
  onBundleQuantityChange,
  onRemoveLine,
  onRemoveBundle,
  onAdvance,
  canAdvance,
  hasShortage,
  onSaveDraft,
  pullEnabled,
  pullSelected,
  onTogglePull,
  onPullFromWarehouse,
  pullCount,
}: Props) {
  const includedCount = bundles.flatMap((bundle) => bundle.lines).filter((line) => line.included).length;
  const totalQty = bundles
    .flatMap((bundle) => bundle.lines)
    .filter((line) => line.included)
    .reduce((acc, line) => acc + (Number.isFinite(line.quantity) ? line.quantity : 0), 0);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* 항목 12 — 안내 문구는 모바일에서 숨김(데스크톱 ≥lg 은 유지). */}
      <p className="hidden text-sm lg:block" style={{ color: LEGACY_COLORS.muted2 }}>
        체크된 품목만 재고에 반영됩니다. 체크를 해제하면 이번 작업에서 제외됩니다.
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
              onBundleQuantityChange={
                onBundleQuantityChange
                  ? (quantity) => onBundleQuantityChange(bundle.bundle_id, quantity)
                  : undefined
              }
              onRemoveLine={(lineId) => onRemoveLine(bundle.bundle_id, lineId)}
              onRemoveBundle={() => onRemoveBundle(bundle.bundle_id)}
              pullEnabled={pullEnabled}
              pullSelected={pullSelected}
              onTogglePull={onTogglePull}
            />
          ))}
        </div>
      )}

      {bundles.length > 0 && (
        // 항목 13 — 모바일은 하단 고정(sticky), 데스크톱(lg)은 기존 mt-auto 정적 배치 그대로.
        // 항목 4-7C — 모바일 띠 배경/상단선 제거(저장·제출확인 버튼만 떠 보이게).
        <div className="sticky bottom-0 z-20 -mx-3 mt-auto flex flex-col gap-2 bg-[var(--c-bg)] px-4 pb-1 pt-2 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-1">
          {!canAdvance && hasShortage && (
            <p className="text-center text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>
              재고가 부족한 항목이 있습니다
            </p>
          )}
          {pullEnabled && hasShortage && onPullFromWarehouse && (
            <button
              type="button"
              onClick={onPullFromWarehouse}
              className="w-full rounded-[14px] border px-5 py-3 text-sm font-black transition-colors hover:brightness-110"
              style={{
                background: tint(LEGACY_COLORS.red, 10),
                borderColor: tint(LEGACY_COLORS.red, 40),
                color: LEGACY_COLORS.red,
              }}
            >
              창고에서 가져오기{pullCount && pullCount > 0 ? ` (${pullCount}개)` : ""}
            </button>
          )}
          {onSaveDraft ? (
            // 항목 3-4 — 모바일: 저장하기 + 제출확인 나란히(Step5와 동일하게 Step4에서도 저장 가능).
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onSaveDraft}
                className="flex shrink-0 items-center gap-1.5 rounded-[14px] border px-5 py-3 text-sm font-black transition-[transform] active:scale-[0.99]"
                style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
              >
                <Save className="h-4 w-4" />
                저장
              </button>
              <button
                type="button"
                onClick={onAdvance}
                disabled={!canAdvance}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[14px] px-6 py-3 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40"
                style={{ background: LEGACY_COLORS.blue }}
              >
                <ClipboardCheck className="h-4 w-4" />
                제출확인 →
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAdvance}
              disabled={!canAdvance}
              className="flex w-full items-center justify-center gap-1.5 rounded-[14px] px-6 py-3 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40"
              style={{ background: LEGACY_COLORS.blue }}
            >
              <ClipboardCheck className="h-4 w-4" />
              제출확인 →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
