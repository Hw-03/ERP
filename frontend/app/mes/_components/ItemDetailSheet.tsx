"use client";

import { useEffect, useState } from "react";
import { api, type InventoryLocationRow, type Item } from "@/lib/api";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { ItemDetailHistoryList } from "./ItemDetailHistoryList";
import { ItemDetailActionForm, type ItemDetailActionMode } from "./ItemDetailActionForm";
import { useTransactionsQuery } from "@/lib/queries/useTransactionsQuery";
import { useItemLocationsQuery } from "@/lib/queries/useInventoryQuery";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { mesCodeDeptBadge } from "@/lib/mes/process";
import { getStockState } from "@/lib/mes/inventory";
import { formatQty } from "@/lib/mes/format";
import { useDeptColor, useDeptColorLookup } from "./DepartmentsContext";
import { SegmentedControl } from "./mobile/primitives";

type ActionMode = ItemDetailActionMode;
type DetailTab = "summary" | "locations" | "history";

export function ItemDetailSheet({
  item,
  onClose,
  onSaved,
}: {
  item: Item | null;
  onClose: () => void;
  onSaved: (updated: Item) => void;
}) {
  const [tab, setTab] = useState<DetailTab>("summary");
  const [mode, setMode] = useState<ActionMode>("ADJUST");
  const [qty, setQty] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const getDeptColor = useDeptColorLookup();

  const { data: logs = [] } = useTransactionsQuery(
    item ? { itemId: item.item_id, limit: 10 } : undefined,
    { enabled: !!item },
  );
  const { data: locations = [], isLoading: locationsLoading } =
    useItemLocationsQuery(item?.item_id ?? "");

  useEffect(() => {
    if (!item) return;
    setTab("summary");
    setMode("ADJUST");
    setQty(String(Number(item.quantity)));
    setNotes("");
    setError(null);
  }, [item]);

  if (!item) return null;

  const availableQty = Number(
    item.available_quantity ?? Number(item.quantity) - Number(item.pending_quantity ?? 0),
  );
  const stockState = getStockState(availableQty, item.min_stock == null ? null : Number(item.min_stock));
  const deptBadge = mesCodeDeptBadge(item.mes_code, getDeptColor);

  const bump = (delta: number) => {
    const minimum = mode === "ADJUST" ? 0 : 1;
    setQty((current) => String(Math.max(minimum, Number(current || 0) + delta)));
  };

  async function submit() {
    const currentItem = item;
    if (!currentItem) return;

    const numericQty = Number(qty);
    if (Number.isNaN(numericQty) || numericQty < 0) {
      setError("수량을 확인해 주세요.");
      return;
    }
    if (mode !== "ADJUST" && numericQty <= 0) {
      setError("수량은 1 이상이어야 합니다.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const payload = {
        item_id: currentItem.item_id,
        quantity: numericQty,
        notes: notes || undefined,
      };

      let response;
      if (mode === "ADJUST") {
        response = await api.adjustInventory({
          item_id: currentItem.item_id,
          quantity: numericQty,
          reason: notes || "레거시 UI 조정",
        });
      } else {
        response = await api.receiveInventory(payload);
      }

      onSaved({
        ...currentItem,
        quantity: Number(response.quantity),
        location: response.location,
        updated_at: response.updated_at,
      });
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "처리하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const tabs: { id: DetailTab; label: string; badge?: number | null }[] = [
    { id: "summary", label: "요약" },
    { id: "locations", label: "위치", badge: locations.length || null },
    { id: "history", label: "거래", badge: logs.length || null },
  ];

  return (
    <BottomSheet open={!!item} onClose={onClose} title={item.item_name}>
      <div className="px-5 pb-6">
        <div className="mb-[10px] flex flex-wrap gap-[6px]">
          <span
            className="rounded-full px-[7px] py-[2px] text-[9px] font-bold"
            style={{
              background:
                stockState.label === "정상"
                  ? "rgba(31,209,122,.15)"
                  : stockState.label === "부족"
                    ? "rgba(244,185,66,.15)"
                    : "rgba(242,95,92,.15)",
              color: stockState.color,
            }}
          >
            {stockState.label}
          </span>
          {deptBadge && (
            <span
              className="rounded-full px-[7px] py-[2px] text-[9px] font-bold"
              style={{ background: deptBadge.bg, color: deptBadge.color }}
            >
              {deptBadge.label}
            </span>
          )}
        </div>

        {/* 탭 */}
        <div className="mb-[14px]">
          <SegmentedControl
            tabs={tabs}
            active={tab}
            onChange={(next) => setTab(next as DetailTab)}
          />
        </div>

        {tab === "summary" ? (
          <>
            <div
              className="mb-[14px] overflow-hidden rounded-[14px] border"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              {[
                ["품목 코드", item.mes_code ?? "-"],
                ["총재고", `${formatQty(item.quantity)} ${item.unit}`],
                [
                  "가용 / 예약",
                  `${formatQty(item.available_quantity ?? item.quantity)} / ${formatQty(item.pending_quantity ?? 0)} ${item.unit}`,
                ],
                ...(item.last_reserver_name && Number(item.pending_quantity ?? 0) > 0
                  ? [["점유자", `🔒 ${item.last_reserver_name}`] as [string, string]]
                  : []),
                ["위치", item.location || "-"],
                ["파트", item.legacy_part || "-"],
                ["공급처", item.supplier || "-"],
                ["안전재고", item.min_stock != null ? formatQty(item.min_stock) : "-"],
              ].map(([label, value], index, array) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 px-[14px] py-[10px]"
                  style={{
                    borderBottom:
                      index === array.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                  }}
                >
                  <div
                    className="text-[11px] font-semibold"
                    style={{ color: LEGACY_COLORS.muted2 }}
                  >
                    {label}
                  </div>
                  <div className="text-right">{value}</div>
                </div>
              ))}
            </div>

            <ItemDetailActionForm
              mode={mode}
              qty={qty}
              notes={notes}
              error={error}
              saving={saving}
              initialQuantity={Number(item.quantity)}
              setMode={setMode}
              setQty={setQty}
              setNotes={setNotes}
              bump={bump}
              onSubmit={() => void submit()}
            />
          </>
        ) : null}

        {tab === "locations" ? (
          <ItemLocationsPanel
            loading={locationsLoading}
            locations={locations}
            unit={item.unit}
          />
        ) : null}

        {tab === "history" ? <ItemDetailHistoryList logs={logs} /> : null}
      </div>
    </BottomSheet>
  );
}

