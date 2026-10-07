"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { WeeklyGroupReport, WeeklyItemReport, WeeklyProductionModelRow } from "@/lib/api/types/weekly";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { EmptyState } from "../../common/EmptyState";

const PROCESS_ORDER: Record<string, number> = { TF: 0, HF: 1, VF: 2, NF: 3, AF: 4, PF: 5 };
const MATRIX_COLUMNS = [
  { key: "tf_qty", label: "튜브" },
  { key: "hf_qty", label: "고압" },
  { key: "vf_qty", label: "진공" },
  { key: "nf_qty", label: "튜닝" },
  { key: "af_qty", label: "조립" },
  { key: "pf_qty", label: "출하 완료" },
] as const;

function quantity(value: number | string | undefined): string {
  return Number(value) === 0 ? "—" : formatQty(value);
}

function change(value: number): string {
  return value > 0 ? `+${formatQty(value)}` : value < 0 ? formatQty(value) : "±0";
}

/** 같은 모델의 모든 공정 수량을 가로 스크롤 없이 비교한다. */
export function MobileWeeklyProductionMatrix({ rows }: { rows: WeeklyProductionModelRow[] }) {
  const sorted = [...rows].sort((a, b) => a.model_key.localeCompare(b.model_key));
  return <div role="region" aria-label="모델별 공정 생산 현황" className="min-w-0">
    {sorted.map((row) => <article key={row.model_key} aria-label={`${row.model_label} 생산 현황`} className="min-w-0 border-t py-3 first:border-t-0 first:pt-0 last:pb-0" style={{ borderColor: LEGACY_COLORS.border }}>
      <h3 className="break-words text-base font-bold" style={{ color: LEGACY_COLORS.text }}>{row.model_label}</h3>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {MATRIX_COLUMNS.map((col) => <div key={col.key} className="min-w-0 rounded-[12px] px-2 py-2 text-center" style={{ background: LEGACY_COLORS.s2 }}>
          <dt className="text-xs leading-5" style={{ color: LEGACY_COLORS.muted2 }}>{col.label}</dt>
          <dd className="mt-1 text-lg font-bold leading-6 tabular-nums [overflow-wrap:anywhere]" style={{ color: Number(row[col.key]) ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}>{quantity(row[col.key])}</dd>
        </div>)}
      </dl>
    </article>)}
  </div>;
}

/** 상세 집계와 중복하지 않고 공정 선택만 제공한다. */
export function MobileWeeklyGroupCards({ groups, selected, onSelect }: { groups: WeeklyGroupReport[]; selected: string; onSelect: (code: string) => void }) {
  const sorted = [...groups].sort((a, b) => (PROCESS_ORDER[a.process_code] ?? 99) - (PROCESS_ORDER[b.process_code] ?? 99));
  if (sorted.length === 0) return <EmptyState variant="no-data" title="선택할 공정이 없습니다." description="" compact />;
  return <div role="group" aria-label="공정 선택" className="grid grid-cols-3 gap-2">{sorted.map((group) => {
    const active = selected === group.process_code;
    return <button key={group.process_code} type="button" onClick={() => onSelect(group.process_code)} aria-pressed={active} className="min-h-16 min-w-0 rounded-[20px] border px-3 py-2 text-center transition-colors active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]" style={{ background: active ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, ${LEGACY_COLORS.s1})` : LEGACY_COLORS.s1, borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border }}>
      <span className="block break-words text-sm font-bold" style={{ color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.text }}>{group.dept_name}</span>
      <span className="mt-0.5 block text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{group.process_code}</span>
    </button>;
  })}</div>;
}

function MobileWeeklyItemCard({ item, stockBasis, onItemSelect }: { item: WeeklyItemReport; stockBasis: "legacy" | "normal"; onItemSelect: (item: WeeklyItemReport) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const nameRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const name = nameRef.current;
    if (!name || expanded) return;
    const measure = () => setCanExpand(name.scrollHeight > name.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(name);
    return () => observer.disconnect();
  }, [expanded, item.item_name]);
  const normal = stockBasis === "normal";
  const values = [[normal ? "전주 정상" : "전주", item.prev_qty], ["생산", item.produce_qty], ["입고", item.receive_qty], ["출고", item.out_qty], ["불량", item.defect_qty ?? 0], [normal ? "현재 정상" : "현재", item.current_qty]] as const;
  return <article data-testid={`mobile-weekly-detail-${item.item_id}`} className="relative rounded-[20px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
    <button type="button" onClick={() => onItemSelect(item)} aria-label={`${item.item_name} BOM 구성 보기`} className="min-h-11 w-full rounded-[20px] p-4 text-left active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]">
      <span className={`flex items-start justify-between gap-2 ${canExpand ? "pr-10" : ""}`}>
        <span className="min-w-0"><span ref={nameRef} data-weekly-name className={`${expanded ? "block" : "line-clamp-2"} break-words text-sm font-bold`} style={{ color: LEGACY_COLORS.text }}>{item.item_name}</span><span className="mt-1 block break-all text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{item.mes_code ?? "—"}</span></span>
        <span className="shrink-0 text-base font-bold tabular-nums" style={{ color: item.delta > 0 ? LEGACY_COLORS.green : item.delta < 0 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}>{change(item.delta)}</span>
      </span>
      <span className="mt-3 grid grid-cols-3 gap-2 border-t pt-3" style={{ borderColor: LEGACY_COLORS.border }}>{values.map(([label, value]) => <span key={label} className="min-w-0 rounded-[12px] px-2 py-2 text-center" style={{ background: LEGACY_COLORS.s2 }}><span className="block text-xs leading-5" style={{ color: LEGACY_COLORS.muted2 }}>{label}</span><span className="mt-1 block text-lg font-bold leading-6 tabular-nums [overflow-wrap:anywhere]" style={{ color: Number(value) ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}>{quantity(value)}</span></span>)}</span>
    </button>
    {canExpand && <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "품목 이름 접기" : "품목 이름 펼치기"} aria-expanded={expanded} className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]" style={{ color: LEGACY_COLORS.blue }}>{expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</button>}
  </article>;
}

/** 합계는 유지하고, 모든 수량이 없는 품목만 모바일 목록에서 숨긴다. */
export function MobileWeeklyDetails({ group, stockBasis, onItemSelect }: { group: WeeklyGroupReport | undefined; stockBasis: "legacy" | "normal"; onItemSelect: (item: WeeklyItemReport) => void }) {
  if (!group || group.items.length === 0) return <EmptyState variant="no-data" title="해당 공정완료품 데이터가 없습니다." description="" compact illustrated className="min-h-[200px]" />;
  const stockLabel = stockBasis === "normal" ? "정상재고" : "재고";
  const visibleItems = group.items.filter((item) => [item.prev_qty, item.produce_qty, item.receive_qty, item.out_qty, item.defect_qty, item.current_qty, item.delta].some((value) => Number(value ?? 0) !== 0));
  return <div className="flex flex-col gap-3">
    <div data-testid="weekly-detail-summary" className="flex min-w-0 items-center justify-between gap-2 rounded-[20px] border px-3 py-3 text-xs" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
      <span className="flex min-w-0 items-baseline gap-1 whitespace-nowrap" aria-label={`현재 ${stockLabel} ${formatQty(group.current_qty)}`}><span>{stockLabel}</span><span className="truncate text-sm font-bold tabular-nums" style={{ color: LEGACY_COLORS.text }}>{formatQty(group.current_qty)}</span></span>
      <span className="flex min-w-0 items-baseline gap-1 whitespace-nowrap" aria-label={`증감 ${change(group.delta)}`}><span>증감</span><span className="truncate text-sm font-bold tabular-nums" style={{ color: group.delta > 0 ? LEGACY_COLORS.green : group.delta < 0 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}>{change(group.delta)}</span></span>
      <span className="flex shrink-0 items-baseline gap-1 whitespace-nowrap" aria-label={`표시 품목 ${visibleItems.length}개, 전체 ${group.items.length}개`}><span>품목</span><span className="text-sm font-bold tabular-nums" style={{ color: LEGACY_COLORS.text }}>{visibleItems.length}/{group.items.length}</span></span>
    </div>
    {visibleItems.map((item) => <MobileWeeklyItemCard key={item.item_id} item={item} stockBasis={stockBasis} onItemSelect={onItemSelect} />)}
    {visibleItems.length === 0 && <EmptyState variant="no-data" title="이번 주 수량이 있는 품목이 없습니다." description="" compact />}
  </div>;
}
