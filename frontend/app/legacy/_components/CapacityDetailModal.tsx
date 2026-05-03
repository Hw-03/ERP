"use client";

import type { ProductionCapacity } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";

/**
 * Round-13 (#18) 추출 — DesktopLegacyShell 의 생산 가능수량 상세 모달.
 */
export function CapacityDetailModal({
  capacityData,
  onClose,
}: {
  capacityData: ProductionCapacity | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] rounded-[28px] border p-7"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-base font-black" style={{ color: LEGACY_COLORS.text }}>
          생산 가능수량 상세
        </div>
        {capacityData && capacityData.top_items.length > 0 ? (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-[18px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                <div className="text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
                  즉시 생산 가능
                </div>
                <div className="mt-1 text-[22px] font-black" style={{ color: LEGACY_COLORS.cyan }}>
                  {formatQty(capacityData.immediate)}
                </div>
              </div>
              <div className="rounded-[18px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                <div className="text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
                  최대 생산 가능
                </div>
                <div className="mt-1 text-[22px] font-black" style={{ color: LEGACY_COLORS.blue }}>
                  {formatQty(capacityData.maximum)}
                </div>
              </div>
            </div>
            {capacityData.limiting_item && (
              <div
                className="mb-4 rounded-[14px] border px-4 py-3 text-sm"
                style={{ background: "rgba(255,136,0,.08)", borderColor: "rgba(255,136,0,.25)", color: LEGACY_COLORS.yellow }}
              >
                병목 부품: <span className="font-bold">{capacityData.limiting_item}</span>
              </div>
            )}
            <div className="max-h-52 overflow-y-auto rounded-[16px] border" style={{ borderColor: LEGACY_COLORS.border }}>
              <div
                className="grid grid-cols-[1fr_80px_80px] border-b px-4 py-2 text-sm font-bold uppercase tracking-[0.15em]"
                style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
              >
                <span>품목</span>
                <span className="text-right">즉시</span>
                <span className="text-right">최대</span>
              </div>
              {capacityData.top_items.map((item, i) => (
                <div
                  key={item.item_id}
                  className="grid grid-cols-[1fr_80px_80px] items-center px-4 py-2.5"
                  style={{ borderBottom: i === capacityData.top_items.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}
                >
                  <div>
                    <div className="truncate text-sm" style={{ color: LEGACY_COLORS.text }}>{item.item_name}</div>
                    <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{item.erp_code}</div>
                  </div>
                  <div className="text-right text-sm font-bold" style={{ color: LEGACY_COLORS.cyan }}>
                    {formatQty(item.immediate)}
                  </div>
                  <div className="text-right text-sm" style={{ color: LEGACY_COLORS.blue }}>
                    {formatQty(item.maximum)}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="mb-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            {capacityData == null ? "데이터를 불러오는 중…" : "BOM이 등록된 품목이 없습니다."}
          </div>
        )}
        <button
          className="mt-5 w-full rounded-[18px] border py-3 text-base font-semibold"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          onClick={onClose}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
