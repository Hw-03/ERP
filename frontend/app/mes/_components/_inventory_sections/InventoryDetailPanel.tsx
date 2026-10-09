"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronRight, Eye } from "lucide-react";
import { api, type Item, type StockRequestReservationLine } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { formatQty } from "@/lib/mes/format";
import { getStockState, totalApprovalPending } from "@/lib/mes/inventory";
import { ImageLightbox } from "@/lib/ui/ImageLightbox";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import { useDeptColorLookup } from "../DepartmentsContext";
import { DesktopRightPanelFooter } from "../DesktopRightPanel";
import { InventoryDetailLocations } from "./InventoryDetailLocations";
import { getManagedStockBreakdown, STOCK_CATEGORY_ORDER, STOCK_CATEGORY_STYLES } from "./inventoryManagedStock";
import { BomDetailModal } from "./BomDetailModal";
import { inboundChoices, outboundChoices, quickChoiceToIntent } from "../_warehouse_v2/ioWorkType";
import type { IoEntryIntent } from "../_warehouse_v2/types";
import { ReadFailure, ReadLoading } from "../common/ReadState";
import { SkeletonBlock, dataRevealClassName } from "../common/LoadingSkeleton";

const mix = (color: string, amount: number, base = "transparent") =>
  `color-mix(in srgb, ${color} ${amount}%, ${base})`;

