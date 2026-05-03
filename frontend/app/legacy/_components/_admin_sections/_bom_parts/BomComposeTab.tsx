"use client";

import { Plus } from "lucide-react";
import type { BOMEntry } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState } from "../../common/EmptyState";
import { useAdminBomContext } from "../AdminBomContext";
import { BomParentPicker } from "./BomParentPicker";
import { BomChildPicker } from "./BomChildPicker";
import { BomStepIndicator } from "./BomStepIndicator";
import { BomComposeRow } from "./BomComposeRow";

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
                  color: childPickerOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.white,
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
                    return (
                      <BomComposeRow
                        key={row.bom_id}
                        row={row}
                        childItem={childItem}
                        isEditing={editingBomId === row.bom_id}
                        isLast={index === bomRows.length - 1}
                        editingQty={editingQty}
                        setEditingQty={setEditingQty}
                        onStartEdit={() => { setEditingBomId(row.bom_id); setEditingQty(String(row.quantity)); }}
                        onCancelEdit={() => setEditingBomId(null)}
                        onSaveEdit={() => onEditQty(row)}
                        onDelete={() => {
                          const childName = childItem?.item_name ?? row.child_item_id;
                          setDeleteRequest({ bomId: row.bom_id, childName });
                        }}
                      />
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
