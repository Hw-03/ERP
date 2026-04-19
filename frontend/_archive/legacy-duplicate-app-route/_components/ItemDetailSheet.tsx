"use client";

import { useEffect, useState } from "react";
import { api, type Item, type TransactionLog } from "@/lib/api";
import { BottomSheet } from "./BottomSheet";
import {
  LEGACY_COLORS,
  fileTypeBadge,
  formatNumber,
  getStockState,
  transactionColor,
  transactionLabel,
} from "./legacyUi";

type ActionMode = "ADJUST" | "RECEIVE" | "SHIP";

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
  const typeBadge = fileTypeBadge(item.legacy_file_type);

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
            <span
              className="rounded-full px-[7px] py-[2px] text-[9px] font-bold"
              style={{ background: typeBadge.bg, color: typeBadge.color }}
            >
              {typeBadge.label}
            </span>
          </div>

          <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            {[
              ["코드", item.item_code],
              ...(item.erp_code ? [["ERP 코드", item.erp_code] as [string, string]] : []),
              ["사양", item.spec || "-"],
              ["총재고", `${formatNumber(item.quantity)} ${item.unit}`],
              [
                "가용 / 예약",
                `${formatNumber(item.available_quantity ?? item.quantity)} / ${formatNumber(item.pending_quantity ?? 0)} ${item.unit}`,
              ],
              ...(item.last_reserver_name && Number(item.pending_quantity ?? 0) > 0
                ? [["점유자", `🔒 ${item.last_reserver_name}`] as [string, string]]
                : []),
              ["위치", item.location || "-"],
              ["파트", item.legacy_part || "-"],
              ["모델", item.legacy_model || "공용"],
              ["공급처", item.supplier || "-"],
              ["바코드", item.barcode || "-"],
              ["안전재고", item.min_stock != null ? formatNumber(item.min_stock) : "-"],
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
                <div className={`text-right ${label === "코드" || label === "바코드" ? "font-mono" : ""}`}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-[14px] overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
          <div className="flex gap-2 px-[14px] py-3">
            {[
              { id: "ADJUST", label: "조정" },
              { id: "RECEIVE", label: "입고" },
              { id: "SHIP", label: "출고" },
            ].map((action) => (
              <button
                key={action.id}
                onClick={() => {
                  setMode(action.id as ActionMode);
                  setQty(action.id === "ADJUST" ? String(Number(item.quantity)) : "1");
                }}
                className="flex-1 rounded-xl py-2 text-xs font-bold"
                style={{
                  background: mode === action.id ? LEGACY_COLORS.blue : LEGACY_COLORS.s3,
                  color: mode === action.id ? "#fff" : LEGACY_COLORS.muted2,
                }}
              >
                {action.label}
              </button>
            ))}
          </div>

          <div className="px-[14px] pb-[14px]">
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
              {mode === "ADJUST" ? "최종 수량" : "처리 수량"}
            </div>
            <input
              value={qty}
              onChange={(event) => setQty(event.target.value)}
              inputMode="numeric"
              className="mb-[7px] w-full rounded-[11px] border px-[13px] py-[11px] text-center text-[22px] font-bold outline-none"
              style={{
                background: LEGACY_COLORS.s1,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.text,
                fontFamily: 'Menlo, "Courier New", monospace',
              }}
            />
            <div className="mb-3 grid grid-cols-4 gap-[7px]">
              {[-10, -1, 1, 10].map((delta) => (
                <button
                  key={delta}
                  onClick={() => bump(delta)}
                  className="rounded-[10px] py-[11px] text-sm font-bold"
                  style={{
                    background: delta < 0 ? "rgba(242,95,92,.15)" : "rgba(31,209,122,.12)",
                    color: delta < 0 ? LEGACY_COLORS.red : LEGACY_COLORS.green,
                  }}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </button>
              ))}
            </div>

            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
              비고
            </div>
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="메모 (선택)"
              className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none"
              style={{
                background: LEGACY_COLORS.s1,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.text,
              }}
            />

            {error ? (
              <div
                className="mt-3 rounded-xl border px-3 py-2 text-xs"
                style={{
                  background: "rgba(242,95,92,.12)",
                  borderColor: "rgba(242,95,92,.25)",
                  color: LEGACY_COLORS.red,
                }}
              >
                {error}
              </div>
            ) : null}

            <button
              onClick={() => void submit()}
              disabled={saving}
              className="mt-3 w-full rounded-xl py-[13px] text-[15px] font-bold disabled:opacity-50"
              style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
            >
              {saving ? "처리 중..." : mode === "ADJUST" ? "수정" : mode === "RECEIVE" ? "입고" : "출고"}
            </button>
          </div>
        </div>

        <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted }}>
          📋 최근 입출고
        </div>
        <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
          {logs.length === 0 ? (
            <div className="px-[14px] py-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
              최근 이력이 없습니다.
            </div>
          ) : (
            logs.map((log, index) => (
              <div
                key={log.log_id}
                className="flex items-start gap-2 px-[14px] py-[10px]"
                style={{
                  borderBottom: index === logs.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                }}
              >
                <span
                  className="rounded px-[6px] py-[2px] text-[10px] font-bold"
                  style={{
                    background:
                      log.transaction_type === "RECEIVE" ? "rgba(31,209,122,.15)" : "rgba(242,95,92,.15)",
                    color: transactionColor(log.transaction_type),
                  }}
                >
                  {transactionLabel(log.transaction_type)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                    {new Date(log.created_at).toLocaleString("ko-KR")}
                  </div>
                  {log.produced_by ? (
                    <div className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
                      👤 {log.produced_by}
                    </div>
                  ) : null}
                  {log.notes ? (
                    <div className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
                      {log.notes}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className="font-mono text-sm font-bold"
                    style={{ color: transactionColor(log.transaction_type) }}
                  >
                    {log.quantity_change >= 0 ? "+" : ""}
                    {formatNumber(log.quantity_change)}
                  </div>
                  <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    → {formatNumber(log.quantity_after)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
