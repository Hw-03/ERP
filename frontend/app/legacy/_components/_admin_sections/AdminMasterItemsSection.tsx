"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Plus } from "lucide-react";
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

type DetailTab = "info" | "stock" | "bom" | "history";

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "info", label: "기본 정보" },
  { id: "stock", label: "재고 정보" },
  { id: "bom", label: "BOM / 사용처" },
  { id: "history", label: "변경 이력 (준비 중)" },
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
  } = useAdminMasterItemsContext();

  const [tab, setTab] = useState<DetailTab>("info");

  // KPI: 정상 / 부족 (사용자 결정에 따라 비활성 제거, 3개)
  const stats = useMemo(() => {
    let ok = 0;
    let low = 0;
    for (const it of visibleItems) {
      if (it.min_stock != null && Number(it.quantity) < Number(it.min_stock)) low += 1;
      else ok += 1;
    }
    return { ok, low };
  }, [visibleItems]);

  // 첫 진입 시 첫 visibleItem 자동 선택 (addMode가 아닐 때만)
  useEffect(() => {
    if (addMode) return;
    if (selectedItem) return;
    if (visibleItems.length === 0) return;
    setSelectedItem(visibleItems[0]);
  }, [addMode, selectedItem, visibleItems, setSelectedItem]);

  // 선택이 바뀌면 첫 탭으로 리셋
  useEffect(() => {
    setTab("info");
  }, [selectedItem?.item_id]);

  function handleStartAdd() {
    setAddMode(true);
    setSelectedItem(null);
  }

  return (
    <div className="flex min-h-0 flex-col">
      <AdminPageHeader
        icon={Box}
        title="품목 관리"
        description="모든 품목의 정보를 조회하고 관리할 수 있습니다."
        actions={
          <Button variant="primary" size="md" iconLeft={<Plus className="h-4 w-4" />} onClick={handleStartAdd}>
            품목 추가
          </Button>
        }
      />

      <AdminKpiBar
        items={[
          { key: "all", label: "전체 품목", value: visibleItems.length, hint: "필터·검색 적용 결과", tone: LEGACY_COLORS.blue },
          { key: "ok", label: "정상", value: stats.ok, hint: "안전재고 충족", tone: LEGACY_COLORS.green },
          { key: "low", label: "부족", value: stats.low, hint: "안전재고 미만", tone: LEGACY_COLORS.red },
        ]}
      />

      <div className="flex min-h-0 flex-1 gap-4">
        <AdminListPanel
          title="품목 목록"
          countLabel={`${formatQty(visibleItems.length)}건`}
          width={360}
          searchValue={itemSearch}
          searchPlaceholder="품목명, 코드 검색"
          onSearchChange={setItemSearch}
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
            const lowStock =
              item.min_stock != null && Number(item.quantity) < Number(item.min_stock);
            return (
              <button
                key={item.item_id}
                type="button"
                onClick={() => {
                  setAddMode(false);
                  setSelectedItem(isSelected ? null : item);
                }}
                className="flex w-full items-center gap-2 rounded-[10px] border px-3 py-2 text-left transition-colors hover:brightness-[1.04]"
                style={{
                  background: isSelected
                    ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
                    : LEGACY_COLORS.s2,
                  borderColor: isSelected ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                }}
              >
                <span
                  className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-black tabular-nums"
                  style={{
                    background: isSelected
                      ? LEGACY_COLORS.blue
                      : `color-mix(in srgb, ${LEGACY_COLORS.muted2} 16%, transparent)`,
                    color: isSelected ? LEGACY_COLORS.white : LEGACY_COLORS.muted,
                  }}
                >
                  {item.item_code ?? "—"}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-[13px] font-semibold"
                  style={{ color: LEGACY_COLORS.text }}
                >
                  {item.item_name}
                </span>
                {lowStock && <StatusPill label="부족" tone="danger" showDot maxWidth={50} />}
              </button>
            );
          }}
        />

        <AdminDetailCard
          title={
            addMode
              ? "새 품목 추가"
              : selectedItem
                ? selectedItem.item_name
                : "품목을 선택하세요"
          }
          subtitle={
            addMode
              ? "필요한 항목을 채우고 추가 버튼을 눌러주세요."
              : selectedItem
                ? selectedItem.item_code ?? undefined
                : undefined
          }
          status={
            !addMode && selectedItem ? (
              selectedItem.min_stock != null &&
              Number(selectedItem.quantity) < Number(selectedItem.min_stock) ? (
                <StatusPill label="안전재고 부족" tone="danger" />
              ) : (
                <StatusPill label="정상" tone="success" />
              )
            ) : null
          }
          tabs={!addMode && selectedItem ? DETAIL_TABS : undefined}
          activeTab={tab}
          onTabChange={(id) => setTab(id as DetailTab)}
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
  return <ItemHistoryTab item={item} />;
}

function ItemStockTab({ item }: { item: Item }) {
  const safety = item.min_stock ?? 0;
  const current = Number(item.quantity);
  const warehouse = Number(item.warehouse_qty ?? 0);
  const status =
    item.min_stock != null && current < item.min_stock
      ? { label: "안전재고 부족", tone: LEGACY_COLORS.red }
      : { label: "정상", tone: LEGACY_COLORS.green };
  return (
    <div className="grid grid-cols-2 gap-3">
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
      className="rounded-[14px] border px-4 py-4"
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
    <div className="flex flex-col gap-5">
      <BomList
        title="구성품 (이 품목이 부모인 BOM)"
        rows={composition.map((r) => ({
          code: r.child_item_code,
          name: r.child_item_name,
          qty: r.quantity,
          unit: r.unit,
        }))}
        emptyHint="이 품목을 부모로 하는 BOM이 없습니다."
      />
      <BomList
        title="사용처 (이 품목이 자식으로 들어간 부모)"
        rows={usedIn.map((r) => ({
          code: r.parent_item_code,
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
    <div>
      <div className="mb-2 text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
        {title}
      </div>
      <div
        className="overflow-hidden rounded-[12px] border"
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
                className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-black"
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
            className="w-full px-4 py-2 text-left text-[11px] font-bold transition-colors hover:brightness-105"
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

function ItemHistoryTab({ item }: { item: Item }) {
  return (
    <div
      className="rounded-[14px] border p-4"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <HistoryRow label="등록일" value={formatDateTime(item.created_at)} />
        <HistoryRow label="최종 수정일" value={formatDateTime(item.updated_at)} />
      </div>
      <div
        className="mt-4 rounded-[10px] border px-3 py-2 text-[12px]"
        style={{
          background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`,
          borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 25%, transparent)`,
          color: LEGACY_COLORS.muted2,
        }}
      >
        품목별 상세 변경 이력은 향후 거래 로그(transactions)와 연결될 예정입니다.
      </div>
    </div>
  );
}

function HistoryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="text-[11px] font-bold uppercase tracking-[0.08em]"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {label}
      </div>
      <div className="text-[13px] font-bold" style={{ color: LEGACY_COLORS.text }}>
        {value}
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

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}
