"use client";

import { useMemo } from "react";
import clsx from "clsx";
import { Plus, ScanLine, Trash2 } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import type { IoBundle, IoLine, IoSubType, Item } from "@/lib/api";
import { InlineSearch, IconButton, Stepper, PrimaryActionButton } from "../primitives";
import { TYPO } from "../tokens";

/**
 * 단품 입출고(adjust_in/adjust_out) 전용 인라인 빠른 폼.
 * 5단계 위저드(대상선택→실제반영→제출확인) 대신 한 화면에서
 * 검색/스캔 → 수량 → 제출까지 끝낸다. 모바일 전용 — 데스크톱과 재통합 금지.
 *
 * 제출/전개/재고 계산은 위저드의 기존 함수(addItem·getAvailable·handleSubmit)를
 * prop 으로 받아 그대로 쓴다(단일 소스 유지).
 */
export function MobileSingleAdjustForm({
  subType,
  items,
  bundles,
  search,
  onSearchChange,
  onAddItem,
  onBundleQuantityChange,
  onRemoveBundle,
  getAvailable,
  onScan,
  onSubmit,
  submitting,
  busy,
  error,
}: {
  subType: IoSubType; // adjust_in | adjust_out
  items: Item[];
  bundles: IoBundle[];
  search: string;
  onSearchChange: (v: string) => void;
  onAddItem: (item: Item) => void;
  onBundleQuantityChange: (bundleId: string, qty: number) => void;
  onRemoveBundle: (bundleId: string) => void;
  getAvailable: (line: IoLine) => number | null;
  onScan: () => void;
  onSubmit: () => void;
  submitting: boolean;
  busy: boolean;
  error: string | null;
}) {
  const isOut = subType === "adjust_out";
  const accent = isOut ? LEGACY_COLORS.red : LEGACY_COLORS.blue;

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter(
        (it) =>
          it.item_name.toLowerCase().includes(q) ||
          (it.mes_code ?? "").toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [items, search]);

  const inCart = useMemo(
    () => new Set(bundles.map((b) => b.source_item_id)),
    [bundles],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* 검색 + 스캔 */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <InlineSearch value={search} onChange={onSearchChange} placeholder="품목명 또는 코드" />
        </div>
        {/* 항목 8 — 스캔 버튼 당분간 UI에서 숨김(코드·onScan 유지, hidden). */}
        <span className="hidden">
          <IconButton icon={ScanLine} label="바코드 스캔" size="lg" onClick={onScan} />
        </span>
      </div>

      {error && (
        <div
          className="rounded-[12px] border px-4 py-3 text-sm font-bold"
          style={{
            background: tint(LEGACY_COLORS.red, 10),
            borderColor: tint(LEGACY_COLORS.red, 30),
            color: LEGACY_COLORS.red,
          }}
        >
          {error}
        </div>
      )}

      {/* 검색 결과 */}
      {results.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {results.map((it) => (
            <button
              key={it.item_id}
              type="button"
              disabled={busy}
              onClick={() => {
                onAddItem(it);
                onSearchChange("");
              }}
              className="flex items-center gap-3 rounded-[16px] border px-4 py-3 text-left transition-[transform] active:scale-[0.98] disabled:opacity-50"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div className="min-w-0 flex-1">
                <div className={clsx(TYPO.body, "truncate font-black")} style={{ color: LEGACY_COLORS.text }}>
                  {it.item_name}
                </div>
                <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                  {it.mes_code ?? "-"}
                </div>
              </div>
              {inCart.has(it.item_id) ? (
                <span className={clsx(TYPO.caption, "font-black")} style={{ color: accent }}>
                  담김
                </span>
              ) : (
                <Plus size={18} color={accent} />
              )}
            </button>
          ))}
        </div>
      )}

      {/* 담은 품목 */}
      <div
        className="rounded-[20px] border p-4"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          boxShadow: "var(--c-card-shadow)",
        }}
      >
        <div className={clsx(TYPO.overline, "mb-2")} style={{ color: LEGACY_COLORS.muted2 }}>
          {isOut ? "단품 출고 품목" : "단품 입고 품목"}
        </div>
        {bundles.length === 0 ? (
          <div className={TYPO.body} style={{ color: LEGACY_COLORS.muted2 }}>
            위에서 검색하거나 스캔해 품목을 담으세요.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {bundles.map((b) => {
              const line = b.lines[0] as IoLine | undefined;
              const max = isOut && line ? getAvailable(line) ?? undefined : undefined;
              return (
                <div key={b.bundle_id} className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className={clsx(TYPO.body, "truncate font-black")} style={{ color: LEGACY_COLORS.text }}>
                        {b.title}
                      </div>
                      <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                        {b.source_mes_code ?? "-"}
                        {max != null ? ` · 가용 ${formatQty(max)}` : ""}
                      </div>
                    </div>
                    <IconButton icon={Trash2} label="제거" size="sm" onClick={() => onRemoveBundle(b.bundle_id)} />
                  </div>
                  <Stepper
                    value={b.quantity}
                    onChange={(q) => onBundleQuantityChange(b.bundle_id, q)}
                    min={1}
                    max={max}
                    danger={isOut}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
        단품 {isOut ? "출고" : "입고"}는 부서 결재로 처리됩니다.
      </div>

      <PrimaryActionButton
        label={isOut ? "단품 출고 제출" : "단품 입고 제출"}
        intent={isOut ? "danger" : "primary"}
        count={bundles.length || undefined}
        onClick={onSubmit}
        disabled={bundles.length === 0 || submitting}
        loadingText="처리 중…"
      />
    </div>
  );
}
