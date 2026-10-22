"use client";

import { useEffect, useRef, useState, type JSX } from "react";
import type { DepartmentMaster, Employee } from "@/lib/api";
import type { AdminWorkReservationDetail, AdminWorkReservationFilters } from "@/lib/api/types/work-reservations";
import { LEGACY_COLORS as C } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { SUB_TYPE_LABEL } from "@/lib/io/glossary";
import { useAdminWorkReservations } from "@/lib/queries/useAdminWorkReservations";
import { shouldRefreshWorkReservations } from "@/lib/queries/workReservationInvalidation";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { Button } from "@/lib/ui/Button";
import { AdminListPanel } from "./_admin_primitives/AdminListPanel";
import { AdminDetailCard } from "./_admin_primitives/AdminDetailCard";
import { ReadFailure, ReadLoading } from "../common/ReadState";
import { EmptyState } from "../common/EmptyState";
import { StatusPill } from "../common/StatusPill";
import { AppSelect } from "../common/AppSelect";
import { StatusTargetNotice, useStatusTargetNotice } from "../common/StatusTargetNotice";
import { AdminWorkReservationDetailBody, adminWorkReservationLabel, workElapsed, workLocationLabel } from "./AdminWorkReservationDetail";

const PAGE_SIZE = 30;
const CONTROL_CLASS = "min-h-11 min-w-11 rounded-[12px] border px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-blue)] active:scale-[0.98] disabled:opacity-50";
const CONTROL_STYLE = { borderColor: C.border, background: C.s2, color: C.text };
const ITEM_NAME_CLASS = "min-w-0 break-keep [overflow-wrap:anywhere]";

