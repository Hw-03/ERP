import { useEffect, useState } from "react";
import { Activity, ArrowRight, ChevronDown, Clock3, MapPin, UserRound } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatHistoryDateTimeLong } from "./historyFormat";
import type {
  HistoryDetailSummary,
  HistoryDetailImpact,
  HistoryDetailSummaryTone,
} from "./historyDetailSummary";

const STATUS_COLORS: Record<HistoryDetailSummaryTone, string> = {
  success: LEGACY_COLORS.green,
  warning: LEGACY_COLORS.yellow,
  danger: LEGACY_COLORS.red,
  muted: LEGACY_COLORS.muted2,
};

export function HistoryKeyPointSummary({
  summary,
  impactStatus = "ready",
  onRetryImpact,
  onImpactClick,
}: {
  summary: HistoryDetailSummary;
  impactStatus?: "ready" | "loading" | "error";
  onRetryImpact?: () => void;
  onImpactClick?: (impact: HistoryDetailImpact) => void;
}) {
  const statusColor = STATUS_COLORS[summary.status.tone];
  const [expandedImpactGroups, setExpandedImpactGroups] = useState<Set<string>>(new Set());
  const hasMultipleImpactLocations = summary.impactGroups.length > 1;

  useEffect(() => {
    setExpandedImpactGroups(new Set());
  }, [summary.impactIdentity]);

  const toggleImpactGroup = (key: string) => {
    setExpandedImpactGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section
      data-testid="history-key-point-summary"
      className="overflow-hidden rounded-[20px] border"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0">
          <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            작업
          </div>
          <div className="mt-1 text-base font-black" style={{ color: LEGACY_COLORS.text }}>
            {summary.operationLabel}
          </div>
        </div>
        <span
          className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-bold"
          style={{
            background: `color-mix(in srgb, ${statusColor} 14%, transparent)`,
            color: statusColor,
          }}
        >
          {summary.status.label}
        </span>
      </div>

      <div
        className="grid gap-2 border-t px-4 py-3 text-xs sm:grid-cols-2"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <UserRound className="h-4 w-4 shrink-0" />
          <span>요청자</span>
          <span className="truncate font-bold" style={{ color: LEGACY_COLORS.text }}>
            {summary.requester.name}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Clock3 className="h-4 w-4 shrink-0" />
          <span className="font-medium leading-snug">{formatHistoryDateTimeLong(summary.requester.at)}</span>
        </div>
      </div>

      {summary.flow && (
        <div className="border-t px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="mb-2 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            위치 / 이동 경로
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            <MapPin className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
            <span className="rounded-full border px-2.5 py-0.5 font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
              {summary.flow.from ?? summary.flow.label}
            </span>
            {summary.flow.from && summary.flow.to && summary.flow.from !== summary.flow.to && (
              <>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
                <span className="rounded-full border px-2.5 py-0.5 font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
                  {summary.flow.to}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {summary.conversion && (
        <div className="border-t px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="mb-2 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            품목 전환
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <ConversionEndpoint endpoint={summary.conversion.source} align="left" />
            <ArrowRight className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
            <ConversionEndpoint endpoint={summary.conversion.target} align="right" />
          </div>
        </div>
      )}

      {(impactStatus !== "ready" || summary.impactGroups.length > 0) && (
        <div className="border-t" style={{ borderColor: LEGACY_COLORS.border }}>
          <div
            className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-xs font-bold"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            <Activity className="h-4 w-4" />
            실제 영향
          </div>
          {impactStatus === "loading" && (
            <div className="px-4 pb-3 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              실제 영향 불러오는 중
            </div>
          )}
          {impactStatus === "error" && (
            <div className="flex items-center justify-between gap-3 px-4 pb-3 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              <span>실제 영향을 불러오지 못했습니다.</span>
              {onRetryImpact && (
                <button
                  type="button"
                  onClick={onRetryImpact}
                  className="rounded-full border px-2.5 py-1 font-bold"
                  style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}
                >
                  실제 영향 다시 불러오기
                </button>
              )}
            </div>
          )}
          {impactStatus === "ready" && summary.impactGroups.map((group) => {
            const isExpanded = !hasMultipleImpactLocations || expandedImpactGroups.has(group.key);
            const amount = getImpactGroupAmount(group.effects);
            const contentId = `history-impact-${summary.impactIdentity}-${group.key}`;

            return (
              <div key={group.key} className="px-4 pb-3">
                {hasMultipleImpactLocations && (
                  <button
                    type="button"
                    onClick={() => toggleImpactGroup(group.key)}
                    aria-expanded={isExpanded}
                    aria-controls={contentId}
                    className="flex w-full items-center justify-between gap-3 rounded-lg py-2 text-left hover:brightness-125 focus-visible:brightness-125"
                  >
                    <span className="min-w-0 text-xs font-bold" style={{ color: LEGACY_COLORS.blue }}>
                      {group.label ?? "재고"} · {group.effects.length}품목{amount ? ` · ${amount}` : ""}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      style={{ color: LEGACY_COLORS.muted2 }}
                    />
                  </button>
                )}
                {isExpanded && (
                  <div id={contentId}>
                    {group.effects.map((effect, index) => {
                      const color = effect.delta > 0 ? LEGACY_COLORS.green : LEGACY_COLORS.red;
                      const rowClass = `flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left ${
                        index > 0 ? "border-t" : ""
                      }`;
                      const contents = <>
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5">
                              {effect.role && (
                                <span className="shrink-0 text-xs font-bold" style={{ color: LEGACY_COLORS.blue }}>
                                  {effect.role}
                                </span>
                              )}
                              <div className="truncate text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
                                {effect.itemName}
                              </div>
                            </div>
                            {!hasMultipleImpactLocations && effect.label && (
                              <div className="mt-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                                {effect.label}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 text-sm font-black" style={{ color }}>
                            {effect.deltaLabel}{effect.unit ? ` ${effect.unit}` : ""}
                          </div>
                        </>;
                      return onImpactClick && effect.role ? (
                        <button
                          key={effect.key}
                          type="button"
                          onClick={() => onImpactClick(effect)}
                          className={`${rowClass} no-btn-inset hover:brightness-125 focus-visible:brightness-125`}
                          style={{ borderColor: LEGACY_COLORS.border }}
                        >
                          {contents}
                        </button>
                      ) : (
                        <div key={effect.key} className={rowClass} style={{ borderColor: LEGACY_COLORS.border }}>
                          {contents}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {summary.status.reason && (
        <div
          className="border-t px-4 py-3 text-sm"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.red }}
        >
          <span className="font-bold">취소 사유</span>
          <span className="ml-2">{summary.status.reason}</span>
        </div>
      )}
    </section>
  );
}

function getImpactGroupAmount(effects: HistoryDetailImpact[]): string | null {
  const units = new Set(effects.map((effect) => effect.unit).filter(Boolean));
  if (units.size !== 1) return null;
  const delta = effects.reduce((total, effect) => total + effect.delta, 0);
  if (delta === 0) return null;
  const [unit] = Array.from(units);
  return `${delta > 0 ? "+" : ""}${delta} ${unit}`;
}

function ConversionEndpoint({
  endpoint,
  align,
}: {
  endpoint: { itemName: string; mesCode: string | null };
  align: "left" | "right";
}) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}>
      <div className="truncate text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
        {endpoint.itemName}
      </div>
      {endpoint.mesCode && (
        <div className="mt-0.5 truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {endpoint.mesCode}
        </div>
      )}
    </div>
  );
}
