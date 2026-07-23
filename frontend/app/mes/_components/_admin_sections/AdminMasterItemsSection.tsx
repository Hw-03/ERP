"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import type { BOMDetailEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { Button } from "@/lib/ui/Button";
import { EmptyState } from "../common";
import { StatusPill } from "../common/StatusPill";
import {
  AdminDetailCard,
  AdminKpiBar,
  AdminListPanel,
  AdminPageHeader,
} from "./_admin_primitives";
import { useAdminMasterItemsContext } from "./AdminMasterItemsContext";
import { AddItemForm } from "./_master_items_parts/AddItemForm";
import { EditItemForm } from "./_master_items_parts/EditItemForm";
import { useRegisterDirty, useLocalDirtyGuard } from "@/lib/ui/dirty-guard";

type DetailTab = "info" | "stock" | "bom";

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "info", label: "기본 정보" },
  { id: "stock", label: "재고 정보" },
  { id: "bom", label: "BOM / 사용처" },
];

interface Props {
  allBomRows: BOMDetailEntry[];
}

export function AdminMasterItemsSection({ allBomRows }: Props) {
  const {
    visibleItems,
    selectedItem,
    setSelectedItem,
    itemSearch,
    setItemSearch,
    addMode,
    setAddMode,
    saveItem,
    dirty,
    reorderItems,
    deleteItem,
    restoreItem,
  } = useAdminMasterItemsContext();

  const [tab, setTab] = useState<DetailTab>("info");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // 드래그 reorder — Pointer Events 기반 (HTML5 DnD 는 drag 중 wheel 이벤트 차단).
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const dropTargetIdRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const pointerStartYRef = useRef(0);

  function findItemIdAtPoint(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y);
    return el?.closest("[data-item-id]")?.getAttribute("data-item-id") ?? null;
  }

  function handleGripPointerDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    dragIdRef.current = id;
    pointerStartYRef.current = e.clientY;
    isDraggingRef.current = false;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function handleGripPointerMove(e: React.PointerEvent, id: string) {
    if (dragIdRef.current !== id) return;
    if (!isDraggingRef.current && Math.abs(e.clientY - pointerStartYRef.current) > 5) {
      isDraggingRef.current = true;
      setDragId(id);
    }
    if (!isDraggingRef.current) return;
    const target = findItemIdAtPoint(e.clientX, e.clientY);
    const next = target && target !== id ? target : null;
    if (next !== dropTargetIdRef.current) {
      dropTargetIdRef.current = next;
      setDropTargetId(next);
    }
  }

  function handleGripPointerUp(e: React.PointerEvent, id: string) {
    if (isDraggingRef.current && dragIdRef.current && dropTargetIdRef.current) {
      const fromIdx = visibleItems.findIndex((it) => it.item_id === dragIdRef.current);
      const toIdx = visibleItems.findIndex((it) => it.item_id === dropTargetIdRef.current);
      if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
        const next = [...visibleItems];
        const [moved] = next.splice(fromIdx, 1);
        if (moved) next.splice(toIdx, 0, moved);
        reorderItems(next);
      }
    }
    dragIdRef.current = null;
    dropTargetIdRef.current = null;
    isDraggingRef.current = false;
    setDragId(null);
    setDropTargetId(null);
  }

  // 활성 섹션 dirty/save 를 상위 registry 에 등록 (탭/사이드바 가드).
  useRegisterDirty("items", dirty, saveItem);
  // 항목 변경(트리거 a) 가드 — 같은 페이지에서 다른 품목 선택.
  const { confirmNavigation } = useLocalDirtyGuard(dirty, saveItem);

  // KPI: 전체 / 정상 / 부족 / 품절 — 대시보드와 동일 4분기
  const stats = useMemo(() => {
    let ok = 0;
    let low = 0;
    let zero = 0;
    for (const it of visibleItems) {
      const qty = Number(it.quantity);
      if (qty <= 0) zero += 1;
      else if (it.min_stock != null && qty < Number(it.min_stock)) low += 1;
      else ok += 1;
    }
    return { ok, low, zero };
  }, [visibleItems]);

  // 첫 진입 시 첫 visibleItem 자동 선택 (addMode가 아닐 때만)
  useEffect(() => {
    if (addMode) return;
    if (selectedItem) return;
    if (visibleItems.length === 0) return;
    setSelectedItem(visibleItems[0]);
  }, [addMode, selectedItem, visibleItems, setSelectedItem]);

  // 선택이 바뀌면 첫 탭으로 리셋 + 삭제 확인 닫기
  useEffect(() => {
    setTab("info");
    setDeleteConfirm(false);
  }, [selectedItem?.item_id]);

  function handleStartAdd() {
    confirmNavigation(() => {
      setAddMode(true);
      setSelectedItem(null);
    });
  }

  function handleSelectItem(item: Item, isSelected: boolean) {
    confirmNavigation(() => {
      setAddMode(false);
      setSelectedItem(isSelected ? null : item);
    });
  }

  function handleItemRowKeyDown(event: React.KeyboardEvent<HTMLDivElement>, item: Item, isSelected: boolean) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleSelectItem(item, isSelected);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AdminPageHeader
        icon={Box}
        title="품목 관리"
        summary={
          <AdminKpiBar
            placement="header"
            items={[
              { key: "all", label: "전체 품목", value: visibleItems.length, hint: "필터·검색 적용 결과", tone: LEGACY_COLORS.blue },
              { key: "ok", label: "정상", value: stats.ok, hint: "안전재고 충족", tone: LEGACY_COLORS.green },
              { key: "low", label: "부족", value: stats.low, hint: "안전재고 미만", tone: LEGACY_COLORS.yellow },
              { key: "zero", label: "품절", value: stats.zero, hint: "재고 0 이하", tone: LEGACY_COLORS.red },
            ]}
          />
        }
      />

      <div className="grid min-h-0 flex-1 gap-4" style={{ gridTemplateColumns: "minmax(420px, 0.92fr) minmax(460px, 1.08fr)", gridTemplateRows: "1fr" }}>
        <AdminListPanel
          title="품목 목록"
          countLabel={`${formatQty(visibleItems.length)}건`}
          width="100%"
          action={
            <Button variant="primary" size="sm" iconLeft={<Plus className="h-3.5 w-3.5" />} onClick={handleStartAdd}>
              추가
            </Button>
          }
          searchValue={itemSearch}
          searchPlaceholder="품목명, 코드 검색"
          onSearchChange={setItemSearch}
          listRole="grid"
          listAriaLabel="품목 목록"
          listClassName="flex min-h-0 flex-1 flex-col overflow-y-auto pr-0.5"
          listHeader={
            <div
              role="row"
              className="grid grid-cols-[minmax(0,1fr)_110px_80px] border-b px-3 py-2 text-[11px] font-bold tracking-[0.08em]"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
            >
              <span role="columnheader">품목명</span>
              <span role="columnheader" className="text-center">품목 코드</span>
              <span role="columnheader" className="text-center">상태</span>
            </div>
          }
          items={visibleItems}
          emptyState={
            <EmptyState
              variant={itemSearch ? "no-search-result" : "no-data"}
              compact
              title={itemSearch ? "검색 결과가 없습니다." : "등록된 품목이 없습니다."}
            />
          }
          renderItem={(item) => {
            const isSelected = selectedItem?.item_id === item.item_id;
            const isDeleted = !!item.deleted_at;
            const qty = Number(item.quantity);
            const zeroStock = qty <= 0;
            const lowStock =
              !zeroStock && item.min_stock != null && qty < Number(item.min_stock);
            const isDragging = dragId === item.item_id;
            const isDropTarget =
              dragId !== null && dropTargetId === item.item_id && dragId !== item.item_id;
            const rowStatus = isDeleted
              ? { label: "삭제됨", tone: "danger" as const, maxWidth: 90 }
              : zeroStock
                ? { label: "품절", tone: "danger" as const, maxWidth: 70 }
                : lowStock
                  ? { label: "부족", tone: "warning" as const, maxWidth: 70 }
                  : { label: "정상", tone: "success" as const, maxWidth: 70 };
            return (
              <div
                key={item.item_id}
                data-item-id={item.item_id}
                role="row"
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => handleSelectItem(item, isSelected)}
                onKeyDown={(event) => handleItemRowKeyDown(event, item, isSelected)}
                className="relative grid w-full grid-cols-[minmax(0,1fr)_110px_80px] items-center border-b border-l-[3px] py-2 pl-2 pr-3 text-left hover:bg-[var(--c-s4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--c-blue)]/30"
                style={{
                  opacity: isDragging ? 0.4 : isDeleted ? 0.5 : 1,
                  background: isSelected
                    ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
                    : undefined,
                  borderBottomColor: LEGACY_COLORS.border,
                  borderLeftColor: isSelected ? LEGACY_COLORS.blue : "transparent",
                }}
              >
                {isDropTarget && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 -top-1 h-0.5 rounded-full"
                    style={{ background: LEGACY_COLORS.blue }}
                  />
                )}
                <div role="gridcell" className="flex min-w-0 items-center gap-2">
                    <GripVertical
                      className="h-4 w-4 shrink-0 cursor-grab"
                      style={{ color: LEGACY_COLORS.muted2, touchAction: "none" }}
                      aria-label="드래그 핸들"
                      onPointerDown={(e) => handleGripPointerDown(e, item.item_id)}
                      onPointerMove={(e) => handleGripPointerMove(e, item.item_id)}
                      onPointerUp={(e) => handleGripPointerUp(e, item.item_id)}
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-[14px] font-semibold"
                      style={{
                        color: isDeleted ? LEGACY_COLORS.muted2 : LEGACY_COLORS.text,
                        textDecoration: isDeleted ? "line-through" : "none",
                      }}
                    >
                      {item.item_name}
                    </span>
                  </div>
                  <div
                    role="gridcell"
                    className="truncate text-center font-mono text-[12px] font-semibold tabular-nums"
                    style={{
                      color: LEGACY_COLORS.muted,
                    }}
                  >
                    {item.mes_code ?? "—"}
                  </div>
                  <div role="gridcell" className="flex justify-center">
                    <StatusPill {...rowStatus} showDot />
                  </div>
              </div>
            );
          }}
        />

        <AdminDetailCard
          title={
            addMode
              ? "새 품목 추가"
              : selectedItem
                ? undefined
                : "품목을 선택하세요"
          }
          subtitle={
            addMode
              ? "필요한 항목을 채우고 추가 버튼을 눌러주세요."
              : undefined
          }
          actions={
            !addMode &&
            selectedItem &&
            !selectedItem.deleted_at ? (
              deleteConfirm ? (
                <>
                  <span className="text-[12px] font-semibold" style={{ color: LEGACY_COLORS.text }}>
                    정말 삭제하시겠습니까?
                  </span>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(false)}
                    className="rounded-[8px] px-3 py-1.5 text-[12px] font-bold transition-colors hover:brightness-110"
                    style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted }}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteConfirm(false);
                      void deleteItem(selectedItem.item_id);
                    }}
                    className="rounded-[8px] px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:brightness-110"
                    style={{ background: LEGACY_COLORS.red }}
                  >
                    삭제 확인
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(true)}
                  className="flex items-center gap-1 rounded-[10px] px-3 py-1.5 text-[12px] font-bold transition-colors hover:brightness-110"
                  style={{
                    background: LEGACY_COLORS.s2,
                    color: LEGACY_COLORS.red,
                    border: `1px solid ${LEGACY_COLORS.red as string}`,
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  삭제
                </button>
              )
            ) : null
          }
          tabs={!addMode && selectedItem ? DETAIL_TABS : undefined}
          activeTab={tab}
          onTabChange={(id) => setTab(id as DetailTab)}
          footer={
            !addMode && selectedItem ? (
              selectedItem.deleted_at ? (
                <button
                  type="button"
                  onClick={() => void restoreItem(selectedItem.item_id)}
                  className="flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:brightness-110"
                  style={{ background: LEGACY_COLORS.green }}
                >
                  복구
                </button>
              ) : tab === "info" ? (
                <button
                  type="button"
                  onClick={() => void saveItem()}
                  className="flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:brightness-110"
                  style={{ background: LEGACY_COLORS.blue }}
                >
                  <Save className="h-3.5 w-3.5" />
                  저장
                </button>
              ) : null
            ) : null
          }
        >
          {addMode ? (
            <AddItemForm />
          ) : selectedItem ? (
            <ItemDetailTabs item={selectedItem} tab={tab} allBomRows={allBomRows} />
          ) : (
            <ItemEmptyHint onAdd={handleStartAdd} />
          )}
        </AdminDetailCard>
      </div>
    </div>
  );
}
function ItemDetailTabs({
  item,
  tab,
  allBomRows,
}: {
  item: Item;
  tab: DetailTab;
  allBomRows: BOMDetailEntry[];
}) {
  if (tab === "info") {
    return <EditItemForm key={item.item_id} selectedItem={item} />;
  }
  if (tab === "stock") {
    return <ItemStockTab item={item} />;
  }
  if (tab === "bom") {
    return <ItemBomTab item={item} allBomRows={allBomRows} />;
  }
  return null;
}

