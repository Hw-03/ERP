"use client";

import { ClipboardCheck, Save } from "lucide-react";
import type { ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { EmptyState } from "../common";
import type { IoBundle, IoInternalUseBomMode, IoLine, IoSubType, IoWorkType, Item } from "./types";
import { IoWorkMemo } from "./IoWorkMemo";
import { IoBundleCard } from "./IoBundleCard";
import { hasUnselectedInternalUseBomMode } from "./internalUseBom";
import { ioDirectionTone } from "./ioVisualTheme";
import scrollStyles from "../mobile/primitives/MobileScrollFrame.module.css";

interface Props {
  workType?: IoWorkType;
  notes?: string;
  onNotesChange?: (value: string) => void;
  employeeId?: string;
  reasonCategory?: string;
  reasonCategoryId?: string | null;
  onReasonCategoryChange?: (name: string, categoryId?: string | null) => void;
  bundles: IoBundle[];
  subType: IoSubType;
  itemMap: Map<string, Item>;
  getAvailable: (line: IoLine) => number | null;
  onToggleLine: (bundleId: string, lineId: string) => void;
  onQuantityChange: (bundleId: string, lineId: string, quantity: number, shortage: number) => void;
  onBundleQuantityChange?: (bundleId: string, quantity: number) => void;
  onInternalUseBomModeChange?: (
    bundleId: string,
    mode: IoInternalUseBomMode,
  ) => void;
  internalUseBomBusy?: boolean;
  onRemoveLine: (bundleId: string, lineId: string) => void;
  onRemoveBundle: (bundleId: string) => void;
  onAdvance: () => void;
  canAdvance: boolean;
  hasShortage?: boolean;
  stockChecking?: boolean;
  hasInvalidQuantity?: boolean;
  invalidLineCodes?: string[];
  /** 현재 작업을 작업 중 목록에 등록하거나 변경 내용을 반영한다. */
  onSaveDraft?: () => void;
  saveDraftLabel?: string;
  footerNotice?: ReactNode;
  /** 항목 7 — 부족 품목 '창고에서 가져오기'(생산 4단계, 데스크톱 전용). */
  pullEnabled?: boolean;
  pullSelected?: ReadonlySet<string>;
  onTogglePull?: (lineId: string) => void;
  onPullFromWarehouse?: () => void;
  /** 가져오기 버튼 라벨용 — 선택 0이면 부족 라인 전체 개수. */
  pullCount?: number;
  pulling?: boolean;
  /** BOM 목록 미확인/실패 시 새 창고 반출 작업 전환을 막는다. */
  pullBlocked?: boolean;
  mobilePresentation?: boolean;
}

export function IoBundleCart({
  workType, notes = "", onNotesChange, employeeId, reasonCategory, reasonCategoryId, onReasonCategoryChange,
  bundles,
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
  onAdvance,
  canAdvance: readyToAdvance,
  hasShortage: currentShortage,
  stockChecking = false,
  hasInvalidQuantity,
  invalidLineCodes = [],
  onSaveDraft,
  saveDraftLabel = "작업 중 등록",
  footerNotice,
  pullEnabled,
  pullSelected,
  onTogglePull,
  onPullFromWarehouse,
  pullCount,
  pulling,
  pullBlocked,
  mobilePresentation = false,
}: Props) {
  const canAdvance = readyToAdvance && !stockChecking;
  const hasShortage = currentShortage && !stockChecking;
  const pullSelectedCount = pullSelected?.size ?? 0;
  const includedCount = bundles.flatMap((bundle) => bundle.lines).filter((line) => line.included).length;
  const hasMissingInternalUseBomMode =
    subType === "internal_use_out" && hasUnselectedInternalUseBomMode(bundles);
  const pullButtonLabel =
    pullSelectedCount > 0
      ? `선택한 ${pullSelectedCount}개 가져오기`
      : pullCount && pullCount > 0
        ? `부족 ${pullCount}개 전체 가져오기`
        : "부족 품목 가져오기";
  const bundleCards = bundles.map((bundle) => (
    <IoBundleCard
      key={subType === "internal_use_out" && bundle.source_item_id ? bundle.source_item_id : bundle.bundle_id}
      bundle={bundle}
      subType={subType}
      itemMap={itemMap}
      getAvailable={getAvailable}
      onToggleLine={(lineId) => onToggleLine(bundle.bundle_id, lineId)}
      onQuantityChange={(lineId, quantity, shortage) => onQuantityChange(bundle.bundle_id, lineId, quantity, shortage)}
      onBundleQuantityChange={onBundleQuantityChange ? (quantity) => onBundleQuantityChange(bundle.bundle_id, quantity) : undefined}
      onInternalUseBomModeChange={onInternalUseBomModeChange ? (mode) => onInternalUseBomModeChange(bundle.bundle_id, mode) : undefined}
      internalUseBomBusy={internalUseBomBusy}
      onRemoveLine={(lineId) => onRemoveLine(bundle.bundle_id, lineId)}
      onRemoveBundle={() => onRemoveBundle(bundle.bundle_id)}
      pullEnabled={pullEnabled}
      pullSelected={pullSelected}
      onTogglePull={onTogglePull}
    />
  ));

  return (
    <div data-io-cart className={`flex h-full min-h-0 flex-col ${mobilePresentation ? "gap-4" : "gap-2"}`}>
      {bundles.length === 0 ? (
        <EmptyState
          illustrated
          variant="no-data"
          title="아직 선택된 품목이 없습니다."
          description="이전 단계에서 대상을 다시 선택하세요."
        />
      ) : mobilePresentation ? (
        <div data-io-cart-shell className="relative min-h-0 flex-1 rounded-[20px]" style={{ background: LEGACY_COLORS.s2 }}>
          <div data-keep-scroll data-io-cart-list className={`${scrollStyles.viewport} space-y-3`} style={{ overscrollBehavior: "contain" }}>
            {bundleCards}
          </div>
          <div data-io-cart-frame aria-hidden className="pointer-events-none absolute inset-0 z-20 rounded-[20px] border" style={{ borderColor: LEGACY_COLORS.border }} />
          <div aria-hidden className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between">
            <div className="flex justify-between">
              <span className="h-5 w-5" style={{ background: "radial-gradient(circle at 100% 100%, transparent 0 19px, var(--c-bg) 20px)" }} />
              <span className="h-5 w-5" style={{ background: "radial-gradient(circle at 0 100%, transparent 0 19px, var(--c-bg) 20px)" }} />
            </div>
            <div className="flex justify-between">
              <span className="h-5 w-5" style={{ background: "radial-gradient(circle at 100% 0, transparent 0 19px, var(--c-bg) 20px)" }} />
              <span className="h-5 w-5" style={{ background: "radial-gradient(circle at 0 0, transparent 0 19px, var(--c-bg) 20px)" }} />
              </div>
          </div>
        </div>
      ) : (
        <div data-io-cart-shell className="relative min-h-0 flex-1 overflow-hidden rounded-[20px]">
          <div data-keep-scroll data-io-cart-list className="sg h-full space-y-3 overflow-y-auto pr-1" style={{ overscrollBehavior: "contain" }}>
            {bundleCards}
          </div>
          <div data-io-cart-frame aria-hidden className="pointer-events-none absolute inset-0 z-20 rounded-[20px] border" style={{ borderColor: LEGACY_COLORS.border }} />
        </div>
      )}

      {bundles.length > 0 && onNotesChange && <IoWorkMemo workType={workType} subType={subType} bundles={bundles} notes={notes} onNotesChange={onNotesChange}
        employeeId={employeeId} reasonCategory={reasonCategory} reasonCategoryId={reasonCategoryId} onReasonCategoryChange={onReasonCategoryChange} mobilePresentation={mobilePresentation} />}
      {bundles.length === 0 && footerNotice}
      {bundles.length > 0 && (
        // 항목 13 — 모바일은 하단 고정(sticky), 데스크톱(lg)은 기존 mt-auto 정적 배치 그대로.
        // 항목 4-7C — 모바일 띠 배경/상단선 제거(저장·제출확인 버튼만 떠 보이게).
        <div data-io-cart-actions className="sticky bottom-0 z-20 -mx-3 mt-auto flex flex-col gap-2 bg-[var(--c-bg)] px-4 pb-0 pt-2 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0">
          {footerNotice}
          {stockChecking && <p role="status" className="text-center text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>사용 가능 재고를 확인하고 있습니다.</p>}
          {!canAdvance && hasShortage && !(pullEnabled && onPullFromWarehouse) && (
            <p className="text-center text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>
              재고가 부족한 항목이 있습니다
            </p>
          )}
          {!canAdvance && !hasShortage && includedCount === 0 && (
            <p className="text-center text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>
              반영할 품목을 하나 이상 선택하세요
            </p>
          )}
          {!canAdvance && !hasShortage && hasInvalidQuantity && invalidLineCodes.length > 0 && (
            <p className="text-center text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>
              수량 0: {invalidLineCodes.join(", ")}
            </p>
          )}
          {!canAdvance && hasMissingInternalUseBomMode && (
            <p className="text-center text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>
              각 BOM 묶음의 차감 방식을 선택하세요
            </p>
          )}
          {pullEnabled && hasShortage && onPullFromWarehouse && (
            <button
              type="button"
              onClick={onPullFromWarehouse}
              disabled={internalUseBomBusy || pulling || pullBlocked}
              className="standard-hover w-full rounded-[14px] border px-5 py-3 text-sm font-black transition-colors"
              style={{
                background: tint(LEGACY_COLORS.red, 10),
                borderColor: tint(LEGACY_COLORS.red, 40),
                color: LEGACY_COLORS.red,
              }}
            >
              재고가 부족한 항목이 있습니다 · {pullButtonLabel}
            </button>
          )}
          {onSaveDraft ? (
            // 수량 조정과 최종 확인에서 같은 작업 등록·반영 동작을 제공한다.
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onSaveDraft}
                disabled={internalUseBomBusy}
                className="flex min-w-0 items-center justify-center gap-1.5 rounded-[14px] border px-5 py-3 text-sm font-black transition-[transform] active:scale-[0.99]"
                style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
              >
                <Save className="h-4 w-4" />
                {saveDraftLabel}
              </button>
              <button
                type="button"
                onClick={onAdvance}
                disabled={!canAdvance || internalUseBomBusy}
                className="flex min-w-0 items-center justify-center gap-1.5 rounded-[14px] px-6 py-3 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40"
                style={{ background: ioDirectionTone(subType) === LEGACY_COLORS.red ? LEGACY_COLORS.redSolid : LEGACY_COLORS.blueSolid }}
              >
                <ClipboardCheck className="h-4 w-4" />
                제출확인 →
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAdvance}
              disabled={!canAdvance || internalUseBomBusy}
              className="flex w-full items-center justify-center gap-1.5 rounded-[14px] px-6 py-3 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40"
              style={{ background: ioDirectionTone(subType) === LEGACY_COLORS.red ? LEGACY_COLORS.redSolid : LEGACY_COLORS.blueSolid }}
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
