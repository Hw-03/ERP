"use client";

import { useEffect, useId, useState, type JSX } from "react";
import { ChevronDown } from "lucide-react";
import type { InventoryRelatedWork, WorkInventoryEffect, WorkReservedInput, WorkStockLocation, WorkTarget } from "@/lib/api/types/work-reservations";
import { LEGACY_COLORS as C } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { SUB_TYPE_LABEL } from "@/lib/io/glossary";
import { reservationIssueMessage } from "@/lib/io/reservation-message";

interface WorkPresentation {
  effects: WorkInventoryEffect[];
  inputs: WorkReservedInput[];
  targets: WorkTarget[];
  groups: { identity: WorkInventoryEffect; effects: WorkInventoryEffect[] }[];
  hasDetails: boolean;
}

/** 선택 품목의 효과는 요약에 두고, 위치·단위를 합산하지 않고 추가 품목만 상세에 남긴다. */
function presentWork(work: InventoryRelatedWork, itemId: string): WorkPresentation {
  const effects = work.expected_effects.filter((effect) => effect.item_id === itemId);
  const inputs = effects.length ? [] : work.reserved_inputs.filter((input) => input.item_id === itemId);
  const targets = work.targets.filter((target) => target.item_id !== itemId);
  const grouped = new Map<string, WorkPresentation["groups"][number]>();
  for (const effect of work.expected_effects) {
    if (effect.item_id === itemId) continue;
    const group = grouped.get(effect.item_id);
    if (group) group.effects.push(effect);
    else grouped.set(effect.item_id, { identity: effect, effects: [effect] });
  }
  const groups = [...grouped.values()];
  return { effects, inputs, targets, groups, hasDetails: groups.length > 0 || targets.length > 1 };
}

/** 담당 부서와 구분하여 실제 재고가 놓인 위치를 표시한다. */
function locationLabel(location: WorkStockLocation): string {
  return location.bucket === "warehouse" ? "창고" : `${location.department}${location.bucket === "defective" ? " 불량" : ""}`;
}

/** 이동 수량에는 증감 부호를 붙이지 않는다. */
function EffectRow({ effect, summary = false, code }: { effect: WorkInventoryEffect; summary?: boolean; code?: string | null }): JSX.Element {
  const direction = effect.kind === "in" ? "입고" : effect.kind === "out" ? "출고" : "이동";
  const location = effect.kind === "move" ? `${locationLabel(effect.from)} → ${locationLabel(effect.to)}` : locationLabel(effect.kind === "in" ? effect.to : effect.from);
  return <div className="flex items-baseline justify-between gap-3 leading-5">
    <span className={`min-w-0 break-keep [overflow-wrap:anywhere] ${summary ? "text-sm" : "text-xs"}`} style={{ color: C.muted2 }}>
      {code !== undefined && <>{code ?? "코드 없음"} · </>}{direction}{summary ? " 예정" : ""} · {location}
    </span>
    <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums" style={{ color: effect.kind === "in" ? C.green : effect.kind === "out" ? C.red : C.blue }}>
      {effect.kind === "in" ? "+" : effect.kind === "out" ? "−" : ""}{formatQty(effect.quantity)} {effect.unit}
    </span>
  </div>;
}

