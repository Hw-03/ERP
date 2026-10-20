"use client";

import type { JSX } from "react";
import type { AdminWorkReservationDetail, WorkReservationEvent, WorkStockLocation } from "@/lib/api/types/work-reservations";
import { LEGACY_COLORS as C } from "@/lib/mes/color";
import { formatKstDateTime, formatQty } from "@/lib/mes/format";
import { reservationIssueMessage } from "@/lib/io/reservation-message";

export const RESERVATION_LABEL = { reserved: "예약 중", needs_reservation: "예약 필요", not_required: "예약할 자재 없음", inactive: "종료" };
const EVENT_LABEL = { saved: "작업 저장", submitted: "작업 제출", returned: "작업 회수", backfilled: "기존 작업 확인", admin_cancelled: "관리자 취소", owner_deleted: "담당자 삭제", approval_changed: "승인 상태 변경", settlement_failed: "완료 처리 실패" };
const ITEM_NAME_CLASS = "min-w-0 break-keep [overflow-wrap:anywhere]";

/** 사용자가 남긴 사유는 유지하고 자동 처리의 내부 코드는 안내 문구로 바꾼다. */
function historyReason(event: WorkReservationEvent): string | null {
  if (!event.reason) return null;
  if (event.action === "backfilled") return "기존 작업의 자재를 예약하지 못했습니다. 담당자가 작업 내용을 확인한 뒤 다시 저장해야 합니다.";
  if (event.action === "settlement_failed") return "작업을 완료하지 못했습니다. 담당자가 작업 상태를 확인해야 합니다.";
  if (event.action === "approval_changed" && event.reason === "last_as_research_approver_removed") return "승인 담당자가 없어 승인 상태가 변경되었습니다.";
  return event.reason;
}

/** 재고의 물리 위치이며 담당자 부서와 구분한다. */
export function workLocationLabel(location: WorkStockLocation): string {
  return location.bucket === "warehouse" ? "창고" : `${location.department}${location.bucket === "defective" ? " · 불량" : ""}`;
}

