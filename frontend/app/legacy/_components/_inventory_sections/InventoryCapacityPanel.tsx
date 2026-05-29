"use client";

import { AlertTriangle, Zap } from "lucide-react";
import type {
  ProductionCapacity,
  ProductionCapacityItem,
  ProductionCapacityStatus,
} from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { getModelLabel } from "@/lib/mes/model-labels";

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
  const reps: ProductionCapacityItem[] = capacityData.representative_items ?? [];
  const hasReps = reps.length > 0;

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
    "flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[14px] border px-3 py-3 text-left lg:gap-x-4 lg:px-5 lg:py-4" +
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

  // representative_items 없는 fallback (status≠producible 또는 model_symbol 미설정).
  const fallbackSubline = (() => {
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
      <span className="text-base font-semibold shrink-0" style={{ color: accent }}>
        {heading}
      </span>
      {status === "producible" && hasReps ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          {reps.map((rep, idx) => (
            <RepresentativeChip key={rep.item_id} item={rep} showSep={idx > 0} />
          ))}
        </div>
      ) : status === "producible" ? (
        // representative_items 비어 있고 producible — 구버전/모델 미설정 케이스.
        <span className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
          모델 정보 없음 — 상세 확인
        </span>
      ) : (
        fallbackSubline && (
          <span className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
            {fallbackSubline}
          </span>
        )
      )}
      {interactive && (
        <span className="ml-auto shrink-0 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
          자세히 보기
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

function RepresentativeChip({
  item,
  showSep,
}: {
  item: ProductionCapacityItem;
  showSep: boolean;
}) {
  // 모델 표시명 = 매핑 dict 우선, fallback 으로 PF 이름 첫 토큰.
  const label = getModelLabel(item.model_symbol, item.item_name) || item.item_name;
  const isZero = item.immediate === 0;
  return (
    <span className="inline-flex shrink-0 items-baseline gap-1 text-sm">
      {showSep && (
        <span aria-hidden style={{ color: LEGACY_COLORS.muted2 }}>
          ·
        </span>
      )}
      <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>
        {label}
      </span>
      <span
        className="font-black"
        style={{ color: isZero ? LEGACY_COLORS.yellow : LEGACY_COLORS.cyan }}
      >
        {formatQty(item.immediate)}
      </span>
      <span style={{ color: LEGACY_COLORS.muted2 }}>/</span>
      <span className="font-bold" style={{ color: LEGACY_COLORS.blue }}>
        {formatQty(item.maximum)}
      </span>
      {isZero && item.limiting_item && (
        <span
          className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 18%, transparent)`,
            color: LEGACY_COLORS.yellow,
          }}
          title={`병목: ${item.limiting_item}`}
        >
          <AlertTriangle className="h-3 w-3" />
          {item.limiting_item}
        </span>
      )}
    </span>
  );
}
