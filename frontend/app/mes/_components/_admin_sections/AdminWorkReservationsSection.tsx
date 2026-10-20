"use client";

import { useEffect, useRef, useState, type JSX } from "react";
import { ClipboardList } from "lucide-react";
import type { DepartmentMaster, Employee } from "@/lib/api";
import type { AdminWorkReservationDetail, AdminWorkReservationFilters } from "@/lib/api/types/work-reservations";
import { LEGACY_COLORS as C } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { SUB_TYPE_LABEL } from "@/lib/io/glossary";
import { useAdminWorkReservations } from "@/lib/queries/useAdminWorkReservations";
import { shouldRefreshWorkReservations } from "@/lib/queries/workReservationInvalidation";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { AdminPageHeader } from "./_admin_primitives/AdminPageHeader";
import { AdminKpiBar } from "./_admin_primitives/AdminKpiBar";
import { AdminListPanel } from "./_admin_primitives/AdminListPanel";
import { AdminDetailCard } from "./_admin_primitives/AdminDetailCard";
import { ReadFailure, ReadLoading } from "../common/ReadState";
import { EmptyState } from "../common/EmptyState";
import { StatusPill } from "../common/StatusPill";
import { AdminWorkReservationDetailBody, RESERVATION_LABEL, workDate, workElapsed, workLocationLabel } from "./AdminWorkReservationDetail";

const PAGE_SIZE = 30;
const CONTROL_CLASS = "min-h-11 min-w-11 rounded-[12px] border px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-blue)] active:scale-[0.98] disabled:opacity-50";
const CONTROL_STYLE = { borderColor: C.border, background: C.s2, color: C.text };
const ITEM_NAME_CLASS = "min-w-0 break-keep [overflow-wrap:anywhere]";

