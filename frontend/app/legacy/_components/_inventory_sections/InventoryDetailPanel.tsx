"use client";

import { useEffect, useState } from "react";
import { api, type Item, type StockRequestReservationLine, type TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "../legacyUi";
import { normalizeDepartment } from "@/lib/mes/department";
import { normalizeModel } from "@/lib/mes/item";
import { formatQty } from "@/lib/mes/format";
import { useDeptColorLookup } from "../DepartmentsContext";
import { InventoryDetailLogList } from "./InventoryDetailLogList";
import { InventoryDetailLocations } from "./InventoryDetailLocations";

type Props = {
  item: Item;
  logs: TransactionLog[];
  onGoToWarehouse: (item: Item) => void;
};

export function InventoryDetailPanel({ item, logs, onGoToWarehouse }: Props) {
  const getDeptColor = useDeptColorLookup();
  const [reservations, setReservations] = useState<StockRequestReservationLine[]>([]);
  const pendingQty = Number(item.pending_quantity) || 0;
  const availableQty = Number(item.available_quantity) || 0;

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
      {/* 품목 정보 */}
      <section
        className="rounded-[28px] border p-5"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
      >
        <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          품목 정보
        </div>
        <div className="grid gap-3 text-base">
          {item.erp_code && (
            <div
              className="rounded-[18px] border px-4 py-3"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                품목 코드
              </div>
              <div className="mt-1 text-base font-bold" style={{ color: LEGACY_COLORS.blue }}>
                {item.erp_code}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="rounded-[18px] border px-4 py-3"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                현재고
              </div>
              <div className="mt-1 text-xl font-black">{formatQty(item.quantity)}</div>
            </div>
            <div
              className="rounded-[18px] border px-4 py-3"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                안전재고
              </div>
              <div className="mt-1 text-xl font-black">
                {item.min_stock == null ? "-" : formatQty(item.min_stock)}
              </div>
            </div>
          </div>
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
              <div className="mt-1 text-xl font-black" style={{ color: LEGACY_COLORS.green }}>
                {formatQty(availableQty)}
              </div>
            </div>
          </div>
          <div
            className="rounded-[18px] border px-4 py-3"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              모델
            </div>
            <div className="mt-1 text-base">{normalizeModel(item.legacy_model)}</div>
          </div>
          {(item.unit || item.supplier) && (
            <div className="grid grid-cols-2 gap-3">
              <div
                className="rounded-[18px] border px-4 py-3"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  단위
                </div>
                <div className="mt-1 text-base">{item.unit || "-"}</div>
              </div>
              <div
                className="rounded-[18px] border px-4 py-3"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  공급처
                </div>
                <div className="mt-1 text-sm truncate">{item.supplier || "-"}</div>
              </div>
            </div>
          )}
          {item.spec && (
            <div
              className="rounded-[18px] border px-4 py-3"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                스펙
              </div>
              <div className="mt-1 text-base">{item.spec}</div>
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

      {/* 빠른 작업 */}
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          빠른 작업
        </div>
        <button
          onClick={() => onGoToWarehouse(item)}
          className="w-full rounded-[18px] px-4 py-3.5 text-base font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: LEGACY_COLORS.blue }}
        >
          입출고 진행
        </button>
      </div>

      <InventoryDetailLogList logs={logs} />
    </div>
  );
}
