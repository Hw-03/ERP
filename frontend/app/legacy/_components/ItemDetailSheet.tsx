"use client";

import { useEffect, useState } from "react";
import { api, type Item, type TransactionLog } from "@/lib/api";
import { BottomSheet } from "@/features/mes/shared/BottomSheet";
import { ItemDetailHistoryList } from "./ItemDetailHistoryList";
import { ItemDetailActionForm, type ItemDetailActionMode } from "./ItemDetailActionForm";
import { LEGACY_COLORS } from "./legacyUi";
import { erpCodeDeptBadge } from "@/lib/mes/process";
import { getStockState } from "@/lib/mes/inventory";
import { formatQty } from "@/lib/mes/format";
import { useDeptColorLookup } from "./DepartmentsContext";

type ActionMode = ItemDetailActionMode;

export function ItemDetailSheet({
  item,
  onClose,
  onSaved,
}: {
  item: Item | null;
  onClose: () => void;
  onSaved: (updated: Item) => void;
}) {
  const [mode, setMode] = useState<ActionMode>("ADJUST");
  const [qty, setQty] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const getDeptColor = useDeptColorLookup();

  useEffect(() => {
    if (!item) return;
    setMode("ADJUST");
    setQty(String(Number(item.quantity)));
    setNotes("");
    setError(null);
    void api.getTransactions({ itemId: item.item_id, limit: 10 }).then(setLogs).catch(() => setLogs([]));
  }, [item]);

  if (!item) return null;

  const availableQty = Number(
    item.available_quantity ?? Number(item.quantity) - Number(item.pending_quantity ?? 0),
  );
  const stockState = getStockState(availableQty, item.min_stock == null ? null : Number(item.min_stock));
  const deptBadge = erpCodeDeptBadge(item.erp_code, getDeptColor);

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
      } else if (mode === "RECEIVE") {
        response = await api.receiveInventory(payload);
      } else {
        response = await api.shipInventory(payload);
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

  return (
    <BottomSheet open={!!item} onClose={onClose} title={item.item_name}>
      <div className="px-5 pb-6">
        <div className="mb-[14px]">
          <div className="mb-[6px] flex flex-wrap gap-[6px]">
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

          <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            {[
              ["품목 코드", item.erp_code ?? "-"],
              ["사양", item.spec || "-"],
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
              ["모델", item.legacy_model || "공용"],
              ["공급처", item.supplier || "-"],
              ["바코드", item.barcode || "-"],
              ["안전재고", item.min_stock != null ? formatQty(item.min_stock) : "-"],
            ].map(([label, value], index, array) => (
              <div
                key={label}
                className="flex items-center justify-between gap-3 px-[14px] py-[10px]"
                style={{
                  borderBottom: index === array.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                }}
              >
                <div className="text-[11px] font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                  {label}
                </div>
                <div className="text-right">
                  {value}
                </div>
              </div>
            ))}
          </div>
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

        <ItemDetailHistoryList logs={logs} />
      </div>
    </BottomSheet>
  );
}