function ItemStockTab({ item }: { item: Item }) {
  const safety = Math.round(Number(item.min_stock ?? 0));
  const current = Number(item.quantity);
  const warehouse = Number(item.warehouse_qty ?? 0);
  const status =
    item.min_stock != null && current < item.min_stock
      ? { label: "안전재고 부족", tone: LEGACY_COLORS.red }
      : { label: "정상", tone: LEGACY_COLORS.green };
  return (
    <div className="grid h-full min-h-[9rem] grid-cols-2 grid-rows-2 gap-3">
      <StockStat label="현재 재고" value={current} unit={item.unit ?? "EA"} tone={LEGACY_COLORS.blue} />
      <StockStat label="창고 보관" value={warehouse} unit={item.unit ?? "EA"} tone={LEGACY_COLORS.cyan} />
      <StockStat label="안전 재고" value={safety} unit={item.unit ?? "EA"} tone={LEGACY_COLORS.yellow} />
      <StockStat label="재고 상태" value={status.label} unit="" tone={status.tone} />
    </div>
  );
}
function StockStat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number | string;
  unit: string;
  tone: string;
}) {
  return (
    <div
      className="h-full rounded-[14px] border px-4 py-4"
      style={{
        background: `color-mix(in srgb, ${tone} 8%, transparent)`,
        borderColor: `color-mix(in srgb, ${tone} 30%, transparent)`,
      }}
    >
      <div className="text-[12px] font-bold" style={{ color: tone }}>
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <div className="text-[26px] font-black leading-none" style={{ color: tone }}>
          {typeof value === "number" ? formatQty(value) : value}
        </div>
        {unit && (
          <div className="text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            {unit}
          </div>
        )}
      </div>
    </div>
  );
}
function ItemBomTab({
  item,
  allBomRows,
}: {
  item: Item;
  allBomRows: BOMDetailEntry[];
}) {
  const composition = useMemo(
    () => allBomRows.filter((row) => row.parent_item_id === item.item_id),
    [allBomRows, item.item_id],
  );
  const usedIn = useMemo(
    () => allBomRows.filter((row) => row.child_item_id === item.item_id),
    [allBomRows, item.item_id],
  );

  return (
    <div className="flex h-full min-h-[12rem] flex-col gap-5">
      <BomList
        title="구성품 (이 품목이 부모인 BOM)"
        rows={composition.map((r) => ({
          code: r.child_mes_code,
          name: r.child_item_name,
          qty: r.quantity,
          unit: r.unit,
        }))}
        emptyHint="이 품목을 부모로 하는 BOM이 없습니다."
      />
      <BomList
        title="사용처 (이 품목이 자식으로 들어간 부모)"
        rows={usedIn.map((r) => ({
          code: r.parent_mes_code,
          name: r.parent_item_name,
          qty: r.quantity,
          unit: r.unit,
        }))}
        emptyHint="이 품목을 사용하는 부모 BOM이 없습니다."
      />
    </div>
  );
}
function BomList({
  title,
  rows,
  emptyHint,
}: {
  title: string;
  rows: { code: string | null; name: string; qty: number; unit: string }[];
  emptyHint: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const PAGE = 8;
  const visible = expanded ? rows : rows.slice(0, PAGE);
  const remaining = rows.length - PAGE;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
        {title}
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto rounded-[12px] border"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        {rows.length === 0 ? (
          <div className="px-4 py-3 text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
            {emptyHint}
          </div>
        ) : (
          visible.map((row, idx) => (
            <div
              key={`${row.code}-${idx}`}
              className="flex items-center gap-2 px-4 py-2 text-[13px]"
              style={{
                borderTop: idx === 0 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              <span
                className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-black"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 14%, transparent)`,
                  color: LEGACY_COLORS.muted,
                }}
              >
                {row.code ?? "—"}
              </span>
              <span className="min-w-0 flex-1 truncate" style={{ color: LEGACY_COLORS.text }}>
                {row.name}
              </span>
              <span className="text-[12px] font-bold tabular-nums" style={{ color: LEGACY_COLORS.text }}>
                {formatQty(row.qty)} {row.unit}
              </span>
            </div>
          ))
        )}
        {rows.length > PAGE && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full px-4 py-2 text-left text-[12px] font-bold transition-colors hover:brightness-105"
            style={{
              borderTop: `1px solid ${LEGACY_COLORS.border}`,
              color: LEGACY_COLORS.blue,
              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 5%, transparent)`,
            }}
          >
            {expanded ? "접기" : `더보기 (${remaining}건 더)`}
          </button>
        )}
      </div>
    </div>
  );
}

function ItemEmptyHint({ onAdd }: { onAdd: () => void }) {
  return (
    <EmptyState
      variant="no-data"
      title="품목을 선택하거나 추가하세요"
      description="좌측 목록에서 품목을 클릭하면 정보를 확인·수정할 수 있습니다."
      action={{ label: "+ 품목 추가", onClick: onAdd }}
    />
  );
}
