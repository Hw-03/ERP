"use client";

import { Fragment, useEffect, useState, type CSSProperties, type JSX } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ClipboardList, Sparkles } from "lucide-react";
import { ApiError } from "@/lib/api-core";
import type { WorkDraftFilters, WorkDraftSelection, WorkDraftSummary } from "@/lib/api/types/work-drafts";
import { useWorkDrafts } from "@/lib/queries/useWorkDrafts";
import { LEGACY_COLORS as C } from "@/lib/mes/color";
import { transactionColor } from "@/lib/mes/transaction";
import { formatQty } from "@/lib/mes/format";
import { Button } from "@/lib/ui/Button";
import { SearchInput } from "../common/SearchInput";
import { FilterChip } from "../common/FilterChip";
import { InventoryFilterToggleButton } from "../_inventory_sections/InventoryFilterToggleButton";
import { ReadFailure, ReadLoading } from "../common/ReadState";
import { WorkContentCover } from "./WorkContentCover";
import { AllWorkDraftDetails } from "./AllWorkDraftDetails";
import { useDeptColorLookup } from "../DepartmentsContext";
import { EmptyState } from "../common/EmptyState";
import { StatusTargetNotice, useStatusTargetNotice } from "../common/StatusTargetNotice";
import { workDate } from "../common/WorkReservationDetails";
import { FlowBadge } from "../_history_sections/historyTableHelpers";
import { finalizeHistoryGroupLabel, getHistoryListOperationLabel, getHistoryProcessGroupLabel } from "../_history_sections/historyPresentation";
import { IO_WORK_TYPES } from "../_warehouse_v2/ioWorkType";
import { WorkDraftMemo } from "../common/WorkDraftMemo";
import { formatRequestNotes } from "./ioRequestLabels";
import { formatWorkTimestamp, WORK_ITEM_CODE_CLASS, WORK_TIMESTAMP_CLASS, WORK_TYPE_BADGE_CLASS, WorkExpandButton, WorkMovementSummary } from "../common/WorkDraftTableParts";

const PAGE_SIZE = 30;
const DEPARTMENT_OPTIONS = ["창고", "튜브", "고압", "진공", "튜닝", "조립", "출하", "AS"] as const;
const CONTROL_CLASS = "min-h-11 min-w-11 !text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-blue)]";
const ITEM_CLASS = "min-w-0 break-keep [overflow-wrap:anywhere]";
const TABLE_CLASS = "w-full min-w-[1360px] table-fixed border-collapse text-left text-sm";

interface Props {
  employeeId: string;
  layout: "desktop" | "mobile";
  refreshNonce: number;
}

