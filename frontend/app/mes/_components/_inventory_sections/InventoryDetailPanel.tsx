"use client";

import { Fragment, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronRight, Eye } from "lucide-react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { ImageLightbox } from "@/lib/ui/ImageLightbox";
import { useDeptColorLookup } from "../DepartmentsContext";
import { DesktopRightPanelFooter } from "../DesktopRightPanel";
import { InventoryDetailLocations } from "./InventoryDetailLocations";
import { InventoryWorkStatusPanel } from "./InventoryWorkStatusPanel";
import { BomDetailModal } from "./BomDetailModal";
import { inboundChoices, outboundChoices, quickChoiceToIntent } from "../_warehouse_v2/ioWorkType";
import type { IoEntryIntent } from "../_warehouse_v2/types";

const mix = (color: string, amount: number, base = "transparent") =>
  `color-mix(in srgb, ${color} ${amount}%, ${base})`;

type Props = {
  item: Item;
  onGoToWarehouse: (item: Item, intent?: IoEntryIntent) => void;
  canReceive?: boolean;
  actionsDisabled?: boolean;
  imageFilename?: string;
  // 항목 3 — 모바일 빠른작업: 출고 빨강 + 서브옵션 전폭. 기본 desktop(현행 유지)이라 데스크톱 호출처 무변경.
  quickActionVariant?: "mobile" | "desktop";
};

