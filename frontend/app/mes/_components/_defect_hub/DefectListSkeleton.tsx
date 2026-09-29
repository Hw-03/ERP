import { LEGACY_COLORS } from "@/lib/mes/color";
import { SkeletonBlock } from "../common/LoadingSkeleton";

/** Reserve the department heading and item rows while their values are unknown. */
export function DefectListSkeleton() {
  return <div aria-hidden="true" className="overflow-hidden rounded-[16px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
    <div className="flex min-h-11 items-center gap-3 border-b px-3 py-2" style={{ borderColor: LEGACY_COLORS.border }}><SkeletonBlock className="h-4 w-24" /><SkeletonBlock className="ml-auto h-4 w-12" /></div>
    {[0, 1, 2, 3].map((row) => <div key={row} className="flex min-h-[72px] items-center gap-3 border-b px-3 py-3" style={{ borderColor: LEGACY_COLORS.border }}><div className="flex min-w-0 flex-1 flex-col gap-2"><SkeletonBlock className="h-4 w-3/4" /><SkeletonBlock className="h-3 w-1/2" /></div><SkeletonBlock className="h-5 w-12" /><SkeletonBlock className="h-8 w-16 rounded-[10px]" /></div>)}
  </div>;
}