const STATUS_LABEL: Record<string, string> = {
  WAREHOUSE: "창고",
  PRODUCTION: "생산",
  DEFECTIVE: "불량",
  PENDING: "예약",
};

function ItemLocationsPanel({
  loading,
  locations,
  unit,
}: {
  loading: boolean;
  locations: InventoryLocationRow[];
  unit: string;
}) {
  if (loading) {
    return (
      <div
        className="rounded-[14px] border px-4 py-6 text-center text-sm"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.muted2,
        }}
      >
        위치 정보를 불러오는 중…
      </div>
    );
  }
  if (locations.length === 0) {
    return (
      <div
        className="rounded-[14px] border px-4 py-6 text-center text-sm"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.muted2,
        }}
      >
        등록된 위치 분포가 없습니다.
      </div>
    );
  }

  const total = locations.reduce((s, r) => s + Number(r.quantity || 0), 0);
  return (
    <div
      className="overflow-hidden rounded-[14px] border"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      {locations.map((row, index) => (
        <LocationRow
          key={`${row.department}-${row.status}-${index}`}
          row={row}
          unit={unit}
          total={total}
          isLast={index === locations.length - 1}
        />
      ))}
    </div>
  );
}

function LocationRow({
  row,
  unit,
  total,
  isLast,
}: {
  row: InventoryLocationRow;
  unit: string;
  total: number;
  isLast: boolean;
}) {
  const deptColor = useDeptColor(row.department);
  const statusLabel = STATUS_LABEL[row.status] ?? row.status;
  const pct = total > 0 ? (Number(row.quantity || 0) / total) * 100 : 0;
  return (
    <div
      className="px-[14px] py-[10px]"
      style={{ borderBottom: isLast ? "none" : `1px solid ${LEGACY_COLORS.border}` }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-[2px] text-[10px] font-bold"
            style={{ background: `${deptColor}26`, color: deptColor }}
          >
            {row.department}
          </span>
          <span
            className="text-[10px] font-semibold uppercase tracking-[1px]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {statusLabel}
          </span>
        </div>
        <div className="text-right text-sm font-bold tabular-nums" style={{ color: LEGACY_COLORS.text }}>
          {formatQty(row.quantity)} {unit}
        </div>
      </div>
      <div
        className="mt-1 h-[3px] w-full overflow-hidden rounded-full"
        style={{ background: LEGACY_COLORS.s3 }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, pct)}%`, background: deptColor }}
        />
      </div>
    </div>
  );
}
