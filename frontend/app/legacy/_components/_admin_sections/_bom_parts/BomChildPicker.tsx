"use client";

// 5.6-E: AdminBomSection 우측 상단 — 하위 품목 추가 카드.
// 부모 미선택 시 안내 메시지, 선택 시 검색·필터·소요량 입력.
// AdminBomContext 의존.

import { LEGACY_COLORS } from "../../legacyUi";
import { BOM_CHILD_CATS } from "../adminShared";
import { useAdminBomContext } from "../AdminBomContext";

export function BomChildPicker() {
  const {
    items,
    parentId,
    bomRows,
    bomChildItems,
    bomChildSearch,
    setBomChildSearch,
    bomChildCat,
    setBomChildCat,
    pendingChildId,
    setPendingChildId,
    pendingChildQty,
    setPendingChildQty,
    addBomRow: onAddBomRow,
  } = useAdminBomContext();

  if (!parentId) {
    return (
      <div
        className="shrink-0 overflow-hidden rounded-[28px] border"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <div className="px-5 py-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
          ← 좌측에서 상위 품목을 선택하세요
        </div>
      </div>
    );
  }

  const parent = items.find((i) => i.item_id === parentId);

  return (
    <div
      className="shrink-0 overflow-hidden rounded-[28px] border"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div
        className="flex items-center justify-between border-b px-5 py-3"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <div>
          <span
            className="mr-2 rounded px-1.5 py-0.5 text-xs font-bold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 12%, transparent)`,
              color: LEGACY_COLORS.blue,
            }}
          >
            {parent?.category}
          </span>
          <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
            {parent?.item_name ?? "-"}
          </span>
          <span className="ml-2 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            {parent?.erp_code}
          </span>
        </div>
        <span className="text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>
          하위 {bomRows.length}개
        </span>
      </div>
      <div className="px-4 pb-3 pt-3">
        <div className="text-sm font-bold uppercase tracking-[0.15em] mb-2" style={{ color: LEGACY_COLORS.muted2 }}>
          하위 품목 추가
        </div>
        <div className="flex items-center gap-2 mb-2">
          <input
            value={bomChildSearch}
            onChange={(e) => {
              setBomChildSearch(e.target.value);
              setPendingChildId(null);
            }}
            placeholder="품목명 / 품목 코드"
            className="flex-1 rounded-[12px] border px-3 py-1.5 text-sm outline-none"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
          <div className="flex gap-1 shrink-0">
            {BOM_CHILD_CATS.map((cat) => (
              <button
                key={cat}
                onClick={() => setBomChildCat(cat)}
                className="rounded-full px-2 py-1 text-xs font-bold"
                style={{
                  background: bomChildCat === cat ? LEGACY_COLORS.blue : LEGACY_COLORS.s1,
                  color: bomChildCat === cat ? "#fff" : LEGACY_COLORS.muted2,
                  border: `1px solid ${LEGACY_COLORS.border}`,
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div
          className="max-h-44 overflow-y-auto rounded-[16px] border"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          {bomChildItems.length === 0 ? (
            <div className="px-4 py-3 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>결과 없음</div>
          ) : (
            bomChildItems.map((item, index) => (
              <div
                key={item.item_id}
                style={{
                  borderBottom:
                    index === bomChildItems.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                }}
              >
                <button
                  disabled={item.alreadyIn}
                  onClick={() => {
                    if (!item.alreadyIn) setPendingChildId(pendingChildId === item.item_id ? null : item.item_id);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left"
                  style={{
                    background:
                      pendingChildId === item.item_id
                        ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)`
                        : "transparent",
                    opacity: item.alreadyIn ? 0.45 : 1,
                  }}
                >
                  <span
                    className="shrink-0 rounded px-1 py-0.5 text-xs font-bold"
                    style={{
                      background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)`,
                      color: LEGACY_COLORS.blue,
                    }}
                  >
                    {item.category}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm" style={{ color: LEGACY_COLORS.text }}>
                      {item.item_name}
                    </div>
                    <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{item.erp_code}</div>
                  </div>
                  {item.alreadyIn && (
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold"
                      style={{
                        background: `color-mix(in srgb, ${LEGACY_COLORS.green} 15%, transparent)`,
                        color: LEGACY_COLORS.green,
                      }}
                    >
                      이미 등록됨
                    </span>
                  )}
                </button>
                {pendingChildId === item.item_id && (
                  <div className="flex items-center gap-2 bg-blue-500/5 px-3 py-2">
                    <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>소요량</span>
                    <input
                      autoFocus
                      type="number"
                      min="0.001"
                      step="1"
                      value={pendingChildQty}
                      onChange={(e) => setPendingChildQty(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter")
                          onAddBomRow(item.item_id, parseFloat(pendingChildQty) || 1);
                      }}
                      className="w-20 rounded-[10px] border px-2 py-1 text-right text-sm outline-none"
                      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.blue, color: LEGACY_COLORS.text }}
                    />
                    <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>EA</span>
                    <button
                      onClick={() => onAddBomRow(item.item_id, parseFloat(pendingChildQty) || 1)}
                      className="ml-auto rounded-[10px] px-3 py-1 text-xs font-bold text-white"
                      style={{ background: LEGACY_COLORS.blue }}
                    >
                      추가
                    </button>
                    <button
                      onClick={() => setPendingChildId(null)}
                      className="rounded-[10px] px-2 py-1 text-xs"
                      style={{ color: LEGACY_COLORS.muted2 }}
                    >
                      취소
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
