"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import type { BOMEntry } from "@/lib/api";
import { LEGACY_COLORS, formatNumber } from "../legacyUi";
import { EmptyState } from "../common/EmptyState";
import { ConfirmModal } from "../common/ConfirmModal";
import { useAdminBomContext } from "./AdminBomContext";
import { BomParentPicker } from "./_bom_parts/BomParentPicker";
import { BomChildPicker } from "./_bom_parts/BomChildPicker";
import { BomWhereUsedPanel } from "./_bom_parts/BomWhereUsedPanel";
import { BomStepIndicator } from "./_bom_parts/BomStepIndicator";
import { bomCategoryColor } from "./adminShared";

type BomTab = "compose" | "all" | "whereused";

const TABS: { id: BomTab; label: string }[] = [
  { id: "compose", label: "BOM 작성" },
  { id: "all", label: "전체 BOM" },
  { id: "whereused", label: "사용처 조회" },
];

export function AdminBomSection() {
  const {
    items,
    parentId,
    setParentId,
    bomRows,
    allBomRows,
    bomStats,
    childPickerOpen,
    setChildPickerOpen,
    pendingChildId,
    editingBomId,
    setEditingBomId,
    editingQty,
    setEditingQty,
    saveBomQty: doSaveBomQty,
    deleteBomRow: doDeleteBomRow,
    addBomRow: doAddBomRow,
    addRequest,
    setAddRequest,
    deleteRequest,
    setDeleteRequest,
    whereUsedRows,
  } = useAdminBomContext();

  const [bomTab, setBomTab] = useState<BomTab>("compose");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [allBomLimit, setAllBomLimit] = useState(30);
  const [editConfirm, setEditConfirm] = useState<BOMEntry | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);

  const parent = items.find((i) => i.item_id === parentId);

  const groupedAllBom = useMemo(() => {
    const map = new Map<string, {
      parentId: string;
      parentName: string;
      parentCode: string;
      parentCat: string;
      rows: typeof allBomRows;
    }>();
    for (const row of allBomRows) {
      if (!map.has(row.parent_item_id)) {
        map.set(row.parent_item_id, {
          parentId: row.parent_item_id,
          parentName: row.parent_item_name,
          parentCode: row.parent_erp_code ?? "",
          parentCat: row.parent_erp_code?.split("-")[1] ?? "?",
          rows: [],
        });
      }
      map.get(row.parent_item_id)!.rows.push(row);
    }
    return Array.from(map.values());
  }, [allBomRows]);

  const displayedGroups = groupedAllBom.slice(0, allBomLimit);

  async function handleAddConfirm() {
    if (!addRequest) return;
    setAddBusy(true);
    try {
      await doAddBomRow(addRequest.childId, addRequest.qty);
    } finally {
      setAddBusy(false);
      setAddRequest(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteRequest) return;
    setDeleteBusy(true);
    try {
      await doDeleteBomRow(deleteRequest.bomId);
    } finally {
      setDeleteBusy(false);
      setDeleteRequest(null);
    }
  }

  async function handleEditConfirm() {
    if (!editConfirm) return;
    setEditBusy(true);
    try {
      await doSaveBomQty(editConfirm);
    } finally {
      setEditBusy(false);
      setEditConfirm(null);
    }
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* 통계 카드 3개 */}
      <div className="shrink-0 grid grid-cols-3 gap-3">
        {[
          { label: "BOM 관계", value: bomStats.totalRelations, color: LEGACY_COLORS.yellow },
          { label: "상위 품목", value: bomStats.parentCount, color: LEGACY_COLORS.blue },
          { label: "하위 품목 종류", value: bomStats.childCount, color: LEGACY_COLORS.green },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-[20px] border px-4 py-3"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <div className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
              {label}
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color }}>
              {formatNumber(value)}
            </div>
          </div>
        ))}
      </div>

      {/* 탭 바 */}
      <div
        className="shrink-0 flex gap-1 rounded-[16px] border p-1"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setBomTab(id)}
            className="flex-1 rounded-[12px] px-4 py-2 text-sm font-bold transition-colors"
            style={{
              background: bomTab === id ? LEGACY_COLORS.s1 : "transparent",
              color: bomTab === id ? LEGACY_COLORS.text : LEGACY_COLORS.muted2,
              boxShadow: bomTab === id ? "0 1px 4px rgba(0,0,0,.08)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── BOM 작성 탭 ─────────────────────────────────────────────── */}
      {bomTab === "compose" && (
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
                                    onClick={() => setEditConfirm(row)}
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
                                    ×{formatNumber(row.quantity)}
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
      )}

      {/* ── 전체 BOM 탭 ─────────────────────────────────────────────── */}
      {bomTab === "all" && (
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div
            className="flex shrink-0 items-center justify-between border-b px-5 py-3"
            style={{ borderColor: LEGACY_COLORS.border }}
          >
            <span className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
              전체 BOM 현황
            </span>
            <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {groupedAllBom.length}개 제품 · {allBomRows.length}개 관계 · 조회 전용
            </span>
          </div>
          {groupedAllBom.length === 0 ? (
            <EmptyState
              variant="no-data"
              compact
              title="등록된 BOM이 없습니다."
              description="BOM 작성 탭에서 상위 품목을 선택해 BOM을 등록할 수 있습니다."
            />
          ) : (
            <div className="min-h-0 overflow-y-auto">
              {displayedGroups.map((group, gIdx) => {
                const isExpanded = expandedGroups.has(group.parentId);
                const catColor = bomCategoryColor(group.parentCat);
                const isLast = gIdx === displayedGroups.length - 1 && groupedAllBom.length <= allBomLimit;
                return (
                  <div
                    key={group.parentId}
                    style={{ borderBottom: isLast ? "none" : `1px solid ${LEGACY_COLORS.border}` }}
                  >
                    <div className="flex items-center">
                      <button
                        onClick={() =>
                          setExpandedGroups((prev) => {
                            const next = new Set(prev);
                            if (next.has(group.parentId)) next.delete(group.parentId);
                            else next.add(group.parentId);
                            return next;
                          })
                        }
                        className="flex flex-1 items-center gap-2 px-5 py-3 text-left"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
                        )}
                        <span
                          className="shrink-0 rounded px-1 py-0.5 text-xs font-bold"
                          style={{
                            background: `color-mix(in srgb, ${catColor} 12%, transparent)`,
                            color: catColor,
                          }}
                        >
                          {group.parentCat}
                        </span>
                        <span className="truncate text-sm font-medium" style={{ color: LEGACY_COLORS.text }}>
                          {group.parentName}
                        </span>
                        <span className="ml-auto shrink-0 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                          {group.rows.length}개 자재
                        </span>
                      </button>
                      <button
                        onClick={() => { setParentId(group.parentId); setBomTab("compose"); }}
                        className="shrink-0 px-4 py-2 text-xs font-medium"
                        style={{ color: LEGACY_COLORS.blue }}
                      >
                        편집
                      </button>
                    </div>
                    {isExpanded && (
                      <div style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 3%, transparent)` }}>
                        {group.rows.map((row) => {
                          const childCat = row.child_erp_code?.split("-")[1] ?? "?";
                          return (
                            <div
                              key={row.bom_id}
                              className="grid grid-cols-[60px_1fr_1fr_80px] items-center border-t px-8 py-2"
                              style={{ borderColor: LEGACY_COLORS.border }}
                            >
                              <span
                                className="rounded px-1 py-0.5 text-xs font-bold w-fit"
                                style={{
                                  background: `color-mix(in srgb, ${LEGACY_COLORS.green} 12%, transparent)`,
                                  color: LEGACY_COLORS.green,
                                }}
                              >
                                {childCat}
                              </span>
                              <div className="truncate text-sm" style={{ color: LEGACY_COLORS.text }}>
                                {row.child_item_name}
                              </div>
                              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                                {row.child_erp_code}
                              </div>
                              <div className="text-right text-sm" style={{ color: LEGACY_COLORS.text }}>
                                ×{formatNumber(row.quantity)}
                                <span className="ml-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{row.unit}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {groupedAllBom.length > allBomLimit && (
                <button
                  onClick={() => setAllBomLimit((l) => l + 30)}
                  className="w-full py-3 text-sm font-medium"
                  style={{ color: LEGACY_COLORS.blue, borderTop: `1px solid ${LEGACY_COLORS.border}` }}
                >
                  더보기 ({groupedAllBom.length - allBomLimit}개 제품 더)
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 사용처 조회 탭 ──────────────────────────────────────────── */}
      {bomTab === "whereused" && (
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="w-[280px] shrink-0 min-h-0">
            <BomParentPicker />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {!parentId ? (
              <div
                className="flex flex-1 items-center justify-center rounded-[28px] border"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              >
                <div className="text-sm font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                  좌측에서 품목을 선택하면 사용처를 확인할 수 있습니다
                </div>
              </div>
            ) : whereUsedRows.length === 0 ? (
              <div
                className="flex flex-1 flex-col overflow-hidden rounded-[28px] border"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              >
                <div className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                  <div className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                    이 품목이 사용되는 곳 (Where-Used)
                  </div>
                </div>
                <EmptyState
                  variant="no-data"
                  compact
                  title="사용처가 없습니다."
                  description="이 품목은 다른 BOM에서 하위 품목으로 등록되어 있지 않습니다."
                />
              </div>
            ) : (
              <BomWhereUsedPanel />
            )}
          </div>
        </div>
      )}

      {/* ConfirmModal: BOM 추가 */}
      <ConfirmModal
        open={addRequest !== null}
        title="BOM 항목 추가"
        confirmLabel="BOM에 추가"
        busy={addBusy}
        onClose={() => { if (!addBusy) setAddRequest(null); }}
        onConfirm={handleAddConfirm}
      >
        <div className="text-sm" style={{ color: LEGACY_COLORS.text }}>
          <p>BOM 항목을 추가하시겠습니까?</p>
          {addRequest && (
            <div
              className="mt-3 rounded-[10px] border px-3 py-2.5 text-xs"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div style={{ color: LEGACY_COLORS.muted2 }}>하위 품목</div>
              <div className="font-semibold mt-0.5" style={{ color: LEGACY_COLORS.text }}>{addRequest.childName}</div>
              <div className="mt-1.5" style={{ color: LEGACY_COLORS.muted2 }}>
                소요량 <span className="font-semibold" style={{ color: LEGACY_COLORS.text }}>{addRequest.qty} EA</span>
              </div>
            </div>
          )}
        </div>
      </ConfirmModal>

      {/* ConfirmModal: BOM 삭제 */}
      <ConfirmModal
        open={deleteRequest !== null}
        title="BOM 항목 삭제"
        tone="danger"
        confirmLabel="삭제"
        busy={deleteBusy}
        onClose={() => { if (!deleteBusy) setDeleteRequest(null); }}
        onConfirm={handleDeleteConfirm}
      >
        <div className="text-sm" style={{ color: LEGACY_COLORS.text }}>
          <p>이 BOM 항목을 삭제하시겠습니까?</p>
          {deleteRequest && (
            <div className="mt-2 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {deleteRequest.childName}
            </div>
          )}
        </div>
      </ConfirmModal>

      {/* ConfirmModal: 소요량 변경 */}
      <ConfirmModal
        open={editConfirm !== null}
        title="소요량 변경"
        confirmLabel="변경 저장"
        busy={editBusy}
        onClose={() => { if (!editBusy) { setEditConfirm(null); setEditingBomId(null); } }}
        onConfirm={handleEditConfirm}
      >
        <div className="text-sm" style={{ color: LEGACY_COLORS.text }}>
          <p>소요량을 변경하시겠습니까?</p>
          {editConfirm && (
            <div className="mt-2 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              새 소요량:{" "}
              <span className="font-semibold" style={{ color: LEGACY_COLORS.text }}>
                {editingQty} {editConfirm.unit}
              </span>
            </div>
          )}
        </div>
      </ConfirmModal>
    </div>
  );
}
