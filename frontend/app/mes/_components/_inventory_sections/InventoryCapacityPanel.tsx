"use client";

import { AlertTriangle, Zap } from "lucide-react";
import type {
  ProductionCapacity,
  ProductionCapacityItem,
  ProductionCapacityStatus,
} from "@/lib/api";
import type {
  ProductionCapacityAfBlock,
  ProductionCapacityAfStatus,
} from "@/lib/api/types/production";
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

const SHARED_HINT =
  "합계는 AF별 독립 계산값 — 같은 하위 자재를 공유하면 모든 수량을 동시에 보장하지는 않음";

export function InventoryCapacityPanel({
  capacityData,
  onClick,
}: {
  capacityData: ProductionCapacity | null | undefined;
  onClick?: () => void;
}) {
  if (!capacityData) return null;
  const interactive = typeof onClick === "function";

  // AF 블록이 있으면 AF 기준 3수량을 우선 표시. 없으면 legacy(즉시/최대) fallback.
  return capacityData.af ? (
    <AfPanel af={capacityData.af} interactive={interactive} onClick={onClick} />
  ) : (
    <LegacyPanel capacityData={capacityData} interactive={interactive} onClick={onClick} />
  );
}

// ── AF 기준 패널 ────────────────────────────────────────────────────────────
function afAccent(status: ProductionCapacityAfStatus): string {
  switch (status) {
    case "producible":
      return LEGACY_COLORS.cyan;
    case "incomplete":
    case "not_producible":
      return LEGACY_COLORS.yellow;
    default:
      return LEGACY_COLORS.muted2;
  }
}

function afHeading(status: ProductionCapacityAfStatus): string {
  switch (status) {
    case "producible":
      return "생산 가능";
    case "incomplete":
      return "생산 가능 · 일부 BOM 미완성";
    case "not_producible":
      return "생산 불가";
    case "bom_not_registered":
      return "BOM 미등록";
    case "no_target":
    default:
      return "조립 완제품 없음";
  }
}

function AfPanel({
  af,
  interactive,
  onClick,
}: {
  af: ProductionCapacityAfBlock;
  interactive: boolean;
  onClick?: () => void;
}) {
  const accent = afAccent(af.status);
  const showStats =
    af.status === "producible" ||
    af.status === "incomplete" ||
    af.status === "not_producible";

  const subline = (() => {
    switch (af.status) {
      case "bom_not_registered":
        return "AF 직계 BOM 미등록 — 생산 가능 수량 계산 불가";
      case "no_target":
        return "AF(조립 완제품) 기준 품목 없음";
      default:
        return null;
    }
  })();

  const baseStyle = {
    background: `color-mix(in srgb, ${accent} 8%, transparent)`,
    borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
  };
  const className =
    "flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[14px] border px-3 py-3 text-left lg:gap-x-4 lg:px-5 lg:py-4" +
    (interactive ? " cursor-pointer transition-opacity hover:opacity-90" : "");

  const inner = (
    <>
      <Zap className="h-5 w-5 shrink-0" style={{ color: accent }} />
      <span className="shrink-0 text-base font-semibold" style={{ color: accent }}>
        {afHeading(af.status)}
      </span>
      {showStats ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          <AfStat label="출하준비" value={af.summary.ship_ready} color={LEGACY_COLORS.cyan} />
          <AfStat label="빠른조립" value={af.summary.fast_assembly} color={LEGACY_COLORS.blue} />
          <AfStat label="총생산" value={af.summary.total_production} color={LEGACY_COLORS.purple} />
          <span className="inline-flex shrink-0" aria-label={SHARED_HINT} title={SHARED_HINT}>
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.muted2 }} />
          </span>
        </div>
      ) : (
        subline && (
          <span className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
            {subline}
          </span>
        )
      )}
      {interactive && (
        <span
          className="mt-0.5 w-full shrink-0 text-right text-sm lg:mt-0 lg:ml-auto lg:w-auto"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
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

function AfStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="inline-flex shrink-0 items-baseline gap-1">
      <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </span>
      <span className="text-base font-black" style={{ color }}>
        {formatQty(value)}
      </span>
    </span>
  );
}

// ── Legacy 패널 (af 미존재 — 구버전 응답 fallback) ────────────────────────────
function LegacyPanel({
  capacityData,
  interactive,
  onClick,
}: {
  capacityData: ProductionCapacity;
  interactive: boolean;
  onClick?: () => void;
}) {
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
        <span
          className="mt-0.5 w-full shrink-0 text-right text-sm lg:mt-0 lg:ml-auto lg:w-auto"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
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
