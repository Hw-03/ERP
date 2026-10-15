"use client";
import { useItemSearch } from "@/lib/queries/useItemSearch";
import { LEGACY_COLORS } from "@/lib/mes/color";
/** Keep floating notices for failures; show loading only within search surfaces. */
export function SearchConfigStatus({ active = true, floating = false }: { active?: boolean; floating?: boolean }) {
  const { ready, error, retry } = useItemSearch();
  if (!active || (ready && !error) || (floating && !error)) return null;
  return <div role={error ? "alert" : "status"} className={`flex flex-wrap items-center gap-2 text-sm ${floating ? "fixed right-4 top-4 z-[120] max-w-[calc(100vw-2rem)] rounded-[16px] border px-4 py-3 sm:max-w-[420px]" : "px-1 py-2"}`}
    style={{ color: error ? LEGACY_COLORS.red : LEGACY_COLORS.muted2, ...(floating ? { background: "var(--c-popup-bg)", borderColor: LEGACY_COLORS.border, boxShadow: "var(--c-popup-shadow)" } : {}) }}>
    <span>{error ? `검색 설정을 불러오지 못했습니다. ${error} 별칭·동의어 결과가 최신이 아닐 수 있습니다.` : "별칭·동의어 검색 설정을 불러오는 중입니다."}</span>
    {error && <button type="button" onClick={retry} className="min-h-11 rounded-[12px] border px-3 font-semibold active:scale-[0.98]" style={{ borderColor: LEGACY_COLORS.border }}>검색 설정 재시도</button>}
  </div>;
}
