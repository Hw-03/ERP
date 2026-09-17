import { LEGACY_COLORS } from "@/lib/mes/color";

/** 조회 전후 작업 영역의 높이를 유지하고 요청 카드의 정보 배치를 예고한다. */
export function WarehouseLoadingWorkArea({ label }: { label: string }) {
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
