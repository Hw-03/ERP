"use client";

import { AlertTriangle, Zap } from "lucide-react";
import type { ProductionCapacity, ProductionCapacityStatus } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";

function resolveStatus(data: ProductionCapacity): ProductionCapacityStatus {
  if (data.status) return data.status;
  // 백엔드가 status 를 안 주는 구버전 응답 fallback.
  if (data.top_items.length === 0) return "bom_not_registered";
  if (data.immediate > 0 || data.maximum > 0) return "producible";
  return "not_producible";
}

export function InventoryCapacityPanel({
  capacityData,
  onClick,
}: {
  capacityData: ProductionCapacity | null | undefined;
  onClick?: () => void;
}) {
  if (!capacityData) return null;
  const interactive = typeof onClick === "function";
  const status = resolveStatus(capacityData);
  const showBottleneck =
    (status === "producible" || status === "not_producible") && !!capacityData.limiting_item;

  const accent =
    status === "producible"
      ? LEGACY_COLORS.cyan
      : status === "not_producible"
        ? LEGACY_COLORS.yellow
        : LEGACY_COLORS.muted2;

  const baseStyle = {
    background: `color-mix(in srgb, ${accent} 8%, transparent)`,
    borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
  };
  const className =
    "mt-3 flex w-full flex-wrap items-center gap-4 rounded-[14px] border px-5 py-4 text-left" +
    (interactive ? " cursor-pointer transition-opacity hover:opacity-90" : "");

  const heading = (() => {
    switch (status) {
      case "no_target":
        return "생산 가능 품목 없음";
      case "bom_not_registered":
        return "BOM 미등록";
      case "not_producible":
        return "생산 불가";
      case "producible":
      default:
        return "생산 가능";
    }
  })();

  const subline = (() => {
    switch (status) {
      case "no_target":
        return "BOM/완제품 기준 확인 필요";
      case "bom_not_registered":
        return "생산 가능 수량 계산 불가";
      case "not_producible":
        return `즉시 ${formatQty(capacityData.immediate)} / 최대 ${formatQty(capacityData.maximum)}`;
      case "producible":
      default:
        return null;
    }
  })();

  const inner = (
    <>
      <Zap className="h-5 w-5 shrink-0" style={{ color: accent }} />
      <span className="text-base font-semibold" style={{ color: accent }}>
        {heading}
      </span>
      {status === "producible" ? (
        <>
          <span className="text-lg font-black" style={{ color: LEGACY_COLORS.cyan }}>
            즉시 {formatQty(capacityData.immediate)}
          </span>
          <span className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>/</span>
          <span className="text-lg font-black" style={{ color: LEGACY_COLORS.blue }}>
            최대 {formatQty(capacityData.maximum)}
          </span>
        </>
      ) : (
        subline && (
          <span className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
            {subline}
          </span>
        )
      )}
      {showBottleneck && (
        <span
          className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)`,
            color: LEGACY_COLORS.yellow,
          }}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          병목 부품: {capacityData.limiting_item}
        </span>
      )}
    </>
  );
  if (interactive) {
    return (
      <button type="button" className={className} style={baseStyle} onClick={onClick} title="생산 가능수량 상세">
        {inner}
      </button>
    );
  }
  return (
    <div className={className} style={baseStyle}>
      {inner}
    </div>
  );
}
