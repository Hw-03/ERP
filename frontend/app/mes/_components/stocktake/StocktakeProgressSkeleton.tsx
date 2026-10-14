import type { ReactNode } from "react";
import { SkeletonBlock } from "../common/LoadingSkeleton";

/** Preview the existing progress rows without inventing counts or participants. */
export function StocktakeProgressSkeleton({ region, active, quantityMode = false }: { region: "locations" | "workers"; active: boolean; quantityMode?: boolean }): ReactNode {
  if (region === "workers") return <div aria-hidden="true" inert>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold">작업자별 현황</h2>
      <div className="flex min-h-11 rounded-xl bg-[var(--c-s2)] p-1">
        {[{ label: "품목 수", quantity: false }, { label: "실셈 수량", quantity: true }].map(mode => <button key={mode.label} type="button" disabled className={`min-h-11 min-w-11 rounded-lg px-3 text-xs font-medium ${quantityMode === mode.quantity ? "bg-[var(--c-s1)] text-[var(--c-blue)] shadow-sm" : "text-[var(--c-muted2)]"}`}>{mode.label}</button>)}
      </div>
    </div>
    <div className={`${quantityMode ? "hidden lg:grid" : "grid"} grid-cols-[40%_minmax(0,1fr)_minmax(0,1fr)] pb-3 text-xs lg:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)]`}>
      <span className="text-center text-[var(--c-muted2)]">작업자</span><span className="text-right text-[var(--c-blue)]">확인</span><span className="text-right text-[var(--c-green)]">반영</span>
    </div>
    {Array.from({ length: 8 }, (_, index) => <div key={index} data-worker-skeleton-row className={`grid ${quantityMode ? "grid-cols-2 gap-y-2" : "grid-cols-[40%_minmax(0,1fr)_minmax(0,1fr)]"} items-center border-t border-[var(--c-border)] py-3 lg:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)]`}>
      <SkeletonBlock className={`mx-auto h-5 w-14 max-w-full ${quantityMode ? "col-span-2 lg:col-span-1" : ""}`} />
      {["확인", "반영"].map(stage => <div key={stage} className="min-w-0 lg:pl-3">{quantityMode && <span className="mb-1.5 block text-xs text-[var(--c-muted2)] lg:hidden">{stage}</span>}<div className="flex min-w-0 items-center justify-end gap-2"><SkeletonBlock className="hidden h-2 min-w-0 flex-1 rounded-full lg:block" /><SkeletonBlock className="h-5 w-12 max-w-full shrink-0 lg:w-16" /></div></div>)}
    </div>)}
  </div>;

  return <div aria-hidden="true">
    <div className="grid gap-4 rounded-xl bg-[var(--c-s2)] p-3 lg:grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] lg:gap-0 lg:px-0">
      <div className="hidden min-w-0 lg:block lg:pl-3"><span className="block font-semibold">전체</span><SkeletonBlock className="mt-1 !block h-4 w-10" /></div>
      <div className="min-w-0 lg:px-3"><MeterSkeleton label="전체 위치 확인" /></div>
      <div className="min-w-0 lg:px-3"><MeterSkeleton label="전체 위치 반영" /></div>
    </div>
    <div className="hidden grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] py-3 text-xs text-[var(--c-muted2)] lg:grid"><span>위치 · 대상</span><span className="px-3 text-right">확인</span><span className="px-3 text-right">반영</span></div>
    {Array.from({ length: 7 }, (_, index) => <div key={index} data-location-skeleton-row className="grid gap-3 border-t border-[var(--c-border)] py-4 lg:min-h-16 lg:grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] lg:gap-0 lg:py-3">
      <div className="flex items-center justify-between gap-2 lg:block"><SkeletonBlock className="!block h-5 w-10" /><SkeletonBlock className="h-4 w-10 lg:mt-1 lg:block" /></div>
      <div className="min-w-0 lg:px-3"><MeterSkeleton label="확인" compact /></div>
      <div className="min-w-0 lg:px-3"><MeterSkeleton label="반영" compact /></div>
    </div>)}
    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-[var(--c-s2)] p-3"><span className="text-[var(--c-muted2)]">{active ? "반영 대기 위치" : "종료 시 미반영 위치"}</span><SkeletonBlock className="h-5 w-12" /></div>
  </div>;
}

/** Keep labels fixed while the value and full-width meter are unresolved. */
function MeterSkeleton({ label, compact = false }: { label: string; compact?: boolean }): ReactNode {
  return <div className="min-w-0 space-y-1.5">
    <div className="flex items-baseline justify-between gap-2 text-xs"><span className={`text-[var(--c-muted2)] ${compact ? "lg:sr-only" : ""}`}>{label}</span><SkeletonBlock className="ml-auto h-5 w-28 max-w-full" /></div>
    <SkeletonBlock className="!block h-1.5 w-full rounded-full" />
  </div>;
}