export function InventoryDetailPanel({
  item,
  onGoToWarehouse,
  canReceive = false,
  actionsDisabled = false,
  imageFilename,
  quickActionVariant = "desktop",
}: Props) {
  const mobile = quickActionVariant === "mobile";
  const writeBlocked = actionsDisabled || !!item.deleted_at;
  const QuickActionContainer = mobile ? Fragment : DesktopRightPanelFooter;
  const getDeptColor = useDeptColorLookup();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [bomModalOpen, setBomModalOpen] = useState(false);
  const [ioMenu, setIoMenu] = useState<"in" | "out" | null>(null);

  // 품목이 바뀌면 BOM 접기 + 팝업 닫기
  useEffect(() => {
    setBomModalOpen(false);
    setIoMenu(null);
  }, [item.item_id]);
  useEffect(() => {
    if (writeBlocked) setIoMenu(null);
  }, [writeBlocked]);
  const locationSection = (Number(item.warehouse_qty) > 0 || (item.locations ?? []).some((location) => Number(location.quantity) > 0))
    ? <InventoryDetailLocations item={item} getDeptColor={getDeptColor} mobile={mobile} /> : null;

  return (
    <div className={mobile ? "flex flex-col gap-2" : "space-y-4"}>
      {quickActionVariant === "mobile" ? (
        // 모바일은 이미지가 있을 때만 기존 이미지 보기 진입을 표시한다.
        imageFilename ? (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label={`${item.item_name} 이미지 보기`}
            className="flex w-full items-center justify-center gap-2 rounded-[18px] border px-4 py-3 text-sm font-bold transition-colors active:brightness-95"
            style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
          >
            <Eye className="h-4 w-4" />
            이미지 보기
          </button>
        ) : null
      ) : (
        // 데스크톱 — 기존 인라인 썸네일(사진 있을 때만, 무변경).
        imageFilename && (
          <section
            data-panel-scroll-card={!mobile || undefined}
            className="flex items-center justify-center rounded-[28px] border p-4"
            style={{ borderColor: LEGACY_COLORS.border, background: mobile ? "transparent" : LEGACY_COLORS.s2 }}
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              aria-label={`${item.item_name} 이미지 확대`}
              className="cursor-zoom-in rounded-[14px] border transition-transform hover:scale-[1.02]"
              style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}
            >
              <Image
                src={`/images/items/${imageFilename}`}
                alt={item.item_name}
                width={160}
                height={160}
                unoptimized
                className="block rounded-[14px] object-contain"
              />
            </button>
          </section>
        )
      )}
      {imageFilename && (
        <ImageLightbox
          open={lightboxOpen}
          src={`/images/items/${imageFilename}`}
          alt={item.item_name}
          onClose={() => setLightboxOpen(false)}
        />
      )}
      {/* 수량 현황 */}
      <InventoryWorkStatusPanel key={item.item_id} item={item} mobile={mobile}>
        {item.supplier && <section data-panel-scroll-card={!mobile || undefined} className={mobile ? "rounded-[20px] border px-3 py-2" : "rounded-[28px] border p-4"}
          style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
          <p className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>공급처</p><p className="mt-1 break-words text-sm">{item.supplier}</p>
        </section>}
        {locationSection}
      </InventoryWorkStatusPanel>

      {/* BOM 하위 구성 */}
      {item.bom_completed_at != null && (
        <div>
          <button
            type="button"
            onClick={(event) => {
              event.currentTarget.focus();
              setBomModalOpen(true);
            }}
            aria-haspopup="dialog"
            className="flex w-full items-center gap-1.5 rounded-[14px] border px-4 py-2.5 text-sm font-semibold transition-colors"
            style={{
              borderColor: LEGACY_COLORS.border,
              background: LEGACY_COLORS.s2,
              color: LEGACY_COLORS.text,
            }}
          >
            {quickActionVariant === "mobile" && <ChevronRight size={15} strokeWidth={2.5} />}
            하위 구성 보기
          </button>
        </div>
      )}
      <BomDetailModal
        itemId={item.item_id}
        open={bomModalOpen}
        onClose={() => setBomModalOpen(false)}
        mobilePresentation={mobile}
      />

      {/* 빠른 작업 */}
      <QuickActionContainer>
      <div>
        {item.deleted_at && <p role="status" className="mb-3 text-sm font-bold" style={{ color: LEGACY_COLORS.red }}>
          삭제된 품목입니다. 입출고 작업을 할 수 없습니다.
        </p>}
        {quickActionVariant === "mobile" ? (
          // 항목 3 — 모바일: 입고(파랑)/출고(빨강) 나란히 + 선택 시 서브옵션을 아래 전폭 파스텔로.
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={writeBlocked}
                onClick={() => { if (!writeBlocked) setIoMenu((m) => (m === "in" ? null : "in")); }}
                aria-pressed={ioMenu === "in"}
                className="min-h-11 w-full rounded-[14px] border px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: mix(LEGACY_COLORS.blue, ioMenu === "in" ? 14 : 7), color: LEGACY_COLORS.blue, borderColor: mix(LEGACY_COLORS.blue, 30), opacity: ioMenu === "out" ? 0.55 : 1 }}
              >
                입고
              </button>
              <button
                type="button"
                disabled={writeBlocked}
                onClick={() => { if (!writeBlocked) setIoMenu((m) => (m === "out" ? null : "out")); }}
                aria-pressed={ioMenu === "out"}
                className="min-h-11 w-full rounded-[14px] border px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: mix(LEGACY_COLORS.red, ioMenu === "out" ? 14 : 7), color: LEGACY_COLORS.red, borderColor: mix(LEGACY_COLORS.red, 30), opacity: ioMenu === "in" ? 0.55 : 1 }}
              >
                출고
              </button>
            </div>
            {ioMenu && !writeBlocked && (
              <div className="flex flex-col gap-1.5">
                {(ioMenu === "in" ? inboundChoices(false) : outboundChoices).map((choice) => {
                  const accent = ioMenu === "out" ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
                  return (
                    <button
                      key={choice.key}
                      type="button"
                      disabled={writeBlocked}
                      onClick={() => {
                        if (writeBlocked) return;
                        setIoMenu(null);
                        onGoToWarehouse(item, quickChoiceToIntent(choice.key));
                      }}
                      className="flex w-full flex-col items-start rounded-[14px] border px-4 py-3 text-left transition-opacity hover:opacity-90"
                      style={{
                        background: LEGACY_COLORS.s2,
                        borderColor: LEGACY_COLORS.border,
                      }}
                    >
                      <span className="text-sm font-bold" style={{ color: accent }}>
                        {choice.label}
                      </span>
                      <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                        {choice.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
        <div className="grid grid-cols-2 gap-2">
          {([
            ["in", "입고", LEGACY_COLORS.blue, inboundChoices(canReceive)],
            ["out", "출고", LEGACY_COLORS.red, outboundChoices],
          ] as const).map(([direction, label, accent, choices]) => (
            <div key={direction} className="flex flex-col gap-1">
              <button
                type="button"
                disabled={writeBlocked}
                onClick={() => { if (!writeBlocked) setIoMenu((menu) => menu === direction ? null : direction); }}
                className="w-full rounded-[18px] border px-4 py-3 text-sm font-bold transition-opacity hover:opacity-90"
                style={{
                  background: mix(accent, 14),
                  borderColor: mix(accent, 42, LEGACY_COLORS.border),
                  color: accent,
                }}
              >
                {label}
              </button>
              {ioMenu === direction && !writeBlocked && <div
                data-testid="quick-action-choices"
                className={`flex w-[calc(200%+0.5rem)] flex-col gap-2 rounded-[14px] border p-3${direction === "out" ? " -translate-x-[calc(50%+0.25rem)]" : ""}`}
                style={{
                  borderColor: mix(accent, 32, LEGACY_COLORS.border),
                  background: mix(accent, 7, LEGACY_COLORS.s2),
                }}
              >
                {choices.map((choice) => <button
                  key={choice.key}
                  type="button"
                  disabled={writeBlocked}
                  onClick={() => {
                    if (writeBlocked) return;
                    setIoMenu(null);
                    onGoToWarehouse(item, quickChoiceToIntent(choice.key));
                  }}
                  className="flex min-h-[64px] flex-col items-start justify-center rounded-[10px] border px-3 py-3 text-left transition-colors hover:opacity-80"
                  style={{
                    background: mix(accent, 10),
                    borderColor: mix(accent, 32, LEGACY_COLORS.border),
                  }}
                >
                  <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.text }}>{choice.label}</span>
                  <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{choice.desc}</span>
                </button>)}
              </div>}
            </div>
          ))}
        </div>
        )}
      </div>
      </QuickActionContainer>

    </div>
  );
}
