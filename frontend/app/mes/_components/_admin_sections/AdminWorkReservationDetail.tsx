"use client";

import type { JSX } from "react";
import { ChevronDown } from "lucide-react";
import type { AdminWorkReservationDetail, WorkReservationEvent, WorkReservationSummary } from "@/lib/api/types/work-reservations";
import { LEGACY_COLORS as C } from "@/lib/mes/color";
import { reservationIssueMessage } from "@/lib/io/reservation-message";
import { WorkExpectedEffects, WorkReservedInputs, WorkTargets, workDate } from "../common/WorkReservationDetails";
import { StocktakePauseNotice } from "../common/StocktakePauseNotice";
export { workLocationLabel } from "../common/WorkReservationDetails";

const EVENT_LABEL = { saved: "작업 저장", submitted: "작업 제출", returned: "작업 회수", backfilled: "기존 작업 확인", admin_cancelled: "관리자 취소", owner_deleted: "담당자 삭제", approval_changed: "승인 상태 변경", settlement_failed: "완료 처리 실패", stocktake_paused: "전수조사로 일시중지", stocktake_resumed: "작업 재개" };
const DISCLOSURE_CLASS = "group rounded-[12px] border px-3";
const SUMMARY_CLASS = "flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-[12px] text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-blue)] [&::-webkit-details-marker]:hidden";
const STATUS_LABEL = { draft: "작업 중", submitted: "승인 대기", reserved: "승인 대기", completed: "완료", partially_completed: "일부 완료", rejected: "반려", cancelled: "취소됨", failed: "처리 실패" };

/** 자재 확보 여부 대신 실제 작업 진행 상태와 조치가 필요한 반려를 표시한다. */
export function adminWorkReservationLabel(work: WorkReservationSummary): string {
  if (work.stocktake_pause) return "일시중지";
  if (work.status === "draft" && work.reservation_issue?.code === "returned_after_rejection") return "반려됨";
  return STATUS_LABEL[work.status];
}

/** 사용자가 남긴 사유는 유지하고 자동 처리의 내부 코드는 안내 문구로 바꾼다. */
function historyReason(event: WorkReservationEvent): string | null {
  if (!event.reason) return null;
  if (event.action === "backfilled") return "기존 작업의 자재를 예약하지 못했습니다. 담당자가 작업 내용을 확인한 뒤 다시 저장해야 합니다.";
  if (event.action === "settlement_failed") return "작업을 완료하지 못했습니다. 담당자가 작업 상태를 확인해야 합니다.";
  if (event.action === "approval_changed" && event.reason === "last_as_research_approver_removed") return "승인 담당자가 없어 승인 상태가 변경되었습니다.";
  return event.reason;
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

/** 작업 목적과 완료 결과를 먼저 보여주고 자재와 기록을 단계적으로 확인한다. */
export function AdminWorkReservationDetailBody({ work }: { work: AdminWorkReservationDetail }): JSX.Element {
  const latestEvent = work.history[work.history.length - 1];
  const visibleEvents = work.history.filter((event) => event.reason || ["admin_cancelled", "owner_deleted", "settlement_failed", "backfilled", "approval_changed", "stocktake_paused", "stocktake_resumed"].includes(event.action));
  return <div className="space-y-4 break-keep text-sm leading-6 [overflow-wrap:anywhere]" style={{ color: C.text }}>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-x-6 gap-y-4">
    <section className="min-w-0 space-y-3">
      <WorkTargets targets={work.targets} />
      <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs leading-5" style={{ color: C.muted2 }}>
        <div className="flex flex-wrap items-baseline gap-x-2"><dt>담당</dt><dd><span className="text-sm font-bold" style={{ color: C.text }}>{work.requester_name}</span> · {work.requester_department}</dd></div>
        <div className="flex items-baseline gap-2"><dt className="sr-only">작업 상태</dt><dd>{adminWorkReservationLabel(work)}</dd></div>
        <div className="flex flex-wrap items-baseline gap-x-2"><dt>저장</dt><dd><time dateTime={work.updated_at}>{workDate(work.updated_at)}</time></dd></div>
      </dl>
      {work.notes && <p className="whitespace-pre-wrap" style={{ color: C.muted2 }}>{work.notes}</p>}
      <StocktakePauseNotice pause={work.stocktake_pause} />
      {!work.requester_active && <p role="status" className="rounded-[12px] p-3" style={{ background: C.warningBg, color: C.yellow }}>비활성 담당자 · 관리자 확인이 필요합니다.</p>}
      {work.reservation_issue && <p role="status" className="rounded-[12px] p-3" style={{ background: C.warningBg, color: C.yellow }}>{reservationIssueMessage(work.reservation_issue)}</p>}
    </section>

    <WorkExpectedEffects effects={work.expected_effects} forecastIssue={work.forecast_issue} cancelled={work.status === "cancelled"} />
    </div>

    <WorkReservedInputs inputs={work.reserved_inputs} />

    <section className="space-y-3 border-t pt-5" style={{ borderColor: C.border }}>
      <h3 className="text-base font-bold">처리 기록</h3>
      {latestEvent ? <>
        <div><p>최근 처리 · {EVENT_LABEL[latestEvent.action]} · {!latestEvent.actor_employee_id && latestEvent.actor_name === "system" ? "자동 처리" : latestEvent.actor_name}</p><p className="mt-0.5 text-xs" style={{ color: C.muted2 }}>{workDate(latestEvent.occurred_at)}</p></div>
        {visibleEvents.map((event) => <div key={event.event_id} className="rounded-[12px] px-4 py-3" style={{ background: event.action === "admin_cancelled" || event.action === "owner_deleted" ? C.bg : C.warningBg }}>
          <p className="font-bold">{EVENT_LABEL[event.action]}</p>
          {event.reason && <p className="mt-1 whitespace-pre-wrap">{historyReason(event)}</p>}
          <p className="mt-1 text-xs" style={{ color: C.muted2 }}>{!event.actor_employee_id && event.actor_name === "system" ? "자동 처리" : event.actor_name} · {workDate(event.occurred_at)}</p>
        </div>)}
        <details className={DISCLOSURE_CLASS} style={{ borderColor: C.border }}>
          <summary className={SUMMARY_CLASS}><span>전체 처리 기록 {work.history.length}건 보기</span><ChevronDown size={16} aria-hidden className="shrink-0 transition-transform group-open:rotate-180" /></summary>
          <ol className="divide-y divide-[var(--c-border)] border-t" style={{ borderColor: C.border }}>{work.history.map((event) => <li key={event.event_id} className="py-3">
            <p>{EVENT_LABEL[event.action]} · {!event.actor_employee_id && event.actor_name === "system" ? "자동 처리" : event.actor_name}</p><p className="mt-0.5 text-xs" style={{ color: C.muted2 }}>{workDate(event.occurred_at)}</p>
          </li>)}</ol>
        </details>
      </> : <p style={{ color: C.muted2 }}>처리 기록이 없습니다.</p>}
    </section>
  </div>;
}
