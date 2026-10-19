"use client";

import { useState, type ReactElement } from "react";
import { ArrowRightLeft, Box, Boxes, Network, Pencil, Plus } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import { SearchInput } from "../common/SearchInput";
import { SkeletonBlock } from "../common/LoadingSkeleton";
import { AdminDetailCard, AdminKpiBar, AdminListPanel, AdminPageHeader } from "./_admin_primitives";
import { AdminDetailSkeleton, AdminTableSkeleton } from "./_admin_primitives/AdminSkeleton";
import masterStyles from "./_admin_primitives/AdminMasterData.module.css";
import { BomStatsRow } from "./_bom_workbench/BomStatsRow";
import { readBomWorkbenchHistoryState } from "./_bom_workbench/BomWorkbench";
import { BOM_CURRENT_ROW_GRID_TEMPLATE, BOM_EDIT_LIST_GRID_TEMPLATE, BOM_WHERE_USED_ROW_GRID_TEMPLATE, BOM_SEARCH_BAR_CLASS_NAME, BOM_FILTER_BAR_CLASS_NAME, BomTableHeader } from "./_bom_workbench/BomTablePrimitives";

const noop = (): void => {};
const ENTRY_READ = { loading: true, retry: noop };
const ITEM_TABS = [{ id: "info", label: "기본 정보" }, { id: "stock", label: "재고·구매" }, { id: "bom", label: "BOM / 사용처" }];

/** 실제 카드·열·행 높이를 재사용하며 데이터 계산 없이 진입 화면만 표시한다. */
export function AdminSectionEntrySkeleton({ section }: { section: "items" | "bom" }): ReactElement {
  const [bomMode] = useState(() => typeof window === "undefined" ? "edit" : readBomWorkbenchHistoryState(window.history.state)?.mode ?? "edit");
  if (section === "items") return <div className={`flex min-h-0 flex-1 flex-col ${masterStyles.workspace}`}>
    <AdminPageHeader icon={Box} title="품목 관리" summary={<AdminKpiBar loading placement="header" items={
      ["전체 품목", "정상", "부족", "품절", "삭제"].map((label, index) => ({ key: label, label, value: "", tone: [LEGACY_COLORS.blue, LEGACY_COLORS.green, LEGACY_COLORS.yellow, LEGACY_COLORS.red, LEGACY_COLORS.muted2][index] }))
    } />} actions={<Button disabled iconLeft={<Plus className="h-4 w-4" />}>품목 추가</Button>} />
    <div className="grid min-h-0 flex-1 gap-4" style={{ gridTemplateColumns: "minmax(420px, 0.92fr) minmax(460px, 1.08fr)", gridTemplateRows: "1fr" }}>
      <AdminListPanel title="품목 목록" countLabel="조회 중" width="100%" read={ENTRY_READ}
        searchValue="" searchPlaceholder="품목명, 코드 검색" onSearchChange={noop} searchDisabled
        externalScrollbar items={[]} renderItem={() => null} skeleton={<AdminTableSkeleton columns="minmax(0,1fr) 110px 80px" count={3} />}
        listHeader={<div className={`${masterStyles.stickyHeader} grid grid-cols-[minmax(0,1fr)_110px_80px] border-b px-3 py-2 text-[12px] font-bold ${masterStyles.tableHeader}`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
          <span>품목명</span><span className="text-center">품목 코드</span><span className="text-center">상태</span>
        </div>}
      />
      <AdminDetailCard tabs={ITEM_TABS} tabsDisabled activeTab="info" footer={<SkeletonBlock className="h-11 w-full rounded-[12px]" />}>
        <AdminDetailSkeleton variant="items" />
      </AdminDetailCard>
    </div>
  </div>;

  const editing = bomMode === "edit";
  return <div className="flex min-h-0 flex-1 flex-col">
    <AdminPageHeader icon={Network} title="BOM 관리" summary={editing ? <BomStatsRow loading placement="header" total={0} done={0} wip={0} todo={0} active="ALL" onChange={noop} /> : undefined}
      actions={<div className="flex h-11 items-center gap-1 rounded-full p-1" style={{ background: LEGACY_COLORS.s2 }}>
        <Button disabled variant={editing ? "primary" : "ghost"} size="sm" iconLeft={<Pencil size={14} />}>편집</Button>
        <Button disabled variant={editing ? "ghost" : "primary"} size="sm" iconLeft={<ArrowRightLeft size={14} />}>사용처</Button>
      </div>}
    />
    <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
      <BomEntryList title="상위 품목 선택" variant={editing ? "parent" : "whereused"} columns={editing ? BOM_EDIT_LIST_GRID_TEMPLATE : "40px minmax(0, 1fr) clamp(78px, 5.75vw, 110px)"} />
      {editing && <BomEntryList title="하위 품목 추가" variant="candidate" columns={BOM_EDIT_LIST_GRID_TEMPLATE} />}
      <div className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border ${editing ? "" : "col-span-2"}`} style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}>
        <div className="flex h-[88px] shrink-0 items-center gap-3 border-b px-4" style={{ borderColor: LEGACY_COLORS.border }}>
          <SkeletonBlock className="h-6 w-8" /><div className="flex-1"><SkeletonBlock className="h-4 w-2/3" /><SkeletonBlock className="mt-2 h-3 w-1/2" /></div>
          {editing && <SkeletonBlock className="h-9 w-24 rounded-lg" />}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <BomTableHeader variant={editing ? "current" : "usage"} gridTemplateColumns={editing ? BOM_CURRENT_ROW_GRID_TEMPLATE : BOM_WHERE_USED_ROW_GRID_TEMPLATE} />
          <AdminTableSkeleton columns={editing ? BOM_CURRENT_ROW_GRID_TEMPLATE : BOM_WHERE_USED_ROW_GRID_TEMPLATE} count={editing ? 5 : 4} rowClassName="h-[37px]" />
        </div>
      </div>
    </div>
    {editing && <div className="mt-3 flex min-h-14 shrink-0 items-center gap-3 rounded-2xl border px-4" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}>
      <Boxes size={18} style={{ color: LEGACY_COLORS.yellow }} /><span className="text-sm font-bold">미배치 원자재</span><SkeletonBlock className="h-4 w-12" />
    </div>}
  </div>;
}

function BomEntryList({ title, variant, columns }: {
  title: string; variant: "parent" | "whereused" | "candidate"; columns: string;
}): ReactElement {
  return <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
    <div className={BOM_SEARCH_BAR_CLASS_NAME} style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
      <span className="shrink-0 text-xs font-bold uppercase tracking-widest" style={{ color: LEGACY_COLORS.muted2 }}>{title}</span>
      <SearchInput disabled value="" onChange={noop} placeholder="품목명 / 코드 검색" className="h-9 min-w-0 flex-1 !min-h-9 rounded-lg" inputProps={{ className: "!h-8" }} style={{ background: LEGACY_COLORS.s1 }} />
    </div>
    <div className={BOM_FILTER_BAR_CLASS_NAME} aria-hidden="true"><SkeletonBlock className="h-6 w-full rounded-md" /></div>
    <div className="min-h-0 flex-1 overflow-hidden">
      <BomTableHeader variant={variant} gridTemplateColumns={columns} />
      <AdminTableSkeleton columns={columns} count={variant === "whereused" ? 3 : 4} rowClassName="h-[37px]" />
    </div>
  </div>;
}
