"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Eye, ImageOff } from "lucide-react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { api, type Item, type StockRequestReservationLine } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { formatQty } from "@/lib/mes/format";
import { getStockState } from "@/lib/mes/inventory";
import { ImageLightbox } from "@/lib/ui/ImageLightbox";
import { useDeptColorLookup } from "../DepartmentsContext";
import { useDesktopRightPanelBody } from "../DesktopRightPanel";
import { InventoryDetailLocations } from "./InventoryDetailLocations";
import { BomSubExpander } from "../_warehouse_v2/BomSubExpander";
import { inboundChoices, outboundChoices, quickChoiceToIntent } from "../_warehouse_v2/ioWorkType";
import type { IoEntryIntent } from "../_warehouse_v2/types";

type Props = {
  item: Item;
  onGoToWarehouse: (item: Item, intent?: IoEntryIntent) => void;
  canReceive?: boolean;
  imageFilename?: string;
  // 항목 3 — 모바일 빠른작업: 출고 빨강 + 서브옵션 전폭. 기본 desktop(현행 유지)이라 데스크톱 호출처 무변경.
  quickActionVariant?: "mobile" | "desktop";
};

export function InventoryDetailPanel({
  item,
  onGoToWarehouse,
  canReceive = false,
  imageFilename,
  quickActionVariant = "desktop",
}: Props) {
  const getDeptColor = useDeptColorLookup();
  const [reservations, setReservations] = useState<StockRequestReservationLine[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showBom, setShowBom] = useState(false);
  const [ioMenu, setIoMenu] = useState<"in" | "out" | null>(null);
  const firstQuickChoiceRef = useRef<HTMLButtonElement>(null);
  const desktopPanelBody = useDesktopRightPanelBody();

  // 품목이 바뀌면 BOM 접기 + 팝업 닫기
  useEffect(() => {
    setShowBom(false);
    setIoMenu(null);
  }, [item.item_id]);

  useEffect(() => {
    if (quickActionVariant !== "desktop" || !ioMenu || !desktopPanelBody || !firstQuickChoiceRef.current) return;

    const bodyRect = desktopPanelBody.getBoundingClientRect();
    const choiceRect = firstQuickChoiceRef.current.getBoundingClientRect();
    const overflow = choiceRect.bottom + 16 - bodyRect.bottom;
    if (overflow > 0) {
      desktopPanelBody.scrollTo({ top: desktopPanelBody.scrollTop + overflow, behavior: "smooth" });
    }
  }, [desktopPanelBody, ioMenu, quickActionVariant]);
  const pendingQty = Number(item.pending_quantity) || 0;
  const availableQty = Number(item.available_quantity) || 0;
  const minStockRaw = item.min_stock == null ? 0 : Number(item.min_stock);
  const availableState = getStockState(availableQty, minStockRaw > 0 ? minStockRaw : null);

  useEffect(() => {
    let cancelled = false;
    if (pendingQty <= 0) {
      setReservations([]);
      return;
    }
    api
      .getItemReservations(item.item_id)
      .then((rows) => {
        if (!cancelled) setReservations(rows);
      })
      .catch(() => {
        if (!cancelled) setReservations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [item.item_id, pendingQty]);

  return (
    <div className="space-y-4">
      {quickActionVariant === "mobile" ? (
        // 항목 3-7 — 모바일은 화면 공간 한계상 인라인 미리보기 대신 버튼 자리 고정.
        // 사진 있으면 "이미지 보기"(클릭→팝업), 없으면 같은 자리에 비활성 "이미지 없음".
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
        ) : (
          <div
            aria-disabled="true"
            className="flex w-full items-center justify-center gap-2 rounded-[18px] border px-4 py-3 text-sm font-bold"
            style={{
              borderColor: LEGACY_COLORS.border,
              background: LEGACY_COLORS.s2,
              color: LEGACY_COLORS.muted2,
              opacity: 0.6,
            }}
          >
            <ImageOff className="h-4 w-4" />
            이미지 없음
          </div>
        )
      ) : (
        // 데스크톱 — 기존 인라인 썸네일(사진 있을 때만, 무변경).
        imageFilename && (
          <section
            className="flex items-center justify-center rounded-[28px] border p-4"
            style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
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
      <section
        className="rounded-[28px] border p-5"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
      >
        <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          수량 현황
        </div>
        <div className="grid gap-3 text-base">
          <div className="grid grid-cols-2 gap-3">
            <div
              className="rounded-[18px] border px-4 py-3"
              style={{
                background: LEGACY_COLORS.s1,
                borderColor: pendingQty > 0
                  ? `color-mix(in srgb, ${LEGACY_COLORS.yellow} 40%, transparent)`
                  : LEGACY_COLORS.border,
              }}
            >
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                승인 대기 수량
              </div>
              <div
                className="mt-1 text-xl font-black"
                style={{ color: pendingQty > 0 ? LEGACY_COLORS.yellow : LEGACY_COLORS.text }}
              >
                {formatQty(pendingQty)}
              </div>
            </div>
            <div
              className="rounded-[18px] border px-4 py-3"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                사용 가능 재고
              </div>
              <div className="mt-1 text-xl font-black" style={{ color: availableState.color }}>
                {formatQty(availableQty)}
              </div>
            </div>
          </div>
          {item.supplier && (
            <div
              className="rounded-[18px] border px-4 py-3"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                공급처
              </div>
              <div className="mt-1 text-sm truncate">{item.supplier}</div>
            </div>
          )}
        </div>
      </section>

      {/* 승인 대기 요청 목록 */}
      {reservations.length > 0 && (
        <section
          className="rounded-[28px] border p-5"
          style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
        >
          <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
            승인 대기 요청 ({reservations.length}건)
          </div>
          <div className="space-y-2">
            {reservations.map((r) => (
              <div
                key={r.line_id}
                className="flex flex-wrap items-center gap-2 rounded-[14px] border px-3 py-2 text-sm"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <span className="font-bold">{r.requester_name}</span>
                <span style={{ color: LEGACY_COLORS.muted }}>
                  · {normalizeDepartment(r.requester_department)}
                </span>
                <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  창고 → {r.to_department ? normalizeDepartment(r.to_department) : "외부"}
                </span>
                <span className="ml-auto font-bold">{formatQty(r.quantity)} 개</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(Number(item.warehouse_qty) > 0 || (item.locations ?? []).some((l) => Number(l.quantity) > 0)) && (
        <InventoryDetailLocations item={item} getDeptColor={getDeptColor} />
      )}

      {/* BOM 하위 구성 */}
      {item.bom_completed_at != null && (
        <div>
          <button
            type="button"
            onClick={() => setShowBom((v) => !v)}
            className="flex w-full items-center gap-1.5 rounded-[14px] border px-4 py-2.5 text-sm font-semibold transition-colors"
            style={{
              borderColor: LEGACY_COLORS.border,
              background: showBom ? LEGACY_COLORS.s3 : LEGACY_COLORS.s2,
              color: LEGACY_COLORS.text,
            }}
          >
            {showBom ? <ChevronDown size={15} strokeWidth={2.5} /> : <ChevronRight size={15} strokeWidth={2.5} />}
            하위 구성 {showBom ? "접기" : "보기"}
          </button>
          {showBom && (
            <div className="mt-2">
              {/* 항목 2-1 — 모바일 빠른작업 변형일 때만 이름 탭 풀네임 펼침. 데스크톱은 hover title 유지. */}
              <BomSubExpander
                key={item.item_id}
                itemId={item.item_id}
                open={showBom}
                compact
                tapToExpandName={quickActionVariant === "mobile"}
              />
            </div>
          )}
        </div>
      )}

      {/* 빠른 작업 */}
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          빠른 작업
        </div>
        {quickActionVariant === "mobile" ? (
          // 항목 3 — 모바일: 입고(파랑)/출고(빨강) 나란히 + 선택 시 서브옵션을 아래 전폭 파스텔로.
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIoMenu((m) => (m === "in" ? null : "in"))}
                aria-pressed={ioMenu === "in"}
                className="w-full rounded-[18px] px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: LEGACY_COLORS.blue, opacity: ioMenu === "out" ? 0.55 : 1 }}
              >
                입고
              </button>
              <button
                type="button"
                onClick={() => setIoMenu((m) => (m === "out" ? null : "out"))}
                aria-pressed={ioMenu === "out"}
                className="w-full rounded-[18px] px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: LEGACY_COLORS.red, opacity: ioMenu === "in" ? 0.55 : 1 }}
              >
                출고
              </button>
            </div>
            {ioMenu && (
              <div className="flex flex-col gap-1.5">
                {(ioMenu === "in" ? inboundChoices(canReceive) : outboundChoices).map((choice) => {
                  const accent = ioMenu === "out" ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
                  return (
                    <button
                      key={choice.key}
                      type="button"
                      onClick={() => {
                        setIoMenu(null);
                        onGoToWarehouse(item, quickChoiceToIntent(choice.key));
                      }}
                      className="flex w-full flex-col items-start rounded-[14px] border px-4 py-3 text-left transition-opacity hover:opacity-90"
                      style={{
                        background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                        borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
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
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setIoMenu((m) => (m === "in" ? null : "in"))}
              className="w-full rounded-[18px] px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: LEGACY_COLORS.blue }}
            >
              입고
            </button>
            {ioMenu === "in" && (
                <div
                  className="flex w-[calc(200%+0.5rem)] flex-col gap-2 rounded-[14px] border p-3"
                style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
              >
                {inboundChoices(canReceive).map((choice, index) => (
                  <button
                    key={choice.key}
                    ref={index === 0 ? firstQuickChoiceRef : undefined}
                    type="button"
                    onClick={() => {
                      setIoMenu(null);
                      onGoToWarehouse(item, quickChoiceToIntent(choice.key));
                    }}
                    className="flex min-h-[64px] flex-col items-start justify-center rounded-[10px] px-3 py-3 text-left transition-colors hover:opacity-80"
                    style={{ background: LEGACY_COLORS.s3 }}
                  >
                    <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.text }}>
                      {choice.label}
                    </span>
                    <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                      {choice.desc}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setIoMenu((m) => (m === "out" ? null : "out"))}
              className="w-full rounded-[18px] px-4 py-3 text-sm font-bold transition-opacity hover:opacity-90"
              style={{ background: LEGACY_COLORS.red, color: LEGACY_COLORS.white }}
            >
              출고
            </button>
            {ioMenu === "out" && (
                <div
                  className="flex w-[calc(200%+0.5rem)] -translate-x-[calc(50%+0.25rem)] flex-col gap-2 rounded-[14px] border p-3"
                style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
              >
                {outboundChoices.map((choice, index) => (
                  <button
                    key={choice.key}
                    ref={index === 0 ? firstQuickChoiceRef : undefined}
                    type="button"
                    onClick={() => {
                      setIoMenu(null);
                      onGoToWarehouse(item, quickChoiceToIntent(choice.key));
                    }}
                    className="flex min-h-[64px] flex-col items-start justify-center rounded-[10px] px-3 py-3 text-left transition-colors hover:opacity-80"
                    style={{ background: LEGACY_COLORS.s3 }}
                  >
                    <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.text }}>
                      {choice.label}
                    </span>
                    <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                      {choice.desc}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        )}
      </div>

    </div>
  );
}
