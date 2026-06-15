"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";
import type {
  ProductionCapacity,
  ProductionCapacityAfBlock,
  ProductionCapacityAfItem,
  ProductionCapacityPfVariant,
} from "@/lib/api/types/production";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { getModelLabel } from "@/lib/mes/model-labels";

type AfFilterMode = "producible" | "incomplete" | "all";

const SHARED_HINT =
  "각 수량은 AF별 독립 계산값 · 같은 하위 자재를 공유하면 모든 AF 수량을 동시에 보장하지는 않음";

/**
 * 생산 가능수량 상세 모달 — AF(조립 완제품) 기준.
 * ① AF별 3수량(출하준비/빠른조립/총생산) ② 각 병목 ③ 연결된 PF 변형(주문 기준 ship_ready)
 * ④ BOM 미완성 표시. af 블록이 없으면(구버전 응답) legacy 요약으로 fallback.
 */
export function CapacityDetailModal({
  capacityData,
  onClose,
}: {
  capacityData: ProductionCapacity | null;
  onClose: () => void;
}) {
  const af = capacityData?.af ?? null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,.55)" }}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[min(1100px,94vw)] flex-col rounded-[28px] border"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          maxHeight: "min(900px, 92vh)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 헤더 ───────────────────────────────────────── */}
        <div className="border-b px-7 pb-4 pt-7" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>
            생산 가능수량 상세 · 조립 완제품(AF) 기준
          </div>
          <div className="mt-1 text-xs leading-relaxed" style={{ color: LEGACY_COLORS.muted2 }}>
            출하준비: AF 재고를 출하까지 마무리 · 빠른조립: 기존 재고＋직계 자재로 추가 조립 · 총생산: 하위 BOM 끝까지 투입 이론치
          </div>
          <div
            className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 14%, transparent)`,
              color: LEGACY_COLORS.yellow,
            }}
          >
            <AlertTriangle className="h-3 w-3" />
            {SHARED_HINT}
          </div>
        </div>

        {/* ── 본문 (스크롤) ───────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-7 py-5">
          {af ? (
            <AfCapacityView af={af} />
          ) : (
            <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
              {capacityData == null
                ? "데이터를 불러오는 중…"
                : "AF 기준 데이터가 없습니다. 백엔드 갱신 후 다시 확인해 주세요."}
            </div>
          )}
        </div>

        {/* ── 푸터 ───────────────────────────────────────── */}
        <div className="border-t px-7 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
          <button
            className="w-full rounded-[18px] border py-3 text-base font-semibold"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.muted2,
            }}
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function isIncomplete(it: ProductionCapacityAfItem): boolean {
  return it.bom_status === "incomplete" || !it.has_pf_path;
}

function AfCapacityView({ af }: { af: ProductionCapacityAfBlock }) {
  const items = af.items;

  const producibleCount = useMemo(
    () =>
      items.filter(
        (it) => it.ship_ready > 0 || it.fast_assembly > 0 || it.total_production > 0,
      ).length,
    [items],
  );
  const incompleteCount = useMemo(() => items.filter(isIncomplete).length, [items]);

  const [filterMode, setFilterMode] = useState<AfFilterMode>("producible");
  const filtered = useMemo(() => {
    if (filterMode === "producible")
      return items.filter(
        (it) => it.ship_ready > 0 || it.fast_assembly > 0 || it.total_production > 0,
      );
    if (filterMode === "incomplete") return items.filter(isIncomplete);
    return items;
  }, [items, filterMode]);

  // 모델(model_symbol) 단위 그룹화.
  const grouped = useMemo(() => {
    const groups = new Map<string, ProductionCapacityAfItem[]>();
    for (const it of filtered) {
      const key = (it.model_symbol ?? "").trim() || "미분류";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(it);
    }
    groups.forEach((arr) => arr.sort((a, b) => b.ship_ready - a.ship_ready));
    return Array.from(groups.entries())
      .map(([key, arr]) => {
        const label =
          key === "미분류" ? key : getModelLabel(key, arr[0]?.af_name) || `모델${key}`;
        return { key, label, items: arr };
      })
      .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  }, [filtered]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpandedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const variantsByAf = useMemo(() => {
    const map = new Map<string, ProductionCapacityPfVariant[]>();
    for (const v of af.pf_variants) {
      if (!v.af_item_id) continue;
      const arr = map.get(v.af_item_id) ?? [];
      arr.push(v);
      map.set(v.af_item_id, arr);
    }
    return map;
  }, [af.pf_variants]);

  if (items.length === 0) {
    const msg =
      af.status === "no_target"
        ? "조립 완제품(AF) 기준 품목이 없습니다."
        : af.status === "bom_not_registered"
          ? "AF 직계 BOM 이 등록되지 않아 계산할 수 없습니다."
          : "표시할 항목이 없습니다.";
    return (
      <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
        {msg}
      </div>
    );
  }

  return (
    <>
      {/* 요약 3수량 */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <SummaryTile
          label="출하 준비"
          value={af.summary.ship_ready}
          color={LEGACY_COLORS.cyan}
          desc="AF 재고를 출하까지 마무리"
        />
        <SummaryTile
          label="빠른 조립"
          value={af.summary.fast_assembly}
          color={LEGACY_COLORS.blue}
          desc="기존 재고 ＋ 직계 자재"
        />
        <SummaryTile
          label="총 생산"
          value={af.summary.total_production}
          color={LEGACY_COLORS.purple}
          desc="하위 BOM 끝까지 투입 이론치"
        />
      </div>

      {/* 필터 토글 */}
      <div className="mb-3 flex items-center gap-2">
        {(
          [
            { key: "producible", label: "생산 가능", count: producibleCount, color: LEGACY_COLORS.cyan },
            { key: "incomplete", label: "미완성", count: incompleteCount, color: LEGACY_COLORS.yellow },
            { key: "all", label: "전체", count: items.length, color: LEGACY_COLORS.muted2 },
          ] as { key: AfFilterMode; label: string; count: number; color: string }[]
        ).map((f) => {
          const active = filterMode === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilterMode(f.key)}
              className="rounded-full border px-3 py-1.5 text-xs font-bold transition-opacity"
              style={{
                background: active ? `color-mix(in srgb, ${f.color} 18%, transparent)` : "transparent",
                borderColor: active ? f.color : LEGACY_COLORS.border,
                color: active ? f.color : LEGACY_COLORS.muted2,
              }}
            >
              {f.label} <span className="ml-1 opacity-70">{f.count}</span>
            </button>
          );
        })}
      </div>

      {/* AF 목록 (모델 그룹 + 행 펼침 → PF 변형) */}
      <div className="rounded-[16px] border" style={{ borderColor: LEGACY_COLORS.border }}>
        <div
          className="grid grid-cols-[20px_minmax(0,1fr)_84px_84px_84px] border-b px-4 py-2 text-xs font-bold uppercase tracking-[0.12em]"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
        >
          <span />
          <span>조립 완제품 · 병목</span>
          <span className="text-right">출하준비</span>
          <span className="text-right">빠른조립</span>
          <span className="text-right">총생산</span>
        </div>

        {grouped.length === 0 && (
          <div className="px-4 py-6 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            조건에 맞는 AF 가 없습니다.
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.key}>
            <div
              className="grid grid-cols-[20px_minmax(0,1fr)_84px_84px_84px] items-center border-t px-4 py-2"
              style={{
                borderColor: LEGACY_COLORS.border,
                background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`,
              }}
            >
              <span />
              <span className="text-sm font-black" style={{ color: LEGACY_COLORS.blue }}>
                {group.label}{" "}
                <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  · {group.items.length}종
                </span>
              </span>
              <span />
              <span />
              <span />
            </div>

            {group.items.map((it) => {
              const expanded = expandedIds.has(it.af_item_id);
              const variants = variantsByAf.get(it.af_item_id) ?? [];
              const bottleneck =
                it.total_production_limiting_item ||
                it.fast_assembly_limiting_item ||
                it.ship_ready_limiting_item ||
                null;
              return (
                <div key={it.af_item_id}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(it.af_item_id)}
                    className="grid w-full cursor-pointer grid-cols-[20px_minmax(0,1fr)_84px_84px_84px] items-center border-t px-4 py-2.5 text-left transition-colors hover:brightness-110"
                    style={{ borderColor: LEGACY_COLORS.border }}
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
                    ) : (
                      <ChevronRight className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
                    )}
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm" style={{ color: LEGACY_COLORS.text }}>
                          {it.af_name}
                        </span>
                        {it.bom_status === "incomplete" && (
                          <Badge color={LEGACY_COLORS.yellow}>BOM 미완성</Badge>
                        )}
                        {it.bom_status !== "incomplete" && !it.has_pf_path && (
                          <Badge color={LEGACY_COLORS.muted2}>출하경로 없음</Badge>
                        )}
                      </div>
                      {it.af_code && (
                        <div className="truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                          {it.af_code}
                        </div>
                      )}
                      {bottleneck && (
                        <div className="truncate text-xs" style={{ color: LEGACY_COLORS.yellow }}>
                          병목: {bottleneck}
                        </div>
                      )}
                    </div>
                    <QtyCell value={it.ship_ready} color={LEGACY_COLORS.cyan} />
                    <QtyCell value={it.fast_assembly} color={LEGACY_COLORS.blue} />
                    <QtyCell value={it.total_production} color={LEGACY_COLORS.purple} />
                  </button>

                  {expanded && (
                    <div
                      className="border-t px-5 py-3"
                      style={{
                        borderColor: LEGACY_COLORS.border,
                        background: `color-mix(in srgb, ${LEGACY_COLORS.text} 4%, transparent)`,
                      }}
                    >
                      <PfVariants variants={variants} hasPfPath={it.has_pf_path} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

function SummaryTile({
  label,
  value,
  color,
  desc,
}: {
  label: string;
  value: number;
  color: string;
  desc: string;
}) {
  return (
    <div
      className="rounded-[14px] border px-4 py-3"
      style={{
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      <div className="text-xs font-bold" style={{ color }}>
        {label}
      </div>
      <div className="mt-0.5 text-2xl font-black" style={{ color }}>
        {formatQty(value)}
      </div>
      <div className="mt-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
        {desc}
      </div>
    </div>
  );
}

function QtyCell({ value, color }: { value: number; color: string }) {
  return (
    <div
      className="text-right text-sm font-bold"
      style={{ color: value > 0 ? color : LEGACY_COLORS.muted2 }}
    >
      {formatQty(value)}
    </div>
  );
}

function Badge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-xs font-bold"
      style={{
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        color,
      }}
    >
      {children}
    </span>
  );
}

function PfVariants({
  variants,
  hasPfPath,
}: {
  variants: ProductionCapacityPfVariant[];
  hasPfPath: boolean;
}) {
  if (variants.length === 0) {
    return (
      <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
        {hasPfPath
          ? "연결된 출하(PF) 변형 정보가 없습니다."
          : "출하 경로(PF)가 연결되지 않았습니다 — 출하 준비 가능 수량 0."}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="mb-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
        출하 변형(PF)별 출하 준비 가능 — 특정 주문 기준
      </div>
      <div
        className="grid grid-cols-[minmax(0,1fr)_90px_28px] gap-2 px-2 pb-1 text-xs font-bold uppercase tracking-[0.12em]"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        <span>출하 완제품 · 병목</span>
        <span className="text-right">출하준비</span>
        <span />
      </div>
      {variants.map((v) => {
        const ok = v.ship_ready > 0;
        return (
          <div
            key={v.pf_item_id}
            className="grid grid-cols-[minmax(0,1fr)_90px_28px] items-center gap-2 rounded-[8px] px-2 py-1.5"
            style={{
              background: ok
                ? `color-mix(in srgb, ${LEGACY_COLORS.cyan} 6%, transparent)`
                : `color-mix(in srgb, ${LEGACY_COLORS.yellow} 8%, transparent)`,
            }}
          >
            <div className="min-w-0">
              <div className="truncate text-xs" style={{ color: LEGACY_COLORS.text }}>
                {v.pf_name}
              </div>
              {v.pf_code && (
                <div className="truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  {v.pf_code}
                </div>
              )}
              {v.limiting_item && (
                <div className="truncate text-xs" style={{ color: LEGACY_COLORS.yellow }}>
                  병목: {v.limiting_item}
                </div>
              )}
            </div>
            <div
              className="text-right text-sm font-bold"
              style={{ color: ok ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2 }}
            >
              {formatQty(v.ship_ready)}
            </div>
            <div className="flex justify-end">
              {ok ? (
                <CheckCircle2 className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.green }} />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.yellow }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