/** 메인 관리자 bootstrap과 분리된, 메뉴 진입 시 전용 조회 화면. */
export function AdminWorkReservationsSection({ departments, employees, globalSearch = "" }: { departments: DepartmentMaster[]; employees: Employee[]; globalSearch?: string }): JSX.Element {
  const [filters, setFilters] = useState<AdminWorkReservationFilters>({ sort: "updated_asc", view: "active", skip: 0, limit: PAGE_SIZE, search: globalSearch });
  const [selectedId, setSelectedId] = useState("");
  const [confirmation, setConfirmation] = useState<AdminWorkReservationDetail | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [reviewRequired, setReviewRequired] = useState(false);
  const [notice, setNotice] = useState("");
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
    setSelectedId(""); setNotice("");
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
      setConfirmation(null); setReason(""); setNotice("작업이 취소되고 예약 자재가 해제되었습니다.");
    } catch (failure) {
      const refreshRequired = shouldRefreshWorkReservations(failure);
      setReviewRequired(refreshRequired);
      setError(refreshRequired ? "작업 상태가 변경되었습니다. 창을 닫고 최신 상세를 검토한 뒤 다시 확인해 주세요." : "작업을 취소하지 못했습니다. 입력한 사유를 확인한 뒤 다시 시도해 주세요.");
    } finally { submitting.current = false; }
  }
  const filterControls = <div className="grid w-full min-w-0 grid-cols-2 gap-2">
      <select aria-label="담당 부서" className={`${CONTROL_CLASS} w-full !min-w-0`} style={CONTROL_STYLE} value={filters.requester_department ?? ""} onChange={(event) => changeFilters({ requester_department: event.target.value || undefined, requester_employee_id: undefined })}>
        <option value="">부서 전체</option>{departments.map((department) => <option key={department.id} value={department.name}>{department.name}</option>)}
      </select>
      <select aria-label="담당자" className={`${CONTROL_CLASS} w-full !min-w-0`} style={CONTROL_STYLE} value={filters.requester_employee_id ?? ""} onChange={(event) => changeFilters({ requester_employee_id: event.target.value || undefined })}>
        <option value="">담당자 전체</option>{employees.map((employee) => <option key={employee.employee_id} value={employee.employee_id}>{employee.name}{employee.is_active ? "" : " (비활성)"}</option>)}
      </select>
      <select aria-label="예약 상태" className={`${CONTROL_CLASS} col-span-2 w-full !min-w-0`} style={CONTROL_STYLE} value={filters.reservation_status ?? ""} onChange={(event) => changeFilters({ reservation_status: (event.target.value || undefined) as AdminWorkReservationFilters["reservation_status"] })}>
        <option value="">예약 상태 전체</option>{Object.entries(RESERVATION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
  </div>;
  const counts = data?.counts;
  return <section className="flex h-full min-h-0 flex-1 flex-col" aria-label="작업 예약 관리" style={{ color: C.text }}>
    <AdminPageHeader icon={ClipboardList} title="작업 예약 관리" summary={<AdminKpiBar placement="header" loading={list.isPending && ready} unavailable={!counts || list.isError || !ready} items={[
      { key: "draft", label: "작업 중", value: counts?.draft ?? "—", tone: C.blue },
      { key: "reserved", label: "예약 중", value: counts?.reserved ?? "—", tone: C.purple },
      { key: "needs", label: "예약 필요", value: counts?.needs_reservation ?? "—", tone: C.yellow },
    ]} />} />
    {!ready ? <p role="status" className="p-4 text-sm" style={{ color: C.muted2 }}>관리자 비밀번호를 확인해 주세요.</p> : <div className="flex min-h-0 flex-1 gap-4">
      <AdminListPanel title={filters.view === "cancelled" ? "취소 기록" : "작업 목록"} countLabel={data && !list.isError ? `${data.total}건` : "—"} width="clamp(360px, 30vw, 440px)" filters={filterControls}
        action={<button type="button" className={`${CONTROL_CLASS} shrink-0 whitespace-nowrap`} style={CONTROL_STYLE} aria-pressed={filters.view === "cancelled"} onClick={() => changeFilters({ view: filters.view === "cancelled" ? "active" : "cancelled" })}>{filters.view === "cancelled" ? "작업 중 보기" : "취소 기록 보기"}</button>}
        searchValue={filters.search ?? ""} searchPlaceholder="담당자·품목·작업번호 검색" onSearchChange={(search) => changeFilters({ search })}
        listAriaLabel="작업 예약 목록" externalScrollbar
        items={data?.items ?? []} read={{ loading: list.isPending, error: list.isError ? "작업 목록을 불러오지 못했습니다. 다시 시도해 주세요." : undefined, retry: () => void list.refetch() }}
        skeleton={<ReadLoading label="작업 예약 목록 불러오는 중" />}
        emptyState={<EmptyState variant="no-search-result" compact comfortable title="조건에 맞는 작업이 없습니다." description="검색어나 필터를 바꿔 확인해 주세요." />}
        footer={<div className="space-y-1"><div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--c-blue)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-blue)]" checked={filters.owner_active === false} onChange={(event) => changeFilters({ owner_active: event.target.checked ? false : undefined })} />비활성 담당자만</label>
          <select aria-label="정렬" className={CONTROL_CLASS} style={CONTROL_STYLE} value={filters.sort} onChange={(event) => changeFilters({ sort: event.target.value as AdminWorkReservationFilters["sort"] })}>
            <option value="updated_asc">오래된 저장순</option><option value="updated_desc">최근 저장순</option>
          </select>
        </div><div className="flex items-center justify-between gap-2 text-xs" style={{ color: C.muted2 }}>
          <button type="button" className={CONTROL_CLASS} style={CONTROL_STYLE} disabled={list.isFetching || (filters.skip ?? 0) === 0} onClick={() => changeFilters({ skip: Math.max(0, (filters.skip ?? 0) - PAGE_SIZE) })}>이전</button>
          <span>{data && !list.isError ? `${data.total === 0 ? 0 : data.skip + 1}–${Math.min(data.skip + data.items.length, data.total)} / ${data.total}건` : "조회 확인 필요"}</span>
          <button type="button" className={CONTROL_CLASS} style={CONTROL_STYLE} disabled={!data || list.isFetching || (filters.skip ?? 0) + PAGE_SIZE >= data.total} onClick={() => changeFilters({ skip: (filters.skip ?? 0) + PAGE_SIZE })}>다음</button>
        </div></div>}
        renderItem={(row) => <button key={row.batch_id} type="button" aria-pressed={selectedId === row.batch_id} onClick={() => { setSelectedId(row.batch_id); setNotice(""); }} className="standard-hover min-h-11 w-full shrink-0 space-y-2 border-b px-4 py-3 text-left leading-6 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--c-blue)]" style={{ borderColor: C.border, background: selectedId === row.batch_id ? `color-mix(in srgb, ${C.blue} 10%, ${C.s1})` : undefined, boxShadow: selectedId === row.batch_id ? `inset 3px 0 0 ${C.blue}` : undefined }}>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-bold">{row.requester_name}<span className="ml-2 text-xs font-medium" style={{ color: C.muted2 }}>{row.requester_department}</span></span><StatusPill label={row.status === "cancelled" ? "취소됨" : RESERVATION_LABEL[row.reservation_status]} tone={row.status === "cancelled" ? "neutral" : row.reservation_status === "needs_reservation" ? "warning" : row.reservation_status === "reserved" ? "info" : "neutral"} className="!px-2 !py-1" /></div>
          <div className="space-y-1 text-sm">{row.targets.length ? row.targets.slice(0, 2).map((target, index) => <p key={`${target.item_id}:${index}`} className="flex items-start justify-between gap-3"><span className={ITEM_NAME_CLASS}>{target.item_name}</span><span className="shrink-0 whitespace-nowrap tabular-nums" style={{ color: C.blue }}>{formatQty(target.quantity)} {target.unit}</span></p>) : <p style={{ color: C.muted2 }}>등록된 목적 품목이 없습니다.</p>}{row.targets.length > 2 && <p className="text-xs" style={{ color: C.muted2 }}>외 {row.targets.length - 2}개 품목</p>}</div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs" style={{ color: C.muted2 }}><span>{SUB_TYPE_LABEL[row.sub_type]}</span>{!row.requester_active && <span style={{ color: C.yellow }}>비활성 담당자</span>}{row.reference_no && <span className={ITEM_NAME_CLASS}>{row.reference_no}</span>}</div>
          <p className="text-xs" style={{ color: C.muted2 }}>마지막 저장 {workDate(row.updated_at)} · {workElapsed(row.updated_at, Date.now())}</p>
        </button>} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AdminDetailCard externalScrollbar selectionKey={selectedId} title={work ? SUB_TYPE_LABEL[work.sub_type] : "작업 상세"} subtitle={work ? <div className="space-y-1 break-keep leading-5 [overflow-wrap:anywhere]"><p className="flex flex-wrap items-center gap-x-2"><span className="text-sm font-bold" style={{ color: C.text }}>{work.requester_name}</span><span>{work.requester_department}</span>{work.reference_no && <span>· {work.reference_no}</span>}</p><p>마지막 저장 {workDate(work.updated_at)} · {workElapsed(work.updated_at, Date.now())}</p></div> : undefined}
          status={work ? <StatusPill label={work.status === "cancelled" ? "취소됨" : RESERVATION_LABEL[work.reservation_status]} tone={work.status === "cancelled" ? "neutral" : work.reservation_status === "needs_reservation" ? "warning" : "info"} /> : undefined}
          footer={work && !detail.isError ? <div className="flex items-center justify-between gap-4 text-sm"><span className="break-keep leading-6" style={{ color: C.muted2 }}>{work.status === "draft" ? "취소하면 이 작업의 자재 예약이 해제됩니다." : work.status === "cancelled" ? "취소된 작업입니다. 처리 기록에서 사유를 확인할 수 있습니다." : "제출한 작업은 해당 승인 요청에서 확인해 주세요."}</span>{work.status === "draft" && <button type="button" disabled={detail.isFetching || cancelling} className={`${CONTROL_CLASS} shrink-0 whitespace-nowrap font-bold`} style={{ ...CONTROL_STYLE, background: C.errorBg, color: C.red, borderColor: `color-mix(in srgb, ${C.red} 30%, transparent)` }} onClick={openCancellation}>작업 취소</button>}</div> : undefined}>
          {!selectedId ? <EmptyState variant="no-data" illustrated title="왼쪽에서 작업을 선택해 주세요." description="작업 목적과 담당자, 예약한 자재를 확인할 수 있습니다." /> : detail.isError ? <ReadFailure message="작업 상세를 불러오지 못했습니다. 다시 시도해 주세요." onRetry={() => void detail.refetch()} /> : !work ? <ReadLoading label="작업 상세 불러오는 중" /> : <AdminWorkReservationDetailBody work={work} />}
        </AdminDetailCard>
      </div>
    </div>}
    {notice && <p role="status" className="mt-2 shrink-0 text-sm" style={{ color: C.green }}>{notice}</p>}
    <ConfirmModal open={Boolean(confirmation) && ready} title="작업 예약 취소" tone="danger" wide busy={cancelling} confirmLabel="작업 취소" cancelLabel="돌아가기" confirmDisabled={!reason.trim() || reason.trim().length > 1000 || reviewRequired || !ready} onConfirm={confirmCancellation} onClose={() => { if (!submitting.current) setConfirmation(null); }}>
      {confirmation && <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1 text-sm leading-6">
        <p>이 작업을 취소하고 아래 자재의 예약을 해제합니다.</p>
        <p className={ITEM_NAME_CLASS}><strong>{confirmation.requester_name}</strong> · {confirmation.requester_department}</p>
        <div><p className="mb-1 font-bold">취소할 작업</p>{confirmation.targets.map((target, index) => <p className={`flex items-start justify-between gap-4 ${ITEM_NAME_CLASS}`} key={`${target.item_id}:${index}`}><span className={ITEM_NAME_CLASS}>{target.item_name}</span><span className="shrink-0 whitespace-nowrap tabular-nums">{formatQty(target.quantity)} {target.unit}</span></p>)}</div>
        <div><p className="mb-1 font-bold">예약을 해제할 자재</p>{confirmation.reserved_inputs.length ? confirmation.reserved_inputs.map((input, index) => <div className="flex items-start justify-between gap-4 py-1" key={`${input.item_id}:${index}`}><div className={ITEM_NAME_CLASS}><p>{input.item_name}</p><p className="text-xs" style={{ color: C.muted2 }}>{workLocationLabel(input.location)}</p></div><span className="shrink-0 whitespace-nowrap tabular-nums">{formatQty(input.quantity)} {input.unit}</span></div>) : <p style={{ color: C.muted2 }}>해제할 자재 예약이 없습니다.</p>}</div>
        <label className="block space-y-2"><span className="font-bold">취소 사유 <span style={{ color: C.red }}>(필수)</span></span><textarea aria-label="취소 사유" required className={`${CONTROL_CLASS} min-h-24 w-full resize-y py-2`} style={CONTROL_STYLE} maxLength={1000} value={reason} disabled={cancelling} onChange={(event) => setReason(event.target.value)} placeholder="작업을 취소하는 이유를 입력해 주세요." /></label>
        {error && <p role="alert" style={{ color: C.red }}>{error}</p>}
      </div>}
    </ConfirmModal>
  </section>;
}
