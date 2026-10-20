"use client";

import { useId, useState, type JSX, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { Item } from "@/lib/api";
import type { InventoryRelatedWork, WorkInventoryEffect, WorkStockLocation } from "@/lib/api/types/work-reservations";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatKstDateTime, formatQty } from "@/lib/mes/format";
import { SUB_TYPE_LABEL } from "@/lib/io/glossary";
import { reservationIssueMessage } from "@/lib/io/reservation-message";
import { useInventoryWorkStatus } from "@/lib/queries/useInventoryWorkStatus";
import { ReadFailure, ReadLoading } from "../common/ReadState";

/** 담당자 부서와 구분하여 실제 재고 위치를 표시한다. */
function locationLabel(location: WorkStockLocation): string {
  if (location.bucket === "warehouse") return "창고";
  return `${location.department}${location.bucket === "defective" ? " 불량" : ""}`;
}

/** 서버가 반환한 열린 효과만 읽고 완료 수량을 다시 계산하지 않는다. */
function effectLabel(effect: WorkInventoryEffect): string {
  if (effect.kind === "move") return `${locationLabel(effect.from)} → ${locationLabel(effect.to)} · 이동 ${formatQty(effect.quantity)} ${effect.unit}`;
  return `${locationLabel(effect.kind === "in" ? effect.to : effect.from)} · ${effect.kind === "in" ? "+" : "−"}${formatQty(effect.quantity)} ${effect.unit}`;
}