function reservationSourceLabel(reservation: StockRequestReservationLine): string {
  if (reservation.from_bucket === "production") {
    return `${reservation.from_department ? normalizeDepartment(reservation.from_department) : "부서"} 생산`;
  }
  if (reservation.from_bucket === "defective") {
    return `${reservation.from_department ? normalizeDepartment(reservation.from_department) : "부서"} 불량`;
  }
  return "창고";
}

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
  const revision = useRealtimeRevision();
  const getDeptColor = useDeptColorLookup();
  const [reservationRows, setReservations] = useState<StockRequestReservationLine[]>([]);
  const reservationsItemRef = useRef<string | null>(null);
  const [reservationFailure, setReservationFailure] = useState<{ itemId: string; message: string; refresh: boolean } | null>(null);
  const [reservationRetry, setReservationRetry] = useState(0);
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
  const pendingQty = totalApprovalPending(item);
  const availableQty = Number(item.available_quantity) || 0;
  const managedStock = getManagedStockBreakdown(item);
  const managedTotals = STOCK_CATEGORY_ORDER.map((category) => {
    const { label, color } = STOCK_CATEGORY_STYLES[category];
    const sum = managedStock.filter((entry) => entry.management_category === category)
      .reduce((total, entry) => total + Number(entry.quantity), 0);
    return {
      category,
      label,
      color: category === "DEFECT" ? LEGACY_COLORS.red : color,
      quantity: category === "DEFECT" && item.defective_breakdown == null ? Number(item.defective_total ?? sum) : sum,
    };
  }).filter((entry) => entry.quantity > 0);
  const minStockRaw = item.min_stock == null ? 0 : Number(item.min_stock);
  const availableState = getStockState(availableQty, minStockRaw > 0 ? minStockRaw : null);
  const reservations = reservationsItemRef.current === item.item_id ? reservationRows : [];
  const currentReservationFailure = reservationFailure?.itemId === item.item_id ? reservationFailure : null;
  const reservationsLoading = pendingQty > 0 && reservationsItemRef.current !== item.item_id && !currentReservationFailure;
  const managedCards = managedTotals.map(({ category, label, color, quantity }) => (
    <div key={category}
      className={mobile ? "min-w-0 rounded-[12px] px-2 py-1 text-center" : "min-w-0 rounded-[18px] border px-2 py-3 text-center"}
      style={{ background: LEGACY_COLORS.s1, borderColor: mix(color, 40) }}>
      <div className="whitespace-nowrap text-xs tracking-tight" style={{ color: LEGACY_COLORS.muted2 }}>{label} 재고</div>
      <div className={mobile ? "mt-1 break-all font-sans text-xl font-medium leading-7" : "mt-1 break-all text-xl font-black"} style={{ color }}>
        {formatQty(quantity)}
      </div>
    </div>
  ));

  useEffect(() => {
    let cancelled = false;
    setReservationFailure(null);
    if (reservationsItemRef.current !== item.item_id) {
      setReservations([]);
    }
    if (pendingQty <= 0) {
      reservationsItemRef.current = item.item_id;
      setReservations([]);
      return;
    }
    api
      .getItemReservations(item.item_id)
      .then((rows) => {
        if (!cancelled) {
          reservationsItemRef.current = item.item_id;
          setReservations(rows);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) setReservationFailure({
          itemId: item.item_id,
          message: caught instanceof Error ? caught.message : "승인 대기 요청을 불러오지 못했습니다.",
          refresh: reservationsItemRef.current === item.item_id,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [item.item_id, pendingQty, revision, reservationRetry]);

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
                className="block h-40 w-40 rounded-[14px] object-contain"
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
        className={mobile ? "rounded-[20px] border px-3 py-2" : "rounded-[28px] border p-5"}
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
      >
        <div className={mobile ? "mb-1 text-sm font-semibold" : "mb-3 text-sm font-bold uppercase tracking-[0.18em]"} style={{ color: mobile ? LEGACY_COLORS.text : LEGACY_COLORS.muted2 }}>
          수량 현황
        </div>
        <div className="grid gap-3 text-base">
          <div className={`grid ${managedTotals.length === 1 ? "grid-cols-3" : "grid-cols-2"} gap-3`}>
            <div
              className={mobile ? "min-w-0 rounded-[12px] px-2 py-1 text-center" : "min-w-0 rounded-[18px] border px-2 py-3 text-center"}
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="whitespace-nowrap text-xs tracking-tight" style={{ color: LEGACY_COLORS.muted2 }}>
                사용 가능 재고
              </div>
              <div className={mobile ? "mt-1 break-all font-sans text-xl font-medium leading-7" : "mt-1 text-xl font-black"} style={{ color: availableState.color }}>
                {formatQty(availableQty)}
              </div>
            </div>
            <div
              className={mobile ? "min-w-0 rounded-[12px] px-2 py-1 text-center" : "min-w-0 rounded-[18px] border px-2 py-3 text-center"}
              style={{
                background: LEGACY_COLORS.s1,
                borderColor: pendingQty > 0
                  ? mix(LEGACY_COLORS.yellow, 40)
                  : LEGACY_COLORS.border,
              }}
            >
              <div className="whitespace-nowrap text-xs tracking-tight" style={{ color: LEGACY_COLORS.muted2 }}>
                승인 대기 수량
              </div>
              <div
                className={mobile ? "mt-1 break-all font-sans text-xl font-medium leading-7" : "mt-1 text-xl font-black"}
                style={{ color: pendingQty > 0 ? LEGACY_COLORS.yellow : LEGACY_COLORS.text }}
              >
                {formatQty(pendingQty)}
              </div>
            </div>
            {managedTotals.length === 1 && managedCards}
          </div>
          {managedTotals.length > 1 && <div className={`grid ${managedTotals.length === 3 ? "grid-cols-3" : "grid-cols-2"} gap-3`}>{managedCards}</div>}
          {item.supplier && (
            <div
              className={mobile ? "border-t pt-3" : "rounded-[18px] border px-4 py-3"}
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                공급처
              </div>
              <div className={mobile ? "mt-1 break-words text-sm" : "mt-1 text-sm truncate"}>{item.supplier}</div>
            </div>
          )}
        </div>
      </section>

      {/* 승인 대기 요청 목록 */}
      {(reservations.length > 0 || (mobile && pendingQty > 0 && (reservationsLoading || currentReservationFailure))) && (
        <section
          className={mobile ? "border-t" : "rounded-[28px] border p-5"}
          style={{ borderColor: LEGACY_COLORS.border, background: mobile ? "transparent" : LEGACY_COLORS.s2 }}
        >
          <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
            승인 대기 요청{reservations.length > 0 ? ` (${reservations.length}건)` : ""}
          </div>
          {mobile && currentReservationFailure && <ReadFailure message={currentReservationFailure.message} refresh={currentReservationFailure.refresh}
            onRetry={() => { setReservationFailure(null); setReservationRetry((value) => value + 1); }} />}
          {mobile && reservationsLoading ? <ReadLoading label="승인 대기 요청을 불러오는 중" skeleton={
            <div className="space-y-2">{[0, 1].map((index) => <div key={index} data-testid="reservation-skeleton-row"
              className="flex min-h-11 flex-wrap items-center gap-2 rounded-[14px] border px-3 py-2" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
              <SkeletonBlock className="h-5 w-20" /><SkeletonBlock className="h-4 w-16" />
              <SkeletonBlock className="h-4 w-24" /><SkeletonBlock className="ml-auto h-5 w-12" />
            </div>)}</div>
          } /> : <div className={`space-y-2 ${mobile ? dataRevealClassName : ""}`}>
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
                  {reservationSourceLabel(r)} → {r.to_department ? normalizeDepartment(r.to_department) : "외부"}
                </span>
                <span className="ml-auto font-bold">{formatQty(r.quantity)} 개</span>
              </div>
            ))}
          </div>}
        </section>
      )}

      {(Number(item.warehouse_qty) > 0 || (item.locations ?? []).some((l) => Number(l.quantity) > 0)) && (
        <InventoryDetailLocations item={item} getDeptColor={getDeptColor} mobile={mobile} />
      )}

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
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          빠른 작업
        </div>
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
