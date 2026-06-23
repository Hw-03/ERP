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
import { groupAfByModel, getPinnedPfNumbers, type ModelCapacityGroup } from "@/lib/mes/capacity";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { getModelLabel } from "@/lib/mes/model-labels";
import { usePfPinsQuery } from "@/lib/queries/useProductionQuery";

function resolveStatus(data: ProductionCapacity): ProductionCapacityStatus {
  if (data.status) return data.status;
  // 백엔드가 status 를 안 주는 구버전 응답 fallback.
  if (data.top_items.length === 0) return "bom_not_registered";
  if (data.immediate > 0 || data.maximum > 0) return "producible";
  return "not_producible";
}

const SHARED_HINT =
  "모델별 값은 모델 내 AF 합계 — 같은 하위 자재를 공유하면 모든 수량을 동시에 보장하지는 않음";

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

/**
 * 생산 가능 상태 배지 — 모바일 대시보드의 접기 버튼 우측에 표시(항목 1 A안).
 * af 블록이 있으면 AF 상태, 없으면 legacy status 로 매핑.
 */
export function capacityStatusBadge(
  data: ProductionCapacity | null | undefined,
): { label: string; color: string } | null {
  if (!data) return null;
  if (data.af) {
    const s = data.af.status;
    const label =
      s === "producible"
        ? "생산 가능"
        : s === "incomplete"
          ? "일부 미완성"
          : s === "not_producible"
            ? "생산 불가"
            : s === "bom_not_registered"
              ? "BOM 미등록"
              : "대상 없음";
    return { label, color: afAccent(s) };
  }
  const status = resolveStatus(data);
  const label =
    status === "producible"
      ? "생산 가능"
      : status === "not_producible"
        ? "생산 불가"
        : status === "bom_not_registered"
          ? "BOM 미등록"
          : "생산 가능 품목 없음";
  const color =
    status === "producible"
      ? LEGACY_COLORS.cyan
      : status === "not_producible"
        ? LEGACY_COLORS.yellow
        : LEGACY_COLORS.muted2;
  return { label, color };
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
  const { data: pfPins = {} } = usePfPinsQuery();
  const accent = afAccent(af.status);
  const showStats =
    af.status === "producible" ||
    af.status === "incomplete" ||
    af.status === "not_producible";
  const groups = showStats ? groupAfByModel(af.items) : [];

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
      {/* ── 모바일 전용: 표 레이아웃 (항목 1 A안 — 헤더 줄 제거, 상태는 외부 토글 배지로 이동) ── */}
      <div className="flex w-full flex-col gap-2 sm:hidden">
        {showStats ? (
          <table className="w-full table-fixed text-right text-sm">
            <thead>
              <tr>
                <th className="pb-1 text-left text-xs font-bold" />
                <th className="w-16 whitespace-nowrap pb-1 text-xs font-bold" style={{ color: LEGACY_COLORS.cyan }}>출하 대기</th>
                <th className="w-16 whitespace-nowrap pb-1 text-xs font-bold" style={{ color: LEGACY_COLORS.blue }}>빠른 조립</th>
                <th className="w-16 pb-1 text-xs font-bold" style={{ color: LEGACY_COLORS.purple }}>총생산</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const pinned = getPinnedPfNumbers(g.key, pfPins, af);
                return (
                  <tr key={g.key}>
                    <td className="max-w-0 py-0.5 pr-2 text-left font-bold" style={{ color: LEGACY_COLORS.text }}>
                      <div className="truncate">{g.label}</div>
                    </td>
                    <td
                      className="py-0.5 font-black"
                      style={{ color: pinned && pinned.ship_ready > 0 ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2 }}
                    >
                      {pinned ? formatQty(pinned.ship_ready) : "—"}
                    </td>
                    <td
                      className="py-0.5 font-black"
                      style={{ color: pinned && pinned.fast_production > 0 ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}
                    >
                      {pinned ? formatQty(pinned.fast_production) : "—"}
                    </td>
                    <td
                      className="py-0.5 font-bold"
                      style={{ color: pinned && pinned.total_production > 0 ? LEGACY_COLORS.purple : LEGACY_COLORS.muted2 }}
                    >
                      {pinned ? formatQty(pinned.total_production) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          subline && (
            <span className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
              {subline}
            </span>
          )
        )}
      </div>

      {/* ── 데스크톱 전용: 원래 인라인 칩 ── */}
      <Zap className="hidden h-5 w-5 shrink-0 sm:block" style={{ color: accent }} />
      <span className="hidden shrink-0 text-base font-semibold sm:inline" style={{ color: accent }}>
        {afHeading(af.status)}
      </span>
      {showStats ? (
        <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 sm:flex">
          <ModelLegend />
          {groups.map((g, idx) => (
            <ModelChip key={g.key} group={g} showSep={idx > 0} pinned={getPinnedPfNumbers(g.key, pfPins, af)} />
          ))}
          <span className="inline-flex shrink-0" aria-label={SHARED_HINT} title={SHARED_HINT}>
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.muted2 }} />
          </span>
        </div>
      ) : (
        subline && (
          <span className="hidden text-base sm:inline" style={{ color: LEGACY_COLORS.muted2 }}>
            {subline}
          </span>
        )
      )}
      {interactive && (
        <span
          className="mt-0.5 hidden w-full shrink-0 text-right text-sm sm:block lg:mt-0 lg:ml-auto lg:w-auto"
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

// 색 의미 안내(한 번): 출하(청록)/조립(파랑)/총생산(보라).
function ModelLegend() {
  return (
    <span className="inline-flex shrink-0 items-baseline gap-1 text-xs font-bold">
      <span style={{ color: LEGACY_COLORS.cyan }}>출하</span>
      <span style={{ color: LEGACY_COLORS.muted2 }}>/</span>
      <span style={{ color: LEGACY_COLORS.blue }}>조립</span>
      <span style={{ color: LEGACY_COLORS.muted2 }}>/</span>
      <span style={{ color: LEGACY_COLORS.purple }}>총생산</span>
    </span>
  );
}

// 모델별 칩: 모델명 + 출하/조립/총생산 3수량(색 구분).
function ModelChip({
  group,
  showSep,
  pinned,
}: {
  group: ModelCapacityGroup;
  showSep: boolean;
  pinned: { ship_ready: number; fast_production: number; total_production: number } | null;
}) {
  return (
    <span className="inline-flex shrink-0 items-baseline gap-1 text-sm">
      {showSep && (
        <span aria-hidden style={{ color: LEGACY_COLORS.muted2 }}>
          ·
        </span>
      )}
      <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>
        {group.label}
      </span>
      <span className="font-black" style={{ color: pinned ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2 }}>
        {pinned ? formatQty(pinned.ship_ready) : "—"}
      </span>
      <span style={{ color: LEGACY_COLORS.muted2 }}>/</span>
      <span className="font-black" style={{ color: pinned ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}>
        {pinned ? formatQty(pinned.fast_production) : "—"}
      </span>
      <span style={{ color: LEGACY_COLORS.muted2 }}>/</span>
      <span className="font-bold" style={{ color: pinned ? LEGACY_COLORS.purple : LEGACY_COLORS.muted2 }}>
        {pinned ? formatQty(pinned.total_production) : "—"}
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
