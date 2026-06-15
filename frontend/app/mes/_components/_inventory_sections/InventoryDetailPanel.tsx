"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronRight } from "lucide-react";
import { api, type Item, type StockRequestReservationLine, type TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { formatQty } from "@/lib/mes/format";
import { getStockState } from "@/lib/mes/inventory";
import { ImageLightbox } from "@/lib/ui/ImageLightbox";
import { useDeptColorLookup } from "../DepartmentsContext";
import { InventoryDetailLogList } from "./InventoryDetailLogList";
import { InventoryDetailLocations } from "./InventoryDetailLocations";
import { BomSubExpander } from "../_warehouse_v2/BomSubExpander";
import { inboundChoices, outboundChoices, quickChoiceToIntent } from "../_warehouse_v2/ioWorkType";
import type { IoEntryIntent } from "../_warehouse_v2/types";

type Props = {
  item: Item;
  logs: TransactionLog[];
  onGoToWarehouse: (item: Item, intent?: IoEntryIntent) => void;
  canReceive?: boolean;
  imageFilename?: string;
};

export function InventoryDetailPanel({ item, logs, onGoToWarehouse, canReceive = false, imageFilename }: Props) {
  const getDeptColor = useDeptColorLookup();
  const [reservations, setReservations] = useState<StockRequestReservationLine[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showBom, setShowBom] = useState(false);
  const [ioMenu, setIoMenu] = useState<"in" | "out" | null>(null);

  // 품목이 바뀌면 BOM 접기 + 팝업 닫기
  useEffect(() => {
    setShowBom(false);
    setIoMenu(null);
  }, [item.item_id]);
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
      {imageFilename && (
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
          <ImageLightbox
            open={lightboxOpen}
            src={`/images/items/${imageFilename}`}
            alt={item.item_name}
            onClose={() => setLightboxOpen(false)}
          />
        </section>
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
              <BomSubExpander key={item.item_id} itemId={item.item_id} open={showBom} compact />
            </div>
          )}
        </div>
      )}

      {/* 빠른 작업 */}
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          빠른 작업
        </div>
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
                className="flex flex-col gap-1 rounded-[14px] border p-2"
                style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
              >
                {inboundChoices(canReceive).map((choice) => (
                  <button
                    key={choice.key}
                    type="button"
                    onClick={() => {
                      setIoMenu(null);
                      onGoToWarehouse(item, quickChoiceToIntent(choice.key));
                    }}
                    className="flex flex-col items-start rounded-[10px] px-3 py-2 text-left transition-colors hover:opacity-80"
                    style={{ background: LEGACY_COLORS.s3 }}
                  >
                    <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.text }}>
                      {choice.label}
                    </span>
                    <span className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
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
              style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text, border: `1px solid ${LEGACY_COLORS.border}` }}
            >
              출고
            </button>
            {ioMenu === "out" && (
              <div
                className="flex flex-col gap-1 rounded-[14px] border p-2"
                style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
              >
                {outboundChoices.map((choice) => (
                  <button
                    key={choice.key}
                    type="button"
                    onClick={() => {
                      setIoMenu(null);
                      onGoToWarehouse(item, quickChoiceToIntent(choice.key));
                    }}
                    className="flex flex-col items-start rounded-[10px] px-3 py-2 text-left transition-colors hover:opacity-80"
                    style={{ background: LEGACY_COLORS.s3 }}
                  >
                    <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.text }}>
                      {choice.label}
                    </span>
                    <span className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                      {choice.desc}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <InventoryDetailLogList logs={logs} />
    </div>
  );
}