/** API의 구형 UTC 타임스탬프도 한국 시간으로 표시한다. */
export function workDate(value: string): string {
  return formatKstDateTime(/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
}

/** 저장 후 흐른 시간을 표시하며 오래됨 판정이나 만료 의미를 부여하지 않는다. */
export function workElapsed(value: string, now: number): string {
  const stored = Date.parse(/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
  if (!Number.isFinite(stored)) return "경과시간 확인 불가";
  const minutes = Math.max(0, Math.floor((now - stored) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return `${days ? `${days}일 ` : ""}${hours ? `${hours}시간 ` : ""}${minutes % 60}분 경과`;
}

/** 상단 담당자 정보에 이어 작업 목적과 예약 자재, 완료 후 재고를 보여준다. */
export function AdminWorkReservationDetailBody({ work }: { work: AdminWorkReservationDetail }): JSX.Element {
  return <div className="space-y-3 break-keep text-sm leading-5 [overflow-wrap:anywhere]" style={{ color: C.text }}>
    <section className="space-y-1">
      <h3 className="text-base font-bold">작업 목적</h3>
      {work.targets.length ? work.targets.map((target, index) => <div key={`${target.item_id}:${index}`} className="flex items-start justify-between gap-4 border-b py-1" style={{ borderColor: C.border }}>
        <div className="min-w-0"><p className={`${ITEM_NAME_CLASS} font-bold leading-5`}>{target.item_name}</p>{target.mes_code && <p className="mt-0.5 text-xs leading-4" style={{ color: C.muted2 }}>{target.mes_code}</p>}</div>
        <p className="shrink-0 whitespace-nowrap font-bold tabular-nums" style={{ color: C.blue }}>{formatQty(target.quantity)} {target.unit}</p>
      </div>) : <p style={{ color: C.muted2 }}>등록된 목적 품목이 없습니다.</p>}
      {work.notes && <p className="whitespace-pre-wrap" style={{ color: C.muted2 }}>{work.notes}</p>}
    </section>
    {!work.requester_active && <p className="rounded-[12px] p-3" style={{ background: C.warningBg, color: C.yellow }}>비활성 담당자 · 관리자 확인이 필요합니다.</p>}
    {work.reservation_issue && <p role="status" className="rounded-[12px] p-3" style={{ background: C.warningBg, color: C.yellow }}>{reservationIssueMessage(work.reservation_issue)}</p>}
    <section className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2"><h3 className="text-base font-bold">예약 자재</h3><span className="text-xs" style={{ color: C.muted2 }}>위치·예약 수량</span></div>
      {work.reserved_inputs.length ? <ul>{work.reserved_inputs.map((input, index) => <li key={`${input.item_id}:${index}`} className="flex items-start justify-between gap-4 border-b py-2" style={{ borderColor: C.border }}>
        <div className="min-w-0"><p className={`${ITEM_NAME_CLASS} font-bold`}>{input.item_name}</p>
        <p className="mt-0.5 text-xs leading-4" style={{ color: C.muted2 }}>{input.mes_code && <>{input.mes_code} · </>}{workLocationLabel(input.location)} · {input.source === "approval" ? "승인 대기" : "작업 중"}</p></div>
        <p className="shrink-0 whitespace-nowrap font-bold tabular-nums">{formatQty(input.quantity)} {input.unit}</p>
      </li>)}</ul> : <p style={{ color: work.reservation_status === "needs_reservation" ? C.yellow : C.muted2 }}>{work.reservation_status === "needs_reservation" ? "예약 필요 · 현재 확보된 자재가 없습니다." : "예약된 자재가 없습니다."}</p>}
    </section>
    <section className="space-y-2">
      <h3 className="text-base font-bold">완료 후 재고 변화</h3>
      <p className="text-xs" style={{ color: C.muted2 }}>완료 전에는 사용할 수 없는 예정 수량입니다. 위치만 옮기는 경우 전체 재고는 늘지 않습니다.</p>
      {work.forecast_issue && <p role="status" className="rounded-[12px] p-3" style={{ background: C.warningBg, color: C.yellow }}>예정 수량을 모두 확인할 수 없습니다. 담당자가 작업 내용을 확인해야 합니다.</p>}
      {work.expected_effects.length ? <ul>{work.expected_effects.map((effect) => <li key={effect.effect_id} className="border-b py-3" style={{ borderColor: C.border }}>
        <p className={`${ITEM_NAME_CLASS} font-bold`}>{effect.item_name}</p><p className="mt-1 text-xs" style={{ color: C.muted2 }}>{effect.mes_code && <>{effect.mes_code} · </>}{effect.kind === "move"
          ? `${workLocationLabel(effect.from)} → ${workLocationLabel(effect.to)} · 이동 ${formatQty(effect.quantity)} ${effect.unit}`
          : `${workLocationLabel(effect.kind === "in" ? effect.to : effect.from)} · ${effect.kind === "in" ? "증가" : "사용"} ${formatQty(effect.quantity)} ${effect.unit}`}</p>
      </li>)}</ul> : <p style={{ color: C.muted2 }}>{work.status === "cancelled" ? "취소된 작업의 예정은 제외되었습니다." : "확인 가능한 예정이 없습니다."}</p>}
    </section>
    <section className="space-y-2">
      <h3 className="text-base font-bold">처리 기록</h3>
      {work.history.length ? <ol className="space-y-3">{work.history.map((event) => <li key={event.event_id} className="border-l-2 pl-3" style={{ borderColor: C.border }}>
        <p className="font-bold">{EVENT_LABEL[event.action]} · {!event.actor_employee_id && event.actor_name === "system" ? "자동 처리" : event.actor_name}</p><p className="text-xs" style={{ color: C.muted2 }}>{workDate(event.occurred_at)}</p>
        {event.reason && <p className="mt-1 whitespace-pre-wrap">{historyReason(event)}</p>}
      </li>)}</ol> : <p style={{ color: C.muted2 }}>처리 기록이 없습니다.</p>}
    </section>
  </div>;
}
