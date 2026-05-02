"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import type { BOMEntry } from "@/lib/api";
import { LEGACY_COLORS } from "../../legacyUi";
import { formatQty } from "@/lib/mes/format";
import { EmptyState } from "../../common/EmptyState";
import { useAdminBomContext } from "../AdminBomContext";
import { BomParentPicker } from "./BomParentPicker";
import { BomChildPicker } from "./BomChildPicker";
import { BomStepIndicator } from "./BomStepIndicator";
import { bomCategoryColor } from "../adminShared";

/**
 * AdminBomSection 의 "BOM 작성" 탭.
 *
 * Round-10B (#7) 추출. 좌측 BomParentPicker + 가운데 작업영역(단계 표시 + 상위
 * 품목 카드 + 현재 구성 목록 grid) + 우측 슬라이드 BomChildPicker 를 포함한다.
 *
 * editConfirm 모달은 부모(AdminBomSection)에 잔존 — 본 컴포넌트는 onEditQty
 * 콜백으로 row 를 전달한다.
 */
interface Props {
  onEditQty: (row: BOMEntry) => void;
}

export function BomComposeTab({ onEditQty }: Props) {
  const {
    items,
    parentId,
    bomRows,
    childPickerOpen,
    setChildPickerOpen,
    pendingChildId,
    editingBomId,
    setEditingBomId,
    editingQty,
    setEditingQty,
    setDeleteRequest,
  } = useAdminBomContext();

  const parent = items.find((i) => i.item_id === parentId);

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      {/* 좌측: 상위 품목 선택 */}
      <div className="w-[280px] shrink-0 min-h-0">
        <BomParentPicker />
      </div>

      {/* 가운데: 작업 영역 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {!parentId ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-4 rounded-[28px] border"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <div className="text-sm font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
              좌측에서 상위 품목을 선택하면 BOM 작성을 시작합니다
            </div>
            <BomStepIndicator parentSelected={false} childSelected={false} />
          </div>
        ) : (
          <>
            {/* 단계 표시 */}
            <div className="shrink-0">
              <BomStepIndicator parentSelected={true} childSelected={!!pendingChildId} />
            </div>

            {/* 상위 품목 요약 카드 + 하위 품목 추가 버튼 */}
            <div
              className="shrink-0 flex items-center justify-between gap-3 rounded-[20px] border px-4 py-3"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div className="min-w-0">
                <div
                  className="text-xs font-bold uppercase tracking-[0.15em] mb-0.5"
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  상위 품목
                </div>
                <div className="truncate text-sm font-semibold" style={{ color: LEGACY_COLORS.text }}>
                  {parent?.item_name}
                </div>
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  {parent?.erp_code}
                </div>
              </div>
              <button
                onClick={() => setChildPickerOpen(!childPickerOpen)}
                className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
                style={{
                  background: childPickerOpen
                    ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 15%, transparent)`
                    : LEGACY_COLORS.blue,
                  color: childPickerOpen ? LEGACY_COLORS.blue : "#fff",
                  border: `1px solid ${childPickerOpen ? LEGACY_COLORS.blue : "transparent"}`,
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                하위 품목 추가
              </button>
            </div>

            {/* 현재 구성 목록 */}
            <div
              className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div
                className="shrink-0 border-b px-5 py-3 text-sm font-bold uppercase tracking-[0.18em]"
                style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
              >
                현재 구성 목록
              </div>
              {bomRows.length === 0 ? (
                <EmptyState
                  variant="no-data"
                  compact
                  title="등록된 BOM 항목이 없습니다."
                  description="하위 품목 추가로 시작하세요."
                />
              ) : (
                <div className="min-h-0 overflow-y-auto">
                  <div
                    className="grid items-center border-b px-5 py-2 text-xs font-bold uppercase tracking-[0.15em]"
                    style={{
                      gridTemplateColumns: "36px 1fr 120px 160px 80px 80px 40px",
                      borderColor: LEGACY_COLORS.border,
                      color: LEGACY_COLORS.muted2,
                    }}
                  >
                    <span>구분</span>
                    <span>자재명</span>
                    <span className="text-right">품목 코드</span>
                    <span className="text-right">소요량</span>
                    <span className="text-right">재고</span>
                    <span className="text-right">가능수량</span>
                    <span />
                  </div>
                  {bomRows.map((row, index) => {
                    const childItem = items.find((item) => item.item_id === row.child_item_id);
                    const stock = Number(childItem?.quantity ?? 0);
                    const capacity = row.quantity > 0 ? Math.floor(stock / Number(row.quantity)) : 0;
                    const catColor = bomCategoryColor(childItem?.process_type_code);
                    const isEditing = editingBomId === row.bom_id;
                    return (
                      <div
                        key={row.bom_id}
                        className="grid items-center px-5 py-3"
                        style={{
                          gridTemplateColumns: "36px 1fr 120px 160px 80px 80px 40px",
                          borderBottom: index === bomRows.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                        }}
                      >
                        <span
                          className="rounded px-1 py-0.5 text-xs font-bold w-fit"
                          style={{
                            background: `color-mix(in srgb, ${catColor} 12%, transparent)`,
                            color: catColor,
                          }}
                        >
                          {childItem?.process_type_code ?? "-"}
                        </span>
                        <div>
                          <div className="truncate text-sm font-medium" style={{ color: LEGACY_COLORS.text }}>
                            {childItem?.item_name || row.child_item_id}
                          </div>
                        </div>
                        <div className="text-right text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                          {childItem?.erp_code ?? "-"}
                        </div>
                        {/* 소요량 — 수정 버튼 방식 (blur 자동저장 없음) */}
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <input
                                autoFocus
                                type="number"
                                value={editingQty}
                                onChange={(e) => setEditingQty(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Escape") setEditingBomId(null); }}
                                className="w-14 rounded border bg-transparent px-1 text-right text-sm outline-none"
                                style={{ borderColor: LEGACY_COLORS.blue, color: LEGACY_COLORS.text }}
                              />
                              <button
                                onClick={() => onEditQty(row)}
                                className="rounded-[8px] px-2 py-0.5 text-xs font-bold text-white"
                                style={{ background: LEGACY_COLORS.blue }}
                              >
                                변경 저장
                              </button>
                              <button
                                onClick={() => setEditingBomId(null)}
                                className="rounded-[8px] px-1.5 py-0.5 text-xs"
                                style={{ color: LEGACY_COLORS.muted2 }}
                              >
                                취소
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="text-sm" style={{ color: LEGACY_COLORS.text }}>
                                ×{formatQty(row.quantity)}
                              </span>
                              <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{row.unit}</span>
                              <button
                                title="소요량 수정"
                                onClick={() => { setEditingBomId(row.bom_id); setEditingQty(String(row.quantity)); }}
                                className="ml-1 flex items-center justify-center rounded-full p-1 hover:bg-[var(--c-s3)]"
                                style={{ color: LEGACY_COLORS.muted2 }}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </div>
                        <div
                          className="text-right text-sm"
                          style={{ color: stock > 0 ? LEGACY_COLORS.text : LEGACY_COLORS.red }}
                        >
                          {formatQty(stock)}
                        </div>
                        <div
                          className="text-right text-sm font-bold"
                          style={{ color: capacity > 0 ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2 }}
                        >
                          {formatQty(capacity)}
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={() => {
                              const childName = childItem?.item_name ?? row.child_item_id;
                              setDeleteRequest({ bomId: row.bom_id, childName });
                            }}
                            className="flex items-center justify-center rounded-full p-1 hover:bg-red-500/10"
                            style={{ color: LEGACY_COLORS.red }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 우측: 하위 품목 추가 슬라이드 패널 */}
      <div
        className="shrink-0 overflow-hidden min-h-0"
        style={{
          width: childPickerOpen && parentId ? 430 : 0,
          transition: "width 160ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div
          className="h-full"
          style={{
            width: 430,
            opacity: childPickerOpen && parentId ? 1 : 0,
            transform: childPickerOpen && parentId ? "translateX(0)" : "translateX(18px)",
            transition: "opacity 260ms ease, transform 260ms ease",
            willChange: "transform, opacity",
          }}
        >
          <BomChildPicker onClose={() => setChildPickerOpen(false)} />
        </div>
      </div>
    </div>
  );
}