/** 공개 상세는 읽기 전용이며 다른 직원의 작업 명령을 제공하지 않는다. */
function RelatedWork({ work, itemId }: { work: InventoryRelatedWork; itemId: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const status = work.reservation_status === "needs_reservation" ? "예약 필요"
    : work.reservation_status === "not_required" ? "예약 대상 없음"
    : work.status === "partially_completed" ? "일부 완료"
    : work.status === "draft" ? "작업 중" : "승인 대기";
  const selectedInputs = work.reserved_inputs.filter((input) => input.item_id === itemId);
  const selectedReserved = selectedInputs.reduce((sum, input) => sum + input.quantity, 0);
  return <div className="rounded-[16px] border p-3" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}>
    <button type="button" className="flex min-h-11 w-full items-start gap-3 rounded-[12px] text-left transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--c-blue)]"
      aria-expanded={open} aria-controls={detailId} onClick={() => setOpen((value) => !value)}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
          <span>{work.requester_name}</span>
          <span className="text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>{work.requester_department} · {SUB_TYPE_LABEL[work.sub_type]}</span>
          <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ color: work.reservation_status === "needs_reservation" ? LEGACY_COLORS.yellow : LEGACY_COLORS.blue,
            background: work.reservation_status === "needs_reservation" ? LEGACY_COLORS.warningBg : `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)` }}>{status}</span>
          {!work.requester_active && <span className="text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>비활성 담당자</span>}
        </div>
        <p className="break-keep text-sm leading-6 [overflow-wrap:anywhere]">{work.targets.map((target) => `${target.item_name} ${formatQty(target.quantity)} ${target.unit}`).join(" · ") || "작업 내용을 펼쳐 확인해 주세요."}</p>
        <p className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {selectedReserved > 0 ? `선택 품목 예약 ${formatQty(selectedReserved)} ${selectedInputs[0].unit}` : "선택 품목 예약 없음"}{work.reference_no ? ` · ${work.reference_no}` : ""}
        </p>
      </div>
      <ChevronDown aria-hidden="true" className={`mt-1 h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: LEGACY_COLORS.muted2 }} />
    </button>
    {work.reservation_issue && <p className="mt-3 rounded-[12px] px-3 py-2 text-sm leading-6" style={{ color: LEGACY_COLORS.yellow, background: LEGACY_COLORS.warningBg }}>{reservationIssueMessage(work.reservation_issue)}</p>}
    {work.forecast_issue && <p className="mt-3 text-sm leading-6" style={{ color: LEGACY_COLORS.yellow }}>이 작업의 입고·출고 예정을 모두 확인할 수 없습니다. 담당자에게 작업 내용을 확인해 주세요.</p>}
    {open && <div id={detailId} role="region" aria-label={`${work.requester_name} 작업 상세`} className="mt-3 space-y-4 border-t pt-3 text-sm" style={{ borderColor: LEGACY_COLORS.border }}>
      <div>
        <p className="mb-1 text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>작업 목적</p>
        {work.targets.map((target) => <p key={target.item_id} className="break-keep leading-6 [overflow-wrap:anywhere]">{target.item_name} · {target.mes_code ?? "코드 없음"} · {formatQty(target.quantity)} {target.unit}</p>)}
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>예약 자재</p>
        {work.reserved_inputs.length ? <ul className="space-y-3">{work.reserved_inputs.map((input, index) => <li key={index} className="break-keep leading-6 [overflow-wrap:anywhere]">
          <span className="font-medium">{input.item_name}</span>
          <p className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{input.mes_code ?? "코드 없음"} · {locationLabel(input.location)} · {input.source === "draft" ? "작업 예약" : "승인 예약"} {formatQty(input.quantity)} {input.unit}</p>
        </li>)}</ul> : <p style={{ color: LEGACY_COLORS.muted2 }}>{work.reservation_status === "needs_reservation" ? "담당자가 다시 저장하여 자재를 예약해야 합니다." : "예약된 자재가 없습니다."}</p>}
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>완료 시 증감</p>
        {work.expected_effects.length ? <ul className="space-y-3">{work.expected_effects.map((effect) => <li key={effect.effect_id} className="break-keep leading-6 [overflow-wrap:anywhere]">
          <span>{effect.item_name}</span><p className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{effectLabel(effect)}</p>
        </li>)}</ul> : <p style={{ color: LEGACY_COLORS.muted2 }}>{work.forecast_issue ? "예정 수량을 확인할 수 없습니다. 수량이 없는 것은 아닙니다." : "확정된 예정이 없습니다."}</p>}
      </div>
      <p className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>마지막 저장 {formatKstDateTime(/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(work.updated_at) ? work.updated_at : `${work.updated_at}Z`)}</p>
    </div>}
  </div>;
}

/** 선택 품목의 공개 작업 현황. */
export function InventoryWorkStatusPanel({ item, mobile = false, enabled = true, children }: { item: Item; mobile?: boolean; enabled?: boolean; children?: ReactNode }): JSX.Element {
  const query = useInventoryWorkStatus(item.item_id, enabled);
  const data = query.data?.item_id === item.item_id ? query.data : undefined;
  const summary = data?.summary;
  const arrivalForecasts = summary?.forecast_by_location.filter((row) => row.expected_in_quantity > 0 || row.transfer_in_quantity > 0 || row.transfer_out_quantity > 0) ?? [];
  const cardClass = mobile ? "rounded-[20px] border p-4" : "rounded-[28px] border p-4";
  return <div className={mobile ? "space-y-2" : "space-y-3"}>
    <section aria-label={`${item.item_name} 작업 현황`} className={cardClass} style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
    <h3 className="mb-3 text-sm font-semibold">수량 현황</h3>
    <div role="group" aria-label="수량 현황" className="grid grid-cols-2 gap-2">
      {([
        ["사용 가능 재고", formatQty(item.available_quantity), LEGACY_COLORS.text],
        ["작업 예약", summary ? formatQty(summary.work_reserved_quantity) : "-", LEGACY_COLORS.purple],
        ["승인 예약", summary ? formatQty(summary.approval_reserved_quantity) : "-", LEGACY_COLORS.yellow],
        ["입고·생산 예정", summary ? `+${formatQty(summary.expected_in_quantity)}` : "-", LEGACY_COLORS.blue],
      ] as const).map(([label, value, color]) => <div key={label} className="min-w-0 rounded-[12px] px-2 py-3 text-center" style={{ background: LEGACY_COLORS.s1 }}>
        <p className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{label}</p><p className="mt-0.5 break-all text-lg font-semibold leading-6 tabular-nums" style={{ color }}>{value}</p>
      </div>)}
    </div>
    {query.isPending && !data && <ReadLoading label="작업 예약 현황을 불러오는 중" />}
    {(query.isError || (!query.isPending && !summary)) && <ReadFailure message="예약·예정 정보를 확인할 수 없습니다. 아래 버튼으로 다시 불러와 주세요."
      refresh={!!summary} onRetry={() => void query.refetch()} />}
    {summary && <>
      {(summary.shipping_reserved_quantity > 0 || summary.expected_out_quantity > 0 || summary.transfer_in_quantity > 0 || summary.transfer_out_quantity > 0) && <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
        {summary.shipping_reserved_quantity > 0 && <p><span>출하 예약</span> <span className="font-semibold" style={{ color: LEGACY_COLORS.cyan }}>{formatQty(summary.shipping_reserved_quantity)}</span></p>}
        {summary.expected_out_quantity > 0 && <p><span>소비·출고 예정</span> −{formatQty(summary.expected_out_quantity)}</p>}
        {(summary.transfer_in_quantity > 0 || summary.transfer_out_quantity > 0) && <p>이동 도착 {formatQty(summary.transfer_in_quantity)} · 출발 {formatQty(summary.transfer_out_quantity)}</p>}
      </div>}
      <p className="mt-3 text-xs leading-5" style={{ color: LEGACY_COLORS.muted2 }}>입고·생산 예정은 사용 가능 재고에 포함하지 않습니다.{(summary.transfer_in_quantity > 0 || summary.transfer_out_quantity > 0) && " 위치 이동은 전체 재고 증가 없음."}</p>
      {!summary.forecast_complete && <p role="status" className="mt-3 rounded-[12px] px-3 py-2 text-sm leading-6" style={{ color: LEGACY_COLORS.yellow, background: LEGACY_COLORS.warningBg }}>일부 작업의 예정 정보를 확인할 수 없어 확인 가능한 예정량만 표시합니다.</p>}
      {arrivalForecasts.length > 0 && <div role="group" aria-label="위치별 예정" className="mt-2 space-y-1 border-t pt-2" style={{ borderColor: LEGACY_COLORS.border }}>
        <h4 className="text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>위치별 예정</h4>
        {arrivalForecasts.map((row) => <div key={`${row.location.bucket}:${row.location.department}`} className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-sm">
          <span className="font-medium">{locationLabel(row.location)}</span>
          <div className="flex flex-wrap gap-x-2 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            {row.expected_in_quantity > 0 && <span>입고·생산 +{formatQty(row.expected_in_quantity)}</span>}
            {row.expected_out_quantity > 0 && <span>소비·출고 −{formatQty(row.expected_out_quantity)}</span>}
            {row.transfer_in_quantity > 0 && <span>이동 도착 {formatQty(row.transfer_in_quantity)}</span>}
            {row.transfer_out_quantity > 0 && <span>이동 출발 {formatQty(row.transfer_out_quantity)}</span>}
          </div>
        </div>)}
      </div>}
    </>}
    </section>
    {children}
    {data && summary && <section aria-label="관련 작업" className="space-y-3">
        <h4 className="text-sm font-semibold">관련 작업 · {data.works.length}건</h4>
        {data.works.length ? data.works.map((work) => <RelatedWork key={`${item.item_id}:${work.batch_id}`} work={work} itemId={item.item_id} />)
          : <p className="py-2 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>관련 작업이 없습니다.</p>}
    </section>}
  </div>;
}