/** 전체 작업은 담당자에 관계없이 상세 조회만 제공한다. */
export function AllWorkDraftsPanel({ employeeId, layout, refreshNonce }: Props): JSX.Element {
  const [filters, setFilters] = useState<WorkDraftFilters>({ skip: 0, limit: PAGE_SIZE, sort: "department" });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<WorkDraftSelection | null>(null);
  const { list, detail } = useWorkDrafts(employeeId, filters, selected);
  const getDeptColor = useDeptColorLookup();
  const { notice, showNotice, dismissNotice } = useStatusTargetNotice();
  const data = list.data;
  const rows = data?.items ?? [];
  const pageOutOfRange = Boolean(data && data.total > 0 && data.skip >= data.total);
  const pending = !list.isError && (list.isPending || pageOutOfRange);
  const work = detail.data?.kind === selected?.kind && detail.data?.id === selected?.id ? detail.data : undefined;

  useEffect(() => {
    if (refreshNonce !== 0) void list.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);
  useEffect(() => {
    if (!data || list.isError || data.skip !== (filters.skip ?? 0) || data.skip === 0 || data.skip < data.total) return;
    const skip = data.total === 0 ? 0 : Math.floor((data.total - 1) / PAGE_SIZE) * PAGE_SIZE;
    setFilters((current) => ({ ...current, skip }));
    setSelected(null);
  }, [data, filters.skip, list.isError]);
  useEffect(() => {
    if (!selected || !(detail.error instanceof ApiError) || detail.error.status !== 404) return;
    setSelected(null);
    void list.refetch();
    showNotice("작업 상태가 변경되었습니다. 최신 목록을 확인해 주세요.", "info");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.error, selected]);

  function changeFilters(patch: Partial<WorkDraftFilters>): void {
    setFilters((current) => ({ ...current, ...patch, skip: patch.skip ?? 0 }));
    setSelected(null);
    if (notice) dismissNotice(notice.id);
  }
  function toggle(row: WorkDraftSummary): void {
    setSelected((current) => current?.id === row.id && current.kind === row.kind ? null : { kind: row.kind, id: row.id });
  }
  function owner(row: WorkDraftSummary): JSX.Element {
    return <div className={`${ITEM_CLASS} flex items-center gap-1.5 ${layout === "desktop" ? "justify-center" : "justify-start"}`}><p className="min-w-0 font-bold">{row.requester_name}</p><p className="shrink-0 text-xs font-normal" style={{ color: C.muted2 }}>{row.requester_department}{!row.requester_active && " · 비활성 담당자"}</p></div>;
  }
  function kind(row: WorkDraftSummary): JSX.Element {
    const meta = IO_WORK_TYPES.find((candidate) => candidate.id === row.work_type);
    const processLabel = row.history_operation && row.work_type === "process"
      ? getHistoryProcessGroupLabel(row.history_operation.transaction_type) : null;
    const label = processLabel ?? (row.history_operation ? getHistoryListOperationLabel({
      ...row.history_operation, reference_no: null, notes: null, operation_action: row.request_type,
      history_batch: row.work_type && row.sub_type ? { work_type: row.work_type, sub_type: row.sub_type } : null,
    }) : meta?.label ?? "입출고 요청");
    return <FlowBadge type={row.history_operation?.transaction_type ?? null} icon={row.history_operation ? undefined : ClipboardList} label={finalizeHistoryGroupLabel(label, row.history_operation?.transaction_type ?? null)} color={row.history_operation ? transactionColor(row.history_operation.transaction_type) : C.blue} variant={layout === "mobile" ? "panel" : "table"} className={WORK_TYPE_BADGE_CLASS} />;
  }
  function targets(row: WorkDraftSummary): JSX.Element {
    const target = row.targets[0];
    return <div className="space-y-1">{target ? <div className="flex items-start justify-between gap-3"><div className={ITEM_CLASS}><p className="font-bold">{target.item_name}</p>{target.mes_code && <p className="text-xs" style={{ color: C.muted2 }}>{target.mes_code}</p>}</div><p className="shrink-0 whitespace-nowrap font-bold tabular-nums">{formatQty(target.quantity)} {target.unit}</p></div> : <p style={{ color: C.muted2 }}>등록된 목적 품목이 없습니다.</p>}{row.targets.length > 1 && <p className="text-xs" style={{ color: C.muted2 }}>외 {row.targets.length - 1}개 품목</p>}<WorkDraftMemo notes={row.kind === "stock_request" ? formatRequestNotes(row.notes) : row.notes} /></div>;
  }
  function actions(row: WorkDraftSummary): JSX.Element {
    const expanded = selected?.id === row.id && selected.kind === row.kind;
    return <div className={`flex items-center ${layout === "desktop" ? "justify-center" : "justify-end"}`}>
      <Button variant="ghost" className={CONTROL_CLASS} aria-expanded={expanded} aria-controls={`work-draft-${row.kind}-${row.id}`} aria-label={`${row.requester_name} 작업 상세 ${expanded ? "접기" : "펼치기"}`} onClick={() => toggle(row)} iconRight={<ChevronDown size={16} aria-hidden className={expanded ? "rotate-180" : undefined} />}>상세</Button>
    </div>;
  }
  function expandedDetail(row: WorkDraftSummary): JSX.Element | null {
    if (selected?.id !== row.id || selected.kind !== row.kind) return null;
    return <div id={`work-draft-${row.kind}-${row.id}`} className="text-sm leading-6" style={{ background: C.s2 }}>
      {detail.isError ? <div className="p-4"><ReadFailure message="작업 상세를 불러오지 못했습니다. 다시 시도해 주세요." onRetry={() => void detail.refetch()} /></div> : !work ? <div className="p-4"><ReadLoading label="작업 상세 불러오는 중" /></div>
        : <AllWorkDraftDetails work={work} layout={layout} columns={columns} />}
    </div>;
  }
  const hasFilters = Boolean(filters.search?.trim() || filters.requester_department);
  const failure = list.isError ? <ReadFailure message={list.error instanceof Error ? list.error.message : "작업 목록을 불러오지 못했습니다."} refresh={data !== undefined} onRetry={() => void list.refetch()} /> : null;
  const emptyState = !pending && data?.total === 0 && !list.isError ? <EmptyState compact comfortable variant={hasFilters ? "no-search-result" : "no-data"} title={hasFilters ? "조건에 맞는 작업이 없습니다." : "저장된 작업이 없습니다."} description={hasFilters ? "검색어나 필터를 바꿔 확인해 주세요." : "작업을 저장하면 이곳에서 확인할 수 있습니다."} /> : null;
  const columns = <colgroup><col className="w-[52px]" /><col className="w-[104px]" /><col className="w-44" /><col className="w-48" /><col /><col className="w-[200px]" /><col className="w-[152px]" /><col className="w-[156px]" /></colgroup>;
  const sort = filters.sort ?? "department";
  const header = <thead className="sticky top-0 z-10" style={{ color: C.muted2, background: C.s1 }}><tr><th scope="col" aria-label="상세" className="border-b p-0" style={{ borderColor: C.border }} />{["저장 시각", "담당자 · 부서", "작업", "대상", "메모", "품목코드", "예정 변동"].map((label, index) => {
    const sortable = index < 2;
    const active = index === 0 ? sort !== "department" : index === 1 && sort === "department";
    const ascending = sort === "updated_asc" || sort === "department";
    const SortIcon = active ? ascending ? ArrowUp : ArrowDown : ArrowUpDown;
    return <th key={label} scope="col" aria-label={label} aria-sort={active ? ascending ? "ascending" : "descending" : undefined}
      className={`border-b ${sortable ? "p-0" : "px-3 py-3"} text-xs font-bold ${label === "대상" ? "text-left" : "text-center"}`} style={{ borderColor: C.border }}>
      {sortable ? <button type="button" aria-label={`${label} 정렬`}
        className="flex min-h-11 w-full items-center justify-center gap-1 rounded-[8px] px-2 font-bold hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
        style={{ color: active ? C.blue : C.muted2 }}
        onClick={() => changeFilters({ sort: index === 1 ? "department" : sort === "updated_desc" ? "updated_asc" : "updated_desc" })}>
        {label}<SortIcon size={12} aria-hidden />
      </button> : label}
    </th>;
  })}</tr></thead>;
  return <section aria-label="전체 작업 목록" className="flex min-h-0 flex-1 flex-col gap-3 text-sm leading-6" style={{ color: C.text }}>
    <div className="-mt-3 flex min-w-0 shrink-0 flex-col rounded-b-[24px] border border-t-0 px-3 pb-3" style={{ background: C.s1, borderColor: C.border }}>
    <div className="flex min-w-0 items-stretch gap-2">
      <SearchInput className="min-w-0 flex-1" style={{ background: C.bg, boxShadow: `inset 0 1px 2px color-mix(in srgb, ${C.text} 4%, transparent)` }} value={filters.search ?? ""} ariaLabel="전체 작업 검색" placeholder="담당자·품목 검색" onChange={(search) => changeFilters({ search })} />
      <InventoryFilterToggleButton filtersOpen={filtersOpen} onToggle={() => setFiltersOpen((open) => !open)} controlsId="work-draft-filter-panel" showLogic={false} logic="AND" onLogicChange={() => undefined} />
    </div>
    <div id="work-draft-filter-panel" aria-hidden={!filtersOpen} inert={!filtersOpen || undefined}
      className="grid min-w-0 transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none"
      style={{ gridTemplateRows: filtersOpen ? "1fr" : "0fr", opacity: filtersOpen ? 1 : 0 }}>
    <div className="min-h-0 overflow-hidden">
    <div className="mt-3 flex min-w-0 flex-col gap-3 border-t pt-3 lg:flex-row lg:items-center" style={{ borderColor: C.border }}>
      <div className="flex shrink-0 items-center gap-2 text-sm font-bold" style={{ color: C.muted2 }}><Sparkles size={16} aria-hidden style={{ color: C.blue }} />부서 구분</div>
      <div role="group" aria-label="부서 구분" className="sg flex min-w-0 flex-1 gap-2 overflow-x-auto">
        <FilterChip active={!filters.requester_department} label="전체" tone={C.blue} className="min-h-11 min-w-20 flex-1 shrink-0" onClick={() => changeFilters({ requester_department: undefined })} />
        {DEPARTMENT_OPTIONS.map((name) => {
          const active = filters.requester_department === name;
          const tone = name === "창고" ? C.green : getDeptColor(name);
          const amount = name === "튜닝" ? active ? 20 : 14 : active ? 14 : 7;
          return <FilterChip key={name} active={active} label={name} tone={tone}
            className="min-h-11 min-w-20 flex-1 shrink-0" style={{ background: `color-mix(in srgb, ${tone} ${amount}%, transparent)` }}
            onClick={() => changeFilters({ requester_department: active ? undefined : name })} />;
        })}
      </div>
    </div>
    </div>
    </div>
    </div>
    {layout === "desktop" ? <div className="relative min-h-0 flex-1" data-scrollbar-rail-shell>
      <div role="region" aria-label="전체 작업 중 목록" aria-busy={pending} tabIndex={0} data-scrollbar-rail-viewport className="sg absolute inset-y-0 left-0 -right-2.5 overflow-auto [scrollbar-gutter:stable] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]">
      <div className="relative flex min-h-full min-w-[1360px] flex-col" style={{ background: C.s1 }}>
      {pending && <span role="status" className="sr-only">전체 작업 목록 불러오는 중</span>}
      {failure && <div className="p-4">{failure}</div>}
      <table className={TABLE_CLASS} aria-label="전체 작업">
        {columns}{header}
        <tbody aria-hidden={pending || undefined} inert={pending || undefined}>
          {rows.map((row) => {
          const target = row.targets[0];
          const expanded = selected?.id === row.id && selected.kind === row.kind;
          const controlsId = `work-draft-${row.kind}-${row.id}`;
          const tuning = row.requester_department === "튜닝";
          const background = expanded
            ? tuning ? "bg-[color-mix(in_srgb,var(--work-department-color)_20%,transparent)]" : "bg-[color-mix(in_srgb,var(--work-department-color)_14%,transparent)]"
            : tuning ? "bg-[color-mix(in_srgb,var(--work-department-color)_14%,transparent)]" : "bg-[color-mix(in_srgb,var(--work-department-color)_7%,transparent)]";
          return <Fragment key={`${row.kind}:${row.id}`}>
            <tr tabIndex={0} aria-expanded={expanded} aria-controls={controlsId}
              className={`cursor-pointer border-t align-middle font-bold leading-5 transition-colors ${background} ${tuning ? "hover:bg-[color-mix(in_srgb,var(--work-department-color)_24%,transparent)]" : "hover:bg-[color-mix(in_srgb,var(--work-department-color)_18%,transparent)]"} focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]`}
              style={{ height: 72, borderColor: C.border, "--work-department-color": row.requester_department === "창고" ? C.green : getDeptColor(row.requester_department) } as CSSProperties} onClick={() => toggle(row)}
              onKeyDown={(event) => { if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return; event.preventDefault(); toggle(row); }}>
                <td className="p-1 text-center"><WorkExpandButton expanded={expanded} controlsId={controlsId} label={`${row.requester_name} 작업 상세`} onToggle={() => toggle(row)} /></td>
                <td className={WORK_TIMESTAMP_CLASS} style={{ color: C.muted2 }}><time dateTime={row.updated_at} title={workDate(row.updated_at)}>{formatWorkTimestamp(row.updated_at)}</time></td>
                <td className="px-4 py-2 text-center">{owner(row)}</td>
                <td className="px-3 py-2 text-center"><div className="flex justify-center">{kind(row)}</div></td>
              <td className="px-4 py-2">
                {target ? <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1"><p className={ITEM_CLASS}>{target.item_name}</p><span className="shrink-0 whitespace-nowrap font-semibold tabular-nums" style={{ color: C.muted2 }}>{formatQty(target.quantity)} {target.unit}</span>{row.targets.length > 1 && <span className="shrink-0 whitespace-nowrap text-xs font-normal" style={{ color: C.muted2 }}>외 {row.targets.length - 1}개 품목</span>}</div> : <p style={{ color: C.muted2 }}>등록된 목적 품목이 없습니다.</p>}
              </td>
              <td className="px-3 py-2"><WorkDraftMemo notes={row.kind === "stock_request" ? formatRequestNotes(row.notes) : row.notes} showEmpty /></td>
              <td className={`whitespace-nowrap ${WORK_ITEM_CODE_CLASS}`} style={{ color: C.muted2 }}>{target?.mes_code ?? "—"}</td>
              <td className="px-3 py-2 text-center"><WorkMovementSummary counts={row.movement_summary} /></td>
            </tr>
            {expanded && <tr><td colSpan={8} className="p-0">{expandedDetail(row)}</td></tr>}
          </Fragment>;
        })}</tbody>
      </table>
      {emptyState && <div className="flex flex-1 items-center justify-center p-4">{emptyState}</div>}
      <WorkContentCover pending={pending} failed={list.isError} surface><table className={TABLE_CLASS}>{columns}{header}</table></WorkContentCover>
      </div>
      </div>
      <div aria-hidden data-scrollbar-rail-frame className="pointer-events-none absolute inset-0 z-20 rounded-[24px] border" style={{ borderColor: C.border }} />
      <div aria-hidden data-scrollbar-rail-masks className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between">
        <div className="flex justify-between"><span className="h-6 w-6" style={{ background: "radial-gradient(circle at 100% 100%, transparent 0 23px, var(--c-bg) 24px)" }} /><span className="h-6 w-6" style={{ background: "radial-gradient(circle at 0 100%, transparent 0 23px, var(--c-bg) 24px)" }} /></div>
        <div className="flex justify-between"><span className="h-6 w-6" style={{ background: "radial-gradient(circle at 100% 0, transparent 0 23px, var(--c-bg) 24px)" }} /><span className="h-6 w-6" style={{ background: "radial-gradient(circle at 0 0, transparent 0 23px, var(--c-bg) 24px)" }} /></div>
      </div>
    </div> : <div className="relative grid min-h-0 flex-1">
      {pending && <span role="status" className="sr-only">전체 작업 목록 불러오는 중</span>}
      <div className="col-start-1 row-start-1" aria-hidden={pending || undefined} inert={pending || undefined}>
      {failure}
      {emptyState}
      {rows.length > 0 && <div className="space-y-3">{rows.map((row) => <article key={`${row.kind}:${row.id}`} aria-label={`${row.requester_name} 작업`} className="overflow-hidden rounded-[20px] border" style={{ borderColor: C.border, background: C.s1 }}><div className="space-y-3 p-4">{owner(row)}{kind(row)}{targets(row)}<WorkMovementSummary counts={row.movement_summary} /><p className="text-xs tabular-nums" style={{ color: C.muted2 }}>저장 <time dateTime={row.updated_at}>{workDate(row.updated_at)}</time></p>{actions(row)}</div>{expandedDetail(row)}</article>)}</div>}
      </div>
      <WorkContentCover pending={pending} failed={list.isError} />
    </div>}
    {data && !list.isError && !pending && data.total > PAGE_SIZE && <div aria-label="작업 목록 페이지 이동" className={`flex shrink-0 items-center justify-between gap-2 text-xs ${layout === "desktop" ? "rounded-[24px] border px-3 py-2" : ""}`} style={{ color: C.muted2, ...(layout === "desktop" ? { background: C.s1, borderColor: C.border } : {}) }}>
      <Button variant="secondary" className={CONTROL_CLASS} disabled={list.isFetching || (filters.skip ?? 0) === 0} onClick={() => changeFilters({ skip: Math.max(0, (filters.skip ?? 0) - PAGE_SIZE) })}>이전</Button>
      <span>{data.skip + 1}–{Math.min(data.skip + data.items.length, data.total)} / {data.total}건</span>
      <Button variant="secondary" className={CONTROL_CLASS} disabled={list.isFetching || (filters.skip ?? 0) + PAGE_SIZE >= data.total} onClick={() => changeFilters({ skip: (filters.skip ?? 0) + PAGE_SIZE })}>다음</Button>
    </div>}
    {notice && <StatusTargetNotice key={notice.id} notice={notice} onArrive={dismissNotice} />}
  </section>;
}
