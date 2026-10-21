"use client";

import { useState, type ReactElement } from "react";
import { Box, Network, Plus } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import { SkeletonBlock } from "../common/LoadingSkeleton";
import { AdminDetailCard, AdminKpiBar, AdminListPanel, AdminPageHeader } from "./_admin_primitives";
import { AdminDetailSkeleton, AdminTableSkeleton } from "./_admin_primitives/AdminSkeleton";
import masterStyles from "./_admin_primitives/AdminMasterData.module.css";
import { BomStatsRow } from "./_bom_workbench/BomStatsRow";
import { readBomWorkbenchHistoryState } from "./_bom_workbench/BomWorkbench";
import { BOM_EDIT_LIST_GRID_TEMPLATE, BOM_SEARCH_BAR_CLASS_NAME, BOM_FILTER_BAR_CLASS_NAME, BomPanelFrame, BomStageFilters, BomTableHeader } from "./_bom_workbench/BomTablePrimitives";
import { BomViewModeControl } from "./_bom_workbench/BomViewModeControl";
import { BomSearchInput } from "./_bom_workbench/BomSearchInput";
import { BomDeptTabs } from "./_bom_workbench/BomDeptTabs";
import { BomParentHeader } from "./_bom_workbench/BomParentHeader";
import { BomEditPanel } from "./_bom_workbench/BomEditPanel";
import { BomWhereUsedPanel } from "./_bom_workbench/BomWhereUsedPanel";
import { BomUnmatchedRawsSkeleton } from "./_bom_workbench/BomUnmatchedRawsDrawer";
import { ItemDeleteButton } from "./_master_items_parts/ItemDeleteButton";
import type { BomDeptFilter } from "./_bom_workbench/bomDept";

const noop = (): void => {};
const ENTRY_READ = { loading: true, retry: noop };
const ITEM_TABS = [{ id: "info", label: "기본 정보" }, { id: "stock", label: "재고·구매" }, { id: "bom", label: "BOM / 사용처" }];

/** 실제 카드·열·행 높이를 재사용하며 데이터 계산 없이 진입 화면만 표시한다. */
export function AdminSectionEntrySkeleton({ section }: { section: "items" | "bom" }): ReactElement {
  const [bomNavigation] = useState(() => typeof window === "undefined" ? null : readBomWorkbenchHistoryState(window.history.state));
  const bomMode = bomNavigation?.mode ?? "edit";
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
      <AdminDetailCard tabs={ITEM_TABS} tabsDisabled activeTab="info" tabActions={<ItemDeleteButton disabled />} footer={<SkeletonBlock className="!block h-11 w-full rounded-[12px]" />}>
        <AdminDetailSkeleton variant="items" />
      </AdminDetailCard>
    </div>
  </div>;

  const editing = bomMode === "edit";
  return <div className="flex min-h-0 flex-1 flex-col">
    <AdminPageHeader icon={Network} title="BOM 관리" summary={editing ? <BomStatsRow loading placement="header" total={0} done={0} wip={0} todo={0} active="ALL" onChange={noop} /> : undefined}
      actions={<BomViewModeControl mode={bomMode} disabled onChange={noop} />}
    />
    {editing && <div className="mb-3 flex h-9 shrink-0 items-center gap-3" aria-label="BOM 구성 저장">
      <SkeletonBlock className="!block h-5 w-80 rounded-md" />
      <Button disabled>구성 저장</Button>
      <Button disabled>변경 취소</Button>
    </div>}
    <div data-mode={bomMode} className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
      <BomEntryList title="상위 품목 선택" dept={bomNavigation?.dept ?? "ALL"} variant={editing ? "parent" : "whereused"} columns={editing ? BOM_EDIT_LIST_GRID_TEMPLATE : "40px minmax(0, 1fr) clamp(78px, 5.75vw, 110px)"} />
      {editing && <BomEntryList title="하위 품목 추가" variant="candidate" columns={BOM_EDIT_LIST_GRID_TEMPLATE} />}
      <div className={`flex min-h-0 min-w-0 flex-col ${editing ? "" : "col-span-2"}`}>
        {editing ? <BomEditPanel parent={null} bomRows={[]} items={[]} read={ENTRY_READ} onSaveQty={noop} onRequestDelete={noop}
          parentHeader={<BomParentHeader embedded loading parent={null} mode="edit" childCount={0} isCompleted={false} onOpenReview={noop} />} />
          : <BomWhereUsedPanel selected={null} rows={[]} items={[]} read={ENTRY_READ} onSelectParent={noop}
            parentHeader={<BomParentHeader embedded loading parent={null} mode="whereused" childCount={0} isCompleted={false} onOpenReview={noop} />} />}
      </div>
    </div>
    {editing && <BomUnmatchedRawsSkeleton />}
  </div>;
}

function BomEntryList({ title, variant, columns, dept = "ALL" }: {
  title: string; variant: "parent" | "whereused" | "candidate"; columns: string; dept?: BomDeptFilter;
}): ReactElement {
  return <div data-scrollbar-rail-shell className="relative flex min-h-0 min-w-0 flex-col rounded-2xl" style={{ background: LEGACY_COLORS.s2 }}>
    <div className={BOM_SEARCH_BAR_CLASS_NAME} style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
      <span className="shrink-0 text-xs font-bold uppercase tracking-widest" style={{ color: LEGACY_COLORS.muted2 }}>{title}</span>
      {variant === "candidate" && <span className="shrink-0 whitespace-nowrap text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>완료 해제 후 수정 가능</span>}
      <div className="min-w-0 flex-1"><BomSearchInput disabled value="" onChange={noop} bg={LEGACY_COLORS.s1} /></div>
    </div>
    <div className={BOM_FILTER_BAR_CLASS_NAME}>
      <div className="overflow-x-auto"><div className="flex min-w-full w-max items-center gap-1">
        <BomStageFilters value="ALL" onChange={noop} includeRaw={variant !== "parent"} disabled label={variant === "candidate" ? "단계 필터" : "상위 품목 단계 필터"} />
        <BomDeptTabs value={dept} onChange={noop} disabled />
      </div></div>
    </div>
    <div className="relative min-h-0 flex-1">
      <div data-scrollbar-rail-viewport className="absolute inset-y-0 left-0 right-0 overflow-y-auto lg:-right-2.5 lg:[scrollbar-gutter:stable]">
      <div className="flex min-h-full min-w-full flex-col" style={{ background: LEGACY_COLORS.s2 }}>
      <BomTableHeader variant={variant} gridTemplateColumns={columns} />
      <AdminTableSkeleton columns={columns} count={variant === "whereused" ? 3 : 4} rowClassName="h-[37px]" />
      </div>
      </div>
    </div>
    <BomPanelFrame />
  </div>;
}
