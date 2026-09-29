import { SkeletonBlock } from "../../common/LoadingSkeleton";

/** Keep the restored wizard's header and working area in place before its draft arrives. */
export function MobileIoRestoreSkeleton() {
  return <div role="status" aria-busy="true" aria-label="저장한 작업 불러오는 중" className="flex h-full min-h-0 flex-col">
    <span className="sr-only">저장한 작업을 불러오는 중입니다.</span>
    <div aria-hidden="true" className="flex min-h-[44px] shrink-0 items-center gap-2 border-b border-[var(--c-border)] px-3 py-2"><SkeletonBlock className="h-7 w-7" /><SkeletonBlock className="h-4 w-28" /><SkeletonBlock className="ml-auto h-3 w-24" /></div>
    <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 pt-2">{[0, 1, 2, 3].map((row) => <div key={row} className="flex min-h-[72px] items-center gap-3 rounded-[14px] border border-[var(--c-border)] px-4 py-3"><SkeletonBlock className="h-6 w-6" /><SkeletonBlock className="h-4 w-2/3" /></div>)}</div>
  </div>;
}