/** 단순 작업은 정적 요약으로, 추가 품목이 있는 작업만 펼침 버튼으로 제공한다. */
function RelatedWork({ work, itemName, presentation, open, onToggle }: { work: InventoryRelatedWork; itemName: string; presentation: WorkPresentation; open: boolean; onToggle: () => void }): JSX.Element {
  const detailId = useId();
  const status = work.status === "partially_completed" ? "일부 완료" : work.status === "draft" ? "작업 중" : "승인 대기";
  const { effects, inputs, targets, groups, hasDetails } = presentation;
  const summary = <div className="min-w-0 flex-1 space-y-2">
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <span className="break-words text-sm font-semibold">{work.requester_name}</span>
        <span className="text-xs" style={{ color: C.muted2 }}>· {work.requester_department}</span>
        <span className="text-xs" style={{ color: C.muted2 }}>· {SUB_TYPE_LABEL[work.sub_type]}</span>
        {!work.requester_active && <span className="text-xs" style={{ color: C.muted2 }}>비활성 담당자</span>}
      </div>
      <span className="shrink-0 rounded-full px-2 py-0.5 text-xs" style={{ color: C.muted2, background: C.s3 }}>{status}</span>
    </div>
    <div className="space-y-1.5">
      <p className="break-keep text-sm font-semibold leading-5 [overflow-wrap:anywhere]">{itemName}</p>
      {effects.map((effect) => <EffectRow key={effect.effect_id} effect={effect} summary />)}
      {inputs.map((input, index) => <div key={`${input.location.bucket}:${input.location.department}:${index}`} className="flex items-baseline justify-between gap-3 text-sm leading-5">
        <span className="min-w-0 break-keep [overflow-wrap:anywhere]" style={{ color: C.muted2 }}>사용 예약 · {locationLabel(input.location)}</span>
        <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums" style={{ color: C.blue }}>{formatQty(input.quantity)} {input.unit}</span>
      </div>)}
      {!effects.length && !inputs.length && <p className="text-xs leading-5" style={{ color: C.muted2 }}>{work.forecast_issue ? "예정 수량을 확인할 수 없습니다. 수량이 없는 것은 아닙니다." : work.expected_effects.length ? "선택 품목의 예정은 확인할 수 없습니다." : "확정된 예정이 없습니다."}</p>}
    </div>
    {targets[0] && <div className="flex items-baseline justify-between gap-3 border-t pt-2 text-sm leading-5" style={{ borderColor: C.border }}>
      <span className="min-w-0 break-keep [overflow-wrap:anywhere]"><span className="text-xs" style={{ color: C.muted2 }}>작업 대상 · </span>{targets[0].item_name}{targets.length > 1 && <span className="text-xs" style={{ color: C.muted2 }}> 외 {targets.length - 1}건</span>}</span>
      <span className="shrink-0 whitespace-nowrap tabular-nums" style={{ color: C.muted2 }}>{formatQty(targets[0].quantity)} {targets[0].unit}</span>
    </div>}
  </div>;
  return <article aria-label={`${work.requester_name} ${SUB_TYPE_LABEL[work.sub_type]} 작업`} className="min-w-0 py-3 first:pt-0 last:pb-0">
    {hasDetails ? <button type="button" aria-expanded={open} aria-controls={detailId} onClick={onToggle}
      className="flex min-h-11 w-full min-w-0 items-start gap-2 rounded-[12px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--c-blue)]">
      {summary}<ChevronDown aria-hidden className={`mt-1 h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: C.muted2 }} />
    </button> : <div className="min-w-0">{summary}</div>}
    {work.reservation_issue && <p role="status" className="mt-3 text-sm leading-6" style={{ color: C.yellow }}>{reservationIssueMessage(work.reservation_issue)}</p>}
    {work.forecast_issue && <p role="status" className="mt-3 text-sm leading-6" style={{ color: C.yellow }}>이 작업의 입고·출고 예정을 모두 확인할 수 없습니다. 담당자에게 작업 내용을 확인해 주세요.</p>}
    {open && hasDetails && <div id={detailId} role="region" aria-label={`${work.requester_name} 작업 상세`} className="mt-3 border-t pt-3 text-sm" style={{ borderColor: C.border }}>
      {targets.length > 1 && <div role="group" aria-label="추가 작업 대상" className="mb-3 space-y-2 border-b pb-3" style={{ borderColor: C.border }}>
        {targets.slice(1).map((target, index) => <div key={`${target.item_id}:${index}`} className="flex items-baseline justify-between gap-3 leading-5"><span className="min-w-0 break-keep [overflow-wrap:anywhere]">{target.item_name}</span><span className="shrink-0 whitespace-nowrap tabular-nums">{formatQty(target.quantity)} {target.unit}</span></div>)}
      </div>}
      <ul className="space-y-3">{groups.map(({ identity, effects: rows }) => <li key={identity.item_id} aria-label={`${identity.item_name} 내역`} className="space-y-2 border-b pb-3 last:border-b-0 last:pb-0" style={{ borderColor: C.border }}>
        <p className="break-keep font-semibold leading-5 [overflow-wrap:anywhere]">{identity.item_name}</p>
        <div className="space-y-1.5">{rows.map((effect, index) => <EffectRow key={effect.effect_id} effect={effect} code={index === 0 ? identity.mes_code : undefined} />)}</div>
      </li>)}</ul>
    </div>}
  </article>;
}

/** 초기 조회에만 한 건 자동 펼침을 적용해 재조회가 사용자의 접힘을 되돌리지 않는다. */
export function InventoryRelatedWorkList({ works, itemId, itemName }: { works: InventoryRelatedWork[]; itemId: string; itemName: string }): JSX.Element {
  const rows = works.map((work) => ({ work, presentation: presentWork(work, itemId) }));
  const [openId, setOpenId] = useState<string | null>(() => rows.length === 1 && rows[0].presentation.hasDetails ? rows[0].work.batch_id : null);
  useEffect(() => {
    if (openId && !works.some((work) => work.batch_id === openId && presentWork(work, itemId).hasDetails)) setOpenId(null);
  }, [openId, works, itemId]);
  return <div className="divide-y divide-[var(--c-border)]">{rows.map(({ work, presentation }) => <RelatedWork key={work.batch_id} work={work} itemName={itemName} presentation={presentation} open={openId === work.batch_id} onToggle={() => setOpenId((current) => current === work.batch_id ? null : work.batch_id)} />)}</div>;
}
