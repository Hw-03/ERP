"use client";

import { X } from "lucide-react";
import { LEGACY_COLORS, formatNumber } from "../legacyUi";
import { EmptyState } from "../common/EmptyState";
import { BOM_CHILD_CATS, BOM_PARENT_CATS } from "./adminShared";
import { useAdminBomContext } from "./AdminBomContext";

// Props 없음. 모든 상태/액션은 AdminBomProvider 가 제공하는 Context 에서 읽는다.
// 기존 22-prop drilling → 0. DesktopAdminView 의 useState 11개도 hook 으로 흡수.
export function AdminBomSection() {
  const ctx = useAdminBomContext();
  const {
    items,
    parentId,
    setParentId,
    bomRows,
    allBomRows,
    bomParentItems,
    bomChildItems,
    bomParentSearch,
    setBomParentSearch,
    bomParentCat,
    setBomParentCat,
    bomChildSearch,
    setBomChildSearch,
    bomChildCat,
    setBomChildCat,
    pendingChildId,
    setPendingChildId,
    pendingChildQty,
    setPendingChildQty,
    editingBomId,
    setEditingBomId,
    editingQty,
    setEditingQty,
    whereUsedRows,
    addBomRow: onAddBomRow,
    saveBomQty: onSaveBomQty,
    deleteBomRow: onDeleteBomRow,
  } = ctx;
  return (
    <div className="flex flex-col h-full gap-3">
      {/* 단계 흐름 인디케이터 */}
      <div className="shrink-0 flex items-center gap-2 text-xs font-bold">
        {[
          { step: "①", label: "부모품목 선택", active: !parentId, done: !!parentId },
          { step: "②", label: "자식품목 선택", active: !!parentId && !pendingChildId, done: !!pendingChildId },
          { step: "③", label: "소요량 입력", active: !!pendingChildId, done: false },
          { step: "④", label: "저장", active: false, done: false },
        ].map(({ step, label, active, done }) => (
          <span
            key={step}
            className="flex items-center gap-1 rounded-full px-2.5 py-1"
            style={{
              background: done
                ? `color-mix(in srgb, ${LEGACY_COLORS.green} 14%, transparent)`
                : active
                ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 16%, transparent)`
                : LEGACY_COLORS.s2,
              color: done ? LEGACY_COLORS.green : active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
              border: `1px solid ${done ? LEGACY_COLORS.green : active ? LEGACY_COLORS.blue : LEGACY_COLORS.border}`,
            }}
          >
            {done ? "✓" : step} {label}
          </span>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: "300px minmax(0,1fr)" }}>
        {/* 좌측: 상위 품목 선택 */}
        <div
          className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
            <div className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
              상위 품목 선택
            </div>
            <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              RM 제외 · {bomParentItems.length}건 표시
            </div>
          </div>
          <div className="shrink-0 px-3 pt-3">
            <input
              value={bomParentSearch}
              onChange={(e) => setBomParentSearch(e.target.value)}
              placeholder="품목명 / ERP 코드 검색"
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
            {bomParentItems.map((item, index) => (
              <button
                key={item.item_id}
                onClick={() => {
                  setParentId(item.item_id);
                  setPendingChildId(null);
                  setBomChildSearch("");
                  setBomChildCat("ALL");
                }}
                className="block w-full px-3 py-2.5 text-left transition-colors"
                style={{
                  background:
                    parentId === item.item_id
                      ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
                      : "transparent",
                  borderBottom: index === bomParentItems.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
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
                    {item.category}
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
            {bomParentItems.length === 0 && (
              <div className="px-4 py-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>결과 없음</div>
            )}
          </div>
        </div>

        {/* 우측: BOM 상세 */}
        <div className="flex min-h-0 flex-col gap-3">
          {/* 하위 품목 추가 카드 */}
          <div
            className="shrink-0 overflow-hidden rounded-[28px] border"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            {!parentId ? (
              <div className="px-5 py-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                ← 좌측에서 상위 품목을 선택하세요
              </div>
            ) : (
              <>
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
                      {items.find((i) => i.item_id === parentId)?.category}
                    </span>
                    <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
                      {items.find((i) => i.item_id === parentId)?.item_name ?? "-"}
                    </span>
                    <span className="ml-2 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                      {items.find((i) => i.item_id === parentId)?.erp_code}
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
                      placeholder="품목명 / ERP 코드"
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
              </>
            )}
          </div>

          {/* BOM 목록 테이블 */}
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            {parentId ? (
              <>
                <div
                  className="shrink-0 border-b px-5 py-3 text-sm font-bold uppercase tracking-[0.18em]"
                  style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                >
                  구성 자재 목록
                </div>
                {bomRows.length === 0 ? (
                  <EmptyState
                    variant="no-data"
                    compact
                    title="등록된 BOM 항목이 없습니다."
                    description="자재를 추가하면 이곳에 표시됩니다."
                  />
                ) : (
                  <div className="min-h-0 overflow-y-auto">
                    <div
                      className="grid items-center border-b px-5 py-2 text-sm font-bold uppercase tracking-[0.15em]"
                      style={{
                        gridTemplateColumns: "36px 1fr 120px 100px 80px 80px 40px",
                        borderColor: LEGACY_COLORS.border,
                        color: LEGACY_COLORS.muted2,
                      }}
                    >
                      <span>구분</span>
                      <span>자재명</span>
                      <span className="text-right">ERP 코드</span>
                      <span className="text-right">소요량</span>
                      <span className="text-right">재고</span>
                      <span className="text-right">가능수량</span>
                      <span />
                    </div>
                    {bomRows.map((row, index) => {
                      const childItem = items.find((item) => item.item_id === row.child_item_id);
                      const stock = Number(childItem?.quantity ?? 0);
                      const capacity = row.quantity > 0 ? Math.floor(stock / Number(row.quantity)) : 0;
                      return (
                        <div
                          key={row.bom_id}
                          className="grid items-center px-5 py-3"
                          style={{
                            gridTemplateColumns: "36px 1fr 120px 100px 80px 80px 40px",
                            borderBottom: index === bomRows.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                          }}
                        >
                          <span
                            className="rounded px-1 py-0.5 text-xs font-bold w-fit"
                            style={{
                              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)`,
                              color: LEGACY_COLORS.blue,
                            }}
                          >
                            {childItem?.category}
                          </span>
                          <div>
                            <div className="truncate text-sm font-medium" style={{ color: LEGACY_COLORS.text }}>
                              {childItem?.item_name || row.child_item_id}
                            </div>
                          </div>
                          <div className="text-right text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                            {childItem?.erp_code ?? "-"}
                          </div>
                          <div className="flex items-center justify-end gap-1">
                            {editingBomId === row.bom_id ? (
                              <input
                                autoFocus
                                type="number"
                                value={editingQty}
                                onChange={(e) => setEditingQty(e.target.value)}
                                onBlur={() => onSaveBomQty(row)}
                                onKeyDown={(e) => e.key === "Enter" && onSaveBomQty(row)}
                                className="w-14 rounded border bg-transparent px-1 text-right text-sm outline-none"
                                style={{ borderColor: LEGACY_COLORS.blue, color: LEGACY_COLORS.text }}
                              />
                            ) : (
                              <span
                                title="클릭하여 수량 편집"
                                onClick={() => {
                                  setEditingBomId(row.bom_id);
                                  setEditingQty(String(row.quantity));
                                }}
                                className="cursor-pointer text-sm hover:underline"
                                style={{ color: LEGACY_COLORS.text }}
                              >
                                ×{formatNumber(row.quantity)}
                              </span>
                            )}
                            <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{row.unit}</span>
                          </div>
                          <div
                            className="text-right text-sm"
                            style={{ color: stock > 0 ? LEGACY_COLORS.text : LEGACY_COLORS.red }}
                          >
                            {formatNumber(stock)}
                          </div>
                          <div
                            className="text-right text-sm font-bold"
                            style={{ color: capacity > 0 ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2 }}
                          >
                            {formatNumber(capacity)}
                          </div>
                          <div className="flex justify-end">
                            <button
                              onClick={() => onDeleteBomRow(row.bom_id)}
                              className="flex items-center justify-center rounded-full p-1 hover:bg-red-500/10"
                              style={{ color: LEGACY_COLORS.red }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                <div
                  className="flex shrink-0 items-center justify-between border-b px-5 py-3"
                  style={{ borderColor: LEGACY_COLORS.border }}
                >
                  <span className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                    전체 BOM 현황
                  </span>
                  <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{allBomRows.length}개 관계</span>
                </div>
                {allBomRows.length === 0 ? (
                  <EmptyState
                    variant="no-data"
                    compact
                    title="등록된 BOM이 없습니다."
                    description="제품을 선택해 BOM을 등록할 수 있습니다."
                  />
                ) : (
                  <div className="min-h-0 overflow-y-auto">
                    <div
                      className="grid grid-cols-[80px_1fr_1fr_80px] border-b px-5 py-2 text-sm font-bold uppercase tracking-[0.15em]"
                      style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                    >
                      <span>구분</span>
                      <span>상위 품목</span>
                      <span>하위 품목</span>
                      <span className="text-right">수량</span>
                    </div>
                    {allBomRows.map((row, index) => (
                      <div
                        key={row.bom_id}
                        className="grid grid-cols-[80px_1fr_1fr_80px] items-center px-5 py-2.5"
                        style={{
                          borderBottom: index === allBomRows.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                        }}
                      >
                        <div className="flex gap-1">
                          <span
                            className="rounded px-1 py-0.5 text-xs font-bold"
                            style={{
                              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)`,
                              color: LEGACY_COLORS.blue,
                            }}
                          >
                            {row.parent_erp_code?.split("-")[1] ?? "?"}
                          </span>
                        </div>
                        <div>
                          <div className="truncate text-sm">{row.parent_item_name}</div>
                          <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{row.parent_erp_code}</div>
                        </div>
                        <div>
                          <div className="truncate text-sm">{row.child_item_name}</div>
                          <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{row.child_erp_code}</div>
                        </div>
                        <div className="text-right text-sm" style={{ color: LEGACY_COLORS.text }}>
                          ×{formatNumber(row.quantity)}
                          <span className="ml-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{row.unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Phase 5: Where-Used — 이 parent 가 다른 BOM 의 child 로 등록된 위치 */}
          {parentId && whereUsedRows.length > 0 && (
            <div
              className="shrink-0 overflow-hidden rounded-[28px] border"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                <div className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                  이 품목이 사용되는 곳 (Where-Used)
                </div>
                <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  {whereUsedRows.length}건 — 다른 BOM 에서 child 로 등록된 위치
                </div>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {whereUsedRows.map((row) => (
                  <div
                    key={row.bom_id}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                    style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium" style={{ color: LEGACY_COLORS.text }}>
                        {row.parent_item_name}
                      </div>
                      <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                        {row.parent_erp_code}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm" style={{ color: LEGACY_COLORS.text }}>
                      ×{formatNumber(row.quantity)}
                      <span className="ml-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                        {row.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
