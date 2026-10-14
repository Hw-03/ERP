import type { ReactNode } from "react";
import { InventoryFilterToggleButton } from "../_inventory_sections/InventoryFilterToggleButton";
import { InventorySearchToolbar } from "../_inventory_sections/InventorySearchToolbar";
import { StocktakeLayout, type StocktakeVariant } from "./StocktakeLayout";
import { StocktakeSearchHeader } from "./StocktakeSearchHeader";
import { StocktakeSummary } from "./StocktakeSummary";
import { StocktakeTargetList } from "./StocktakeTargetList";
import { StocktakeToolbarMenu } from "./StocktakeToolbarMenu";

const NO_ACTION = (): void => {};

/** Only initial content waits here; the shell and an existing count editor stay mounted. */
export function StocktakeLoadingSkeleton({ variant, canManageRounds = false }: { variant: StocktakeVariant; canManageRounds?: boolean }): ReactNode {
  return <div role="status" aria-busy="true" aria-label="재고 전수조사 준비 중" className="flex min-h-0 min-w-0 flex-1 flex-col">
    <span className="sr-only">재고 전수조사 준비 중</span>
    <div aria-hidden="true" inert className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 [--stocktake-header-top:54px]">
      <StocktakeLayout variant={variant} detail={null} detailOpen={false} onClose={NO_ACTION}>
        <StocktakeSummary variant={variant} loading>
          <StocktakeToolbarMenu variant={variant} section="count" disabled onChange={NO_ACTION} canManageRounds={canManageRounds}
            filterControl={variant === "desktop" ? <InventoryFilterToggleButton filtersOpen={false} logic="AND" onLogicChange={NO_ACTION} onToggle={NO_ACTION} disabled controlsId="stocktake-filters" ariaLabel="필터 열기" /> : undefined} />
        </StocktakeSummary>
        {variant === "mobile" && <StocktakeSearchHeader variant={variant} value="" onChange={NO_ACTION} count={0} filtered={false} onReset={NO_ACTION} disabled
          mobileToolbar={<InventorySearchToolbar value="" onChange={NO_ACTION} placeholder="품명 · 품목 코드 검색" searchLabel="품목 검색"
            filtersOpen={false} filterLogic="AND" onFilterLogicChange={NO_ACTION} onToggleFilters={NO_ACTION} isFiltered={false} disabled controlsId="stocktake-filters" />} />}
        <StocktakeTargetList variant={variant} rows={[]} waiting={false} loading skeletonRowCount={20} selection={{}} busy
          searchHeader={variant === "desktop" ? <StocktakeSearchHeader variant={variant} value="" onChange={NO_ACTION} count={0} filtered={false} onReset={NO_ACTION} disabled /> : undefined}
          imageManifest={{}} hasNextPage={false} fetchingNextPage={false} filtered={false}
          onSelect={NO_ACTION} onToggle={NO_ACTION} onMore={NO_ACTION} onReset={NO_ACTION} />
      </StocktakeLayout>
    </div>
  </div>;
}
