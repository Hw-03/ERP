import { LEGACY_COLORS } from "@/lib/mes/color";
import { SkeletonBlock } from "../common/LoadingSkeleton";

/** 조회 전후 작업 영역의 높이를 유지하고 요청 카드의 정보 배치를 예고한다. */
export function WarehouseLoadingWorkArea({ label, mobilePresentation = false }: { label: string; mobilePresentation?: boolean }) {
  if (mobilePresentation) return (
    <section role="status" aria-busy="true" aria-label={label} data-mobile-skeleton="requests" className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((row) => <div key={row} aria-hidden="true" className="shrink-0 rounded-[16px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-center gap-2"><SkeletonBlock className="h-7 w-20 rounded-full" /><SkeletonBlock className="ml-auto h-3 w-24" /></div>
        <div className="mt-3 flex items-center justify-between gap-3"><SkeletonBlock className="h-5 w-2/3" /><SkeletonBlock className="h-5 w-12" /></div>
        <div className="mt-2"><SkeletonBlock className="h-3 w-1/2" /></div>
        <div className="mt-3 flex min-h-11 items-center gap-2 border-t pt-2" style={{ borderColor: LEGACY_COLORS.border }}><SkeletonBlock className="h-4 w-24" /><SkeletonBlock className="ml-auto h-8 w-16 rounded-[10px]" /></div>
      </div>)}
    </section>
  );
  return (
    <section role="status" aria-busy="true" aria-label={label}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-[20px] border p-4"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((row) => (
        <div key={row} aria-hidden="true" className="shrink-0 space-y-4 rounded-[16px] border p-4"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
          <div className="flex items-center gap-3">
            <div className="h-7 w-24 rounded-full motion-safe:animate-pulse" style={{ background: LEGACY_COLORS.borderStrong }} />
            <div className="h-4 w-40 max-w-[40%] rounded motion-safe:animate-pulse" style={{ background: LEGACY_COLORS.borderStrong }} />
            <div className="ml-auto h-4 w-20 rounded motion-safe:animate-pulse" style={{ background: LEGACY_COLORS.border }} />
          </div>
          <div className="h-5 w-1/3 rounded motion-safe:animate-pulse" style={{ background: LEGACY_COLORS.borderStrong }} />
          <div className="h-3 w-1/2 rounded motion-safe:animate-pulse" style={{ background: LEGACY_COLORS.border }} />
        </div>
      ))}
    </section>
  );
}
