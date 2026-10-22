import type { JSX } from "react";
import { ChevronDown } from "lucide-react";
import type { InventoryRelatedWork, WorkInventoryEffect, WorkReservedInput, WorkStockLocation, WorkTarget } from "@/lib/api/types/work-reservations";
import { LEGACY_COLORS as C } from "@/lib/mes/color";
import { formatKstDateTime, formatQty } from "@/lib/mes/format";

const ITEM_NAME_CLASS = "min-w-0 break-keep [overflow-wrap:anywhere]";

/** 담당 부서와 구분해 실제 재고가 놓인 위치를 표시한다. */
export function workLocationLabel(location: WorkStockLocation): string {
  return location.bucket === "warehouse" ? "창고" : `${location.department}${location.bucket === "defective" ? " · 불량" : ""}`;
}

/** 시간대가 생략된 기존 UTC 저장값도 한국 시간으로 읽는다. */
export function workDate(value: string): string {
  return formatKstDateTime(/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
}

/** 서로 다른 품목과 단위를 합산하지 않고 작업 목적을 모두 보여준다. */
export function WorkTargets({ targets }: { targets: WorkTarget[] }): JSX.Element {
  return <div>
    <h3 className="mb-2 text-xs" style={{ color: C.muted2 }}>작업 목적</h3>
    {targets.length ? <div className="space-y-3">{targets.map((target, index) => <div key={`${target.item_id}:${index}`} className="flex items-start justify-between gap-6">
      <div className="min-w-0"><p className={`${ITEM_NAME_CLASS} text-xl font-bold leading-7`}>{target.item_name}</p>{target.mes_code && <p className="mt-1 text-xs" style={{ color: C.muted2 }}>{target.mes_code}</p>}</div>
      <p className="shrink-0 whitespace-nowrap text-xl font-bold leading-7 tabular-nums">{formatQty(target.quantity)} <span className="text-sm font-medium" style={{ color: C.muted2 }}>{target.unit}</span></p>
    </div>)}</div> : <p style={{ color: C.muted2 }}>등록된 목적 품목이 없습니다.</p>}
  </div>;
}

/** 위치 이동과 재고 증가를 구분하며 수량의 단위를 보존한다. */
function EffectRow({ effect }: { effect: WorkInventoryEffect }): JSX.Element {
  return <li className="flex items-start justify-between gap-4 py-2">
    <div className="min-w-0">
      <p className={`${ITEM_NAME_CLASS} font-bold`}>{effect.item_name}{effect.mes_code && <span className="ml-2 text-xs font-medium" style={{ color: C.muted2 }}>{effect.mes_code}</span>}</p>
      <p style={{ color: C.muted2 }}>{effect.kind === "move" ? `${workLocationLabel(effect.from)} → ${workLocationLabel(effect.to)}` : effect.kind === "in" ? `${workLocationLabel(effect.to)} 입고 예정` : `${workLocationLabel(effect.from)}에서 사용`}</p>
    </div>
    <div className="shrink-0 text-right"><p className="whitespace-nowrap font-bold tabular-nums">{formatQty(effect.quantity)} {effect.unit}</p>{effect.kind === "move" && <p className="text-xs" style={{ color: C.muted2 }}>위치 이동</p>}</div>
  </li>;
}

/** 관리자 상세의 예정 결과와 사용 자재를 구분한다. */
export function WorkExpectedEffects({ effects, forecastIssue, cancelled = false }: { effects: WorkInventoryEffect[]; forecastIssue: InventoryRelatedWork["forecast_issue"]; cancelled?: boolean }): JSX.Element {
  const outcomes = effects.filter((effect) => effect.kind !== "out");
  const consumed = effects.filter((effect) => effect.kind === "out");
  return <section className="min-w-0 space-y-2">
    <div className="flex flex-wrap items-baseline gap-x-3"><h3 className="text-base font-bold">완료 후 결과</h3>{outcomes.some((effect) => effect.kind === "in") && <span className="text-xs" style={{ color: C.muted2 }}>완료 후 사용</span>}</div>
    {outcomes.some((effect) => effect.kind === "move") && <p className="text-xs" style={{ color: C.muted2 }}>이동은 전체 재고가 늘지 않습니다.</p>}
    {forecastIssue && <p role="status" className="rounded-[12px] p-3" style={{ background: C.warningBg, color: C.yellow }}>예정 수량을 모두 확인할 수 없습니다. 담당자가 작업 내용을 확인해야 합니다.</p>}
    {outcomes.length > 0 && <ul className="divide-y divide-[var(--c-border)]">{outcomes.map((effect) => <EffectRow key={effect.effect_id} effect={effect} />)}</ul>}
    {consumed.length > 0 && <details className="group rounded-[12px] border px-3" style={{ borderColor: C.border }}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-[12px] text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-blue)] [&::-webkit-details-marker]:hidden"><span>사용 자재 {consumed.length}건 보기</span><ChevronDown size={16} aria-hidden className="shrink-0 transition-transform group-open:rotate-180" /></summary>
      <ul className="divide-y divide-[var(--c-border)] border-t" style={{ borderColor: C.border }}>{consumed.map((effect) => <EffectRow key={effect.effect_id} effect={effect} />)}</ul>
    </details>}
    {effects.length === 0 && <p className="py-2" style={{ color: C.muted2 }}>{cancelled ? "취소된 작업의 예정은 제외되었습니다." : "확인 가능한 예정이 없습니다."}</p>}
  </section>;
}

/** 관리자 상세의 예약 자재를 위치와 수량으로 표시한다. */
export function WorkReservedInputs({ inputs }: { inputs: WorkReservedInput[] }): JSX.Element {
  const mixedSources = new Set(inputs.map((input) => input.source)).size > 1;
  return <section className="space-y-3 border-t pt-4" style={{ borderColor: C.border }}>
    <div className="flex items-baseline justify-between gap-3"><h3 className="text-base font-bold">예약 자재</h3><span className="text-xs" style={{ color: C.muted2 }}>{inputs.length}개 항목</span></div>
    {inputs.length ? <div className="overflow-x-auto rounded-[12px] border" style={{ borderColor: C.border }}>
      <table aria-label="예약 자재" className="w-full table-fixed text-left text-sm">
        <colgroup><col /><col className="w-[28%]" /><col className="w-28" /></colgroup>
        <thead className="text-xs" style={{ background: C.bg, color: C.muted2 }}><tr><th scope="col" className="px-4 py-2.5 font-medium">품목</th><th scope="col" className="px-3 py-2.5 font-medium">재고 위치</th><th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right font-medium">예약 수량</th></tr></thead>
        <tbody>{inputs.map((input, index) => <tr key={`${input.item_id}:${index}`} className="border-t align-top" style={{ borderColor: C.border }}>
          <td className="px-4 py-2.5"><p className={`${ITEM_NAME_CLASS} font-bold`}>{input.item_name}</p>{input.mes_code && <p className="mt-0.5 text-xs" style={{ color: C.muted2 }}>{input.mes_code}</p>}</td>
          <td className="px-3 py-2.5">{workLocationLabel(input.location)}{(mixedSources || input.source === "approval") && <p className="mt-0.5 text-xs" style={{ color: C.muted2 }}>{input.source === "approval" ? "승인 대기" : "작업 중"}</p>}</td>
          <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums">{formatQty(input.quantity)} {input.unit}</td>
        </tr>)}</tbody>
      </table>
    </div> : <p style={{ color: C.muted2 }}>예약된 자재가 없습니다.</p>}
  </section>;
}
