"use client";

// AdminBomSection 좌측 — 상위 품목 선택 패널.
// AdminBomContext 의존 (prop drilling 0).

import { LEGACY_COLORS } from "@/lib/mes/color";
import { BOM_PARENT_CATS } from "../adminShared";
import { useAdminBomContext } from "../AdminBomContext";

export function BomParentPicker() {
  const {
    parentId,
    setParentId,
    setPendingChildId,
    bomParentItems,
    bomParentSearch,
    setBomParentSearch,
    bomParentCat,
    setBomParentCat,
    setBomChildSearch,
    setBomChildCat,
    bomParentDisplayLimit,
    setBomParentDisplayLimit,
    setChildPickerOpen,
  } = useAdminBomContext();

  const displayed = bomParentItems.slice(0, bomParentDisplayLimit);

  return (
    <div
      className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          상위 품목 선택
        </div>
        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          RM 제외 · {displayed.length} / {bomParentItems.length}건
        </div>
      </div>
      <div className="shrink-0 px-3 pt-3">
        <input
          value={bomParentSearch}
          onChange={(e) => setBomParentSearch(e.target.value)}
          placeholder="품목명 / 품목 코드 검색"
          className="mb-2 w-full rounded-[12px] border px-3 py-1.5 text-sm outline-none"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        />
        <div className="mb-2 flex flex-wrap gap-1">
          {BOM_PARENT_CATS.map((cat) => (
            <button
              key={cat}
              onClick={() => setBomParentCat(cat)}
              className="rounded-full px-2 py-0.5 text-xs font-bold"
              style={{
                background: bomParentCat === cat ? LEGACY_COLORS.blue : LEGACY_COLORS.s1,
                color: bomParentCat === cat ? "#fff" : LEGACY_COLORS.muted2,
                border: `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto">
        {displayed.map((item, index) => (
          <button
            key={item.item_id}
            onClick={() => {
              setParentId(item.item_id);
              setPendingChildId(null);
              setBomChildSearch("");
              setBomChildCat("ALL");
              setChildPickerOpen(false);
            }}
            className="block w-full px-3 py-2.5 text-left transition-colors"
            style={{
              background:
                parentId === item.item_id
                  ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
                  : "transparent",
              borderBottom: index === displayed.length - 1 && bomParentItems.length <= bomParentDisplayLimit ? "none" : `1px solid ${LEGACY_COLORS.border}`,
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="shrink-0 rounded px-1 py-0.5 text-xs font-bold"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 12%, transparent)`,
                  color: LEGACY_COLORS.blue,
                }}
              >
                {item.process_type_code ?? "-"}
              </span>
              <div
                className="truncate text-sm font-medium"
                style={{ color: parentId === item.item_id ? LEGACY_COLORS.blue : LEGACY_COLORS.text }}
              >
                {item.item_name}
              </div>
            </div>
            <div className="mt-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{item.erp_code}</div>
          </button>
        ))}
        {bomParentItems.length > bomParentDisplayLimit && (
          <button
            onClick={() => setBomParentDisplayLimit(bomParentDisplayLimit + 30)}
            className="w-full py-2.5 text-xs font-medium"
            style={{
              color: LEGACY_COLORS.blue,
              borderTop: `1px solid ${LEGACY_COLORS.border}`,
            }}
          >
            더보기 ({bomParentItems.length - bomParentDisplayLimit}개)
          </button>
        )}
        {displayed.length === 0 && (
          <div className="px-4 py-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>결과 없음</div>
        )}
      </div>
    </div>
  );
}
