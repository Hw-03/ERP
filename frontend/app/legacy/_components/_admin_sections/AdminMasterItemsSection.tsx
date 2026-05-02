"use client";

import { PackagePlus, Search } from "lucide-react";
import { LEGACY_COLORS } from "../legacyUi";
import { formatQty } from "@/lib/mes/format";
import { useAdminMasterItemsContext } from "./AdminMasterItemsContext";
import { AddItemForm } from "./_master_items_parts/AddItemForm";
import { EditItemForm } from "./_master_items_parts/EditItemForm";

/**
 * Round-11A (#3) 분해 — 좌측 목록은 본 파일, 우측 add/edit 폼은 sub-component.
 *
 * Props 없음. AdminMasterItemsProvider 의 Context 에서 모두 읽는다.
 */
export function AdminMasterItemsSection() {
  const {
    visibleItems,
    selectedItem,
    setSelectedItem,
    itemSearch,
    setItemSearch,
    addMode,
    setAddMode,
  } = useAdminMasterItemsContext();

  return (
    <div className="grid h-full gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      {/* 품목 목록 */}
      <div
        className="flex min-h-0 flex-col rounded-[28px] border"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
          <div
            className="flex items-center gap-2 rounded-[14px] border px-3 py-2"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
            <input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="품목명, 코드 검색"
              className="w-full bg-transparent text-base outline-none"
              style={{ color: LEGACY_COLORS.text }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {formatQty(visibleItems.length)}건
            </span>
            <button
              onClick={() => {
                setAddMode(true);
                setSelectedItem(null);
              }}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
              style={{ background: LEGACY_COLORS.green, color: "#fff" }}
            >
              <PackagePlus className="h-3.5 w-3.5" />
              품목 추가
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visibleItems.map((item, index) => (
            <button
              key={item.item_id}
              onClick={() => setSelectedItem(item)}
              className="block w-full px-4 py-4 text-left"
              style={{
                borderBottom: index === visibleItems.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                background:
                  selectedItem?.item_id === item.item_id
                    ? `color-mix(in srgb, ${LEGACY_COLORS.purple} 10%, transparent)`
                    : "transparent",
              }}
            >
              <div className="text-base font-semibold">{item.item_name}</div>
              <div className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>{item.erp_code}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 우측: 추가 / 편집 패널 */}
      <div
        className="overflow-y-auto rounded-[28px] border p-5"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        {addMode ? (
          <AddItemForm />
        ) : selectedItem ? (
          <EditItemForm selectedItem={selectedItem} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
              왼쪽 목록에서 품목을 선택하면<br />정보를 수정할 수 있습니다.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