/** 메인 관리자 bootstrap과 분리된, 메뉴 진입 시 전용 조회 화면. */
export function AdminWorkReservationsSection({ departments, employees, globalSearch = "" }: { departments: DepartmentMaster[]; employees: Employee[]; globalSearch?: string }): JSX.Element {
  const [filters, setFilters] = useState<AdminWorkReservationFilters>({ skip: 0, limit: PAGE_SIZE, search: globalSearch });
  const [selectedId, setSelectedId] = useState("");
  const [confirmation, setConfirmation] = useState<AdminWorkReservationDetail | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [reviewRequired, setReviewRequired] = useState(false);
  const { notice, showNotice, dismissNotice } = useStatusTargetNotice();
  const submitting = useRef(false);
  const previousSelection = useRef("");
  const { ready, list, detail, cancel, cancelling } = useAdminWorkReservations(filters, selectedId);
  const data = ready ? list.data : undefined;
  const work = ready && detail.data?.batch_id === selectedId ? detail.data : undefined;
  useEffect(() => { setFilters((current) => ({ ...current, search: globalSearch, skip: 0 })); setSelectedId(""); }, [globalSearch]);
  useEffect(() => {
    if (!ready) { setConfirmation(null); setReason(""); setError(""); }
  }, [ready]);

  function changeFilters(patch: Partial<AdminWorkReservationFilters>): void {
    setFilters((current) => ({ ...current, ...patch, skip: patch.skip ?? 0 }));
    setSelectedId(""); if (notice) dismissNotice(notice.id);
  }
  function openCancellation(): void {
    if (!work || work.status !== "draft" || !ready || detail.isFetching || detail.isError) return;
    if (previousSelection.current !== selectedId) setReason("");
    previousSelection.current = selectedId;
    setError(""); setReviewRequired(false); setConfirmation(work);
  }
  async function confirmCancellation(): Promise<void> {
    if (!ready || !confirmation || !reason.trim() || reason.trim().length > 1000 || reviewRequired || submitting.current) return;
    submitting.current = true;
    try {
      await cancel(confirmation.batch_id, { expected_revision: confirmation.revision, reason });
      setConfirmation(null); setReason(""); showNotice("작업이 삭제되고 예약 자재가 해제되었습니다.", "success");
    } catch (failure) {
      const refreshRequired = shouldRefreshWorkReservations(failure);
      setReviewRequired(refreshRequired);
      setError(refreshRequired ? "작업 상태가 변경되었습니다. 창을 닫고 최신 상세를 검토한 뒤 다시 확인해 주세요." : "작업을 삭제하지 못했습니다. 입력한 사유를 확인한 뒤 다시 시도해 주세요.");
    } finally { submitting.current = false; }
  }
  const filterControls = <div className="grid w-full min-w-0 grid-cols-2 gap-2 [&_ul[role=listbox]]:max-h-[min(16rem,30dvh)]">
      <AppSelect triggerAriaLabel="담당 부서" className="min-w-0" triggerClassName={`${CONTROL_CLASS} !min-w-0 !rounded-[12px]`} triggerStyle={CONTROL_STYLE}
        value={filters.requester_department ?? ""} onChange={(value) => changeFilters({ requester_department: value || undefined, requester_employee_id: undefined })}
        options={[{ value: "", label: "부서 전체" }, ...departments.map((department) => ({ value: department.name, label: department.name }))]} />
      <AppSelect triggerAriaLabel="담당자" className="min-w-0" triggerClassName={`${CONTROL_CLASS} !min-w-0 !rounded-[12px]`} triggerStyle={CONTROL_STYLE}
        value={filters.requester_employee_id ?? ""} onChange={(value) => changeFilters({ requester_employee_id: value || undefined })}
        options={[{ value: "", label: "담당자 전체" }, ...employees.map((employee) => ({ value: employee.employee_id, label: `${employee.name}${employee.is_active ? "" : " (비활성)"}` }))]} />
  </div>;
  const hasListFilters = Boolean(filters.search?.trim() || filters.requester_department || filters.requester_employee_id);
  const emptyWorkList = data?.total === 0 && !list.isError && !hasListFilters;
  return <section className="flex h-full min-h-0 flex-1 flex-col" aria-label="작업 관리" style={{ color: C.text }}>
    {!ready ? <p role="status" className="p-4 text-sm" style={{ color: C.muted2 }}>관리자 비밀번호를 확인해 주세요.</p> : <div className="flex min-h-0 flex-1 gap-4">
      <AdminListPanel title="작업 목록" countLabel={data && !list.isError ? `${data.total}건` : "—"} width="clamp(360px, 30vw, 440px)" filters={filterControls} inlineSearch
        searchValue={filters.search ?? ""} searchPlaceholder="담당자·품목·작업번호 검색" onSearchChange={(search) => changeFilters({ search })}
        listAriaLabel="작업 예약 목록" listClassName="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden rounded-[12px] border border-[var(--c-border)] [scrollbar-gutter:stable]"
        items={data?.items ?? []} read={{ loading: list.isPending, error: list.isError ? "작업 목록을 불러오지 못했습니다. 다시 시도해 주세요." : undefined, retry: () => void list.refetch() }}
        skeleton={<ReadLoading label="작업 예약 목록 불러오는 중" />}
        emptyState={<EmptyState variant={hasListFilters ? "no-search-result" : "no-data"} compact comfortable title={hasListFilters ? "조건에 맞는 작업이 없습니다." : "저장된 작업이 없습니다."} description={hasListFilters ? "검색어나 필터를 바꿔 확인해 주세요." : "작업을 저장하면 이곳에서 확인할 수 있습니다."} />}
        footer={<div className="flex items-center justify-between gap-2 text-xs" style={{ color: C.muted2 }}>
          <Button type="button" variant="secondary" className={`${CONTROL_CLASS} !px-3 !text-sm`} style={CONTROL_STYLE} disabled={list.isFetching || (filters.skip ?? 0) === 0} onClick={() => changeFilters({ skip: Math.max(0, (filters.skip ?? 0) - PAGE_SIZE) })}>이전</Button>
          <span>{data && !list.isError ? `${data.total === 0 ? 0 : data.skip + 1}–${Math.min(data.skip + data.items.length, data.total)} / ${data.total}건` : "조회 확인 필요"}</span>
          <Button type="button" variant="secondary" className={`${CONTROL_CLASS} !px-3 !text-sm`} style={CONTROL_STYLE} disabled={!data || list.isFetching || (filters.skip ?? 0) + PAGE_SIZE >= data.total} onClick={() => changeFilters({ skip: (filters.skip ?? 0) + PAGE_SIZE })}>다음</Button>
        </div>}
        renderItem={(row) => <button key={row.batch_id} type="button" aria-pressed={selectedId === row.batch_id} onClick={() => { setSelectedId(row.batch_id); if (notice) dismissNotice(notice.id); }} className="standard-hover min-h-11 w-full shrink-0 space-y-2 border-b px-4 py-4 text-left leading-6 transition-colors last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--c-blue)]" style={{ borderColor: C.border, background: selectedId === row.batch_id ? `color-mix(in srgb, ${C.blue} 6%, ${C.s1})` : undefined }}>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-bold">{row.requester_name}<span className="ml-2 text-xs font-medium" style={{ color: C.muted2 }}>{row.requester_department}</span></span><StatusPill label={adminWorkReservationLabel(row)} tone={row.status === "draft" ? "info" : "neutral"} className="!px-2 !py-1" /></div>
          <div className="space-y-1 text-sm">{row.targets.length ? row.targets.slice(0, 2).map((target, index) => <p key={`${target.item_id}:${index}`} className="flex items-start justify-between gap-3"><span className={ITEM_NAME_CLASS}>{target.item_name}</span><span className="shrink-0 whitespace-nowrap font-bold tabular-nums">{formatQty(target.quantity)} {target.unit}</span></p>) : <p style={{ color: C.muted2 }}>등록된 목적 품목이 없습니다.</p>}{row.targets.length > 2 && <p className="text-xs" style={{ color: C.muted2 }}>외 {row.targets.length - 2}개 품목</p>}</div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs" style={{ color: C.muted2 }}><span>{SUB_TYPE_LABEL[row.sub_type]}</span>{!row.requester_active && <span style={{ color: C.yellow }}>비활성 담당자</span>}<span>저장 후 {workElapsed(row.updated_at, Date.now())}</span></div>
        </button>} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AdminDetailCard selectionKey={selectedId} title={work ? `${SUB_TYPE_LABEL[work.sub_type]} 작업` : "작업 상세"}
          status={work ? <StatusPill label={adminWorkReservationLabel(work)} tone={work.status === "draft" ? "info" : "neutral"} /> : undefined}
          footer={work && !detail.isError ? <div className="flex items-center justify-between gap-4 text-sm"><span className="break-keep leading-6" style={{ color: C.muted2 }}>{work.status === "draft" ? "삭제하면 이 작업의 자재 예약이 해제됩니다." : work.status === "cancelled" ? "삭제된 작업입니다. 처리 기록에서 사유를 확인할 수 있습니다." : "제출한 작업은 해당 승인 요청에서 확인해 주세요."}</span>{work.status === "draft" && <Button type="button" variant="secondary" disabled={detail.isFetching || cancelling} className={`${CONTROL_CLASS} shrink-0 whitespace-nowrap !px-3 !text-sm font-bold`} style={{ ...CONTROL_STYLE, background: C.errorBg, color: C.red, borderColor: `color-mix(in srgb, ${C.red} 30%, transparent)` }} onClick={openCancellation}>작업 삭제</Button>}</div> : undefined}>
          {!selectedId ? <EmptyState variant="no-data" illustrated className="h-full" title={emptyWorkList ? "작업 예약이 없습니다." : "왼쪽에서 작업을 선택해 주세요."} description={emptyWorkList ? "작업이 등록되면 담당자와 자재 내역을 확인할 수 있습니다." : "작업 목적과 담당자, 예약한 자재를 확인할 수 있습니다."} /> : detail.isError ? <ReadFailure message="작업 상세를 불러오지 못했습니다. 다시 시도해 주세요." onRetry={() => void detail.refetch()} /> : !work ? <ReadLoading label="작업 상세 불러오는 중" /> : <AdminWorkReservationDetailBody work={work} />}
        </AdminDetailCard>
      </div>
    </div>}
    {notice && <StatusTargetNotice key={notice.id} notice={notice} onArrive={dismissNotice} />}
    <ConfirmModal open={Boolean(confirmation) && ready} title="작업 삭제" tone="danger" wide busy={cancelling} confirmLabel="작업 삭제" cancelLabel="돌아가기" confirmDisabled={!reason.trim() || reason.trim().length > 1000 || reviewRequired || !ready} onConfirm={confirmCancellation} onClose={() => { if (!submitting.current) setConfirmation(null); }}>
      {confirmation && <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1 text-sm leading-6">
        <p>이 작업을 삭제하고 아래 자재의 예약을 해제합니다.</p>
        <p className={ITEM_NAME_CLASS}><strong>{confirmation.requester_name}</strong> · {confirmation.requester_department}</p>
        <div><p className="mb-1 font-bold">삭제할 작업</p>{confirmation.targets.map((target, index) => <p className={`flex items-start justify-between gap-4 ${ITEM_NAME_CLASS}`} key={`${target.item_id}:${index}`}><span className={ITEM_NAME_CLASS}>{target.item_name}</span><span className="shrink-0 whitespace-nowrap tabular-nums">{formatQty(target.quantity)} {target.unit}</span></p>)}</div>
        <div><p className="mb-1 font-bold">예약을 해제할 자재</p>{confirmation.reserved_inputs.length ? confirmation.reserved_inputs.map((input, index) => <div className="flex items-start justify-between gap-4 py-1" key={`${input.item_id}:${index}`}><div className={ITEM_NAME_CLASS}><p>{input.item_name}</p><p className="text-xs" style={{ color: C.muted2 }}>{workLocationLabel(input.location)}</p></div><span className="shrink-0 whitespace-nowrap tabular-nums">{formatQty(input.quantity)} {input.unit}</span></div>) : <p style={{ color: C.muted2 }}>해제할 자재 예약이 없습니다.</p>}</div>
        <label className="block space-y-2"><span className="font-bold">삭제 사유 <span style={{ color: C.red }}>(필수)</span></span><textarea aria-label="삭제 사유" required className={`${CONTROL_CLASS} min-h-24 w-full resize-y py-2`} style={CONTROL_STYLE} maxLength={1000} value={reason} disabled={cancelling} onChange={(event) => setReason(event.target.value)} placeholder="작업을 삭제하는 이유를 입력해 주세요." /></label>
        {error && <p role="alert" style={{ color: C.red }}>{error}</p>}
      </div>}
    </ConfirmModal>
  </section>;
}
