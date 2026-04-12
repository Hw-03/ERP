"use client";

import { useEffect, useMemo, useState } from "react";
import { Boxes, PackageSearch, RefreshCw } from "lucide-react";
import { api, type Item, type TransactionLog } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import {
  KPI_FILTERS,
  LEGACY_COLORS,
  LEGACY_FILE_TYPES,
  LEGACY_MODELS,
  LEGACY_PARTS,
  fileTypeBadge,
  formatNumber,
  getStockState,
  groupedItems,
  itemMatchesKpi,
  normalizeModel,
  transactionColor,
  transactionLabel,
} from "./legacyUi";

type DesktopInventoryAction = "ADJUST" | "RECEIVE" | "SHIP";

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.2em]"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  activeStyle,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  activeStyle?: { bg: string; border: string; color: string };
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition"
      style={
        active
          ? {
              background: activeStyle?.bg ?? "rgba(79,142,247,.18)",
              borderColor: activeStyle?.border ?? LEGACY_COLORS.blue,
              color: activeStyle?.color ?? "#fff",
            }
          : {
              background: LEGACY_COLORS.s1,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.muted2,
            }
      }
    >
      {label}
    </button>
  );
}

export function DesktopInventoryView({
  globalSearch,
  onStatusChange,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemLogs, setItemLogs] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileType, setFileType] = useState("전체");
  const [part, setPart] = useState("전체");
  const [model, setModel] = useState("전체");
  const [kpi, setKpi] = useState("전체");
  const [grouped, setGrouped] = useState(false);
  const [action, setAction] = useState<DesktopInventoryAction>("ADJUST");
  const [quantity, setQuantity] = useState("0");
  const [notes, setNotes] = useState("");

  async function loadItems() {
    try {
      setLoading(true);
      setError(null);
      const nextItems = await api.getItems({
        limit: 2000,
        search: globalSearch.trim() || undefined,
        legacyFileType: fileType === "전체" ? undefined : fileType,
        legacyPart: part === "전체" ? undefined : part,
        legacyModel: model === "전체" ? undefined : model,
      });
      setItems(nextItems);
      onStatusChange(`재고 ${nextItems.length}건 동기화 완료`);
      if (selectedItem) {
        setSelectedItem(nextItems.find((item) => item.item_id === selectedItem.item_id) ?? null);
      }
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "재고 데이터를 불러오지 못했습니다.";
      setError(message);
      onStatusChange(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSearch, fileType, part, model]);

  useEffect(() => {
    if (!selectedItem) {
      setItemLogs([]);
      setQuantity("0");
      setNotes("");
      return;
    }
    setAction("ADJUST");
    setQuantity(String(Number(selectedItem.quantity)));
    setNotes("");
    void api
      .getTransactions({ itemId: selectedItem.item_id, limit: 10 })
      .then(setItemLogs)
      .catch(() => setItemLogs([]));
  }, [selectedItem]);

  const filteredItems = useMemo(() => items.filter((item) => itemMatchesKpi(item, kpi)), [items, kpi]);

  const rows = useMemo(() => {
    if (!grouped) {
      return filteredItems.map((item) => ({
        key: item.item_id,
        representative: item,
        quantity: Number(item.quantity),
        count: 1,
      }));
    }
    return groupedItems(filteredItems);
  }, [filteredItems, grouped]);

  const summary = useMemo(() => {
    const totalQuantity = rows.reduce((acc, row) => acc + row.quantity, 0);
    const lowCount = rows.filter((row) => {
      const stock = getStockState(
        row.quantity,
        row.representative.min_stock == null ? null : Number(row.representative.min_stock),
      );
      return stock.label === "부족";
    }).length;
    const zeroCount = rows.filter((row) => row.quantity <= 0).length;
    return { totalQuantity, lowCount, zeroCount };
  }, [rows]);

  async function submitInventoryAction() {
    if (!selectedItem) return;
    const numericQty = Number(quantity);
    if (Number.isNaN(numericQty) || numericQty < 0) {
      setError("수량을 다시 확인해 주세요.");
      return;
    }
    if (action !== "ADJUST" && numericQty <= 0) {
      setError("입고/출고 수량은 1 이상이어야 합니다.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      if (action === "ADJUST") {
        await api.adjustInventory({
          item_id: selectedItem.item_id,
          quantity: numericQty,
          reason: notes || "데스크톱 재고 조정",
        });
      } else if (action === "RECEIVE") {
        await api.receiveInventory({
          item_id: selectedItem.item_id,
          quantity: numericQty,
          notes: notes || undefined,
        });
      } else {
        await api.shipInventory({
          item_id: selectedItem.item_id,
          quantity: numericQty,
          notes: notes || undefined,
        });
      }

      await loadItems();
      const refreshed = await api.getItem(selectedItem.item_id);
      setSelectedItem(refreshed);
      setItemLogs(await api.getTransactions({ itemId: selectedItem.item_id, limit: 10 }));
      onStatusChange(`${selectedItem.item_name} 재고 처리 완료`);
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : "재고 처리를 완료하지 못했습니다.";
      setError(message);
      onStatusChange(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── Left filter panel ──────────────────────────────────── */}
      <div
        className="flex w-[195px] shrink-0 flex-col gap-3 overflow-y-auto border-r px-3 py-4"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <FilterSection title="파일 타입">
          <div className="flex flex-wrap gap-1.5">
            {LEGACY_FILE_TYPES.map((entry) => (
              <FilterPill
                key={entry}
                label={entry}
                active={fileType === entry}
                onClick={() => setFileType(entry)}
              />
            ))}
          </div>
        </FilterSection>

        <FilterSection title="파트">
          <div className="flex flex-wrap gap-1.5">
            {LEGACY_PARTS.map((entry) => (
              <FilterPill
                key={entry}
                label={entry}
                active={part === entry}
                onClick={() => setPart(entry)}
                activeStyle={{
                  bg: "rgba(31,209,122,.16)",
                  border: LEGACY_COLORS.green,
                  color: LEGACY_COLORS.green,
                }}
              />
            ))}
          </div>
        </FilterSection>

        <FilterSection title="모델">
          <div className="flex flex-wrap gap-1.5">
            {LEGACY_MODELS.map((entry) => (
              <FilterPill
                key={entry}
                label={entry}
                active={model === entry}
                onClick={() => setModel(entry)}
                activeStyle={{
                  bg: "rgba(6,182,212,.16)",
                  border: LEGACY_COLORS.cyan,
                  color: LEGACY_COLORS.cyan,
                }}
              />
            ))}
          </div>
        </FilterSection>

        <FilterSection title="재고 상태">
          <div className="grid grid-cols-2 gap-1.5">
            {KPI_FILTERS.map((entry) => (
              <FilterPill
                key={entry}
                label={entry}
                active={kpi === entry}
                onClick={() => setKpi(entry)}
                activeStyle={{
                  bg: "rgba(124,58,237,.18)",
                  border: LEGACY_COLORS.purple,
                  color: "#c4b5fd",
                }}
              />
            ))}
          </div>
        </FilterSection>

        <div>
          <button
            onClick={() => setGrouped((current) => !current)}
            className="flex w-full items-center justify-between rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition"
            style={{
              background: grouped ? "rgba(244,185,66,.14)" : LEGACY_COLORS.s1,
              borderColor: grouped ? LEGACY_COLORS.yellow : LEGACY_COLORS.border,
              color: grouped ? LEGACY_COLORS.yellow : LEGACY_COLORS.muted2,
            }}
          >
            같은 품목 묶기
            <span>{grouped ? "ON" : "OFF"}</span>
          </button>
        </div>

        {/* Summary */}
        <div
          className="mt-auto rounded-xl border p-3"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div
            className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            요약
          </div>
          <div className="space-y-1.5 text-[11px]">
            {[
              { label: "표시", value: formatNumber(rows.length), color: LEGACY_COLORS.blue },
              { label: "재고합", value: formatNumber(summary.totalQuantity), color: LEGACY_COLORS.green },
              { label: "부족", value: formatNumber(summary.lowCount), color: LEGACY_COLORS.yellow },
              { label: "품절", value: formatNumber(summary.zeroCount), color: LEGACY_COLORS.red },
            ].map((entry) => (
              <div key={entry.label} className="flex items-center justify-between">
                <span style={{ color: LEGACY_COLORS.muted2 }}>{entry.label}</span>
                <span className="font-mono font-bold" style={{ color: entry.color }}>
                  {entry.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Center table (flex, no calc) ────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col" style={{ background: LEGACY_COLORS.bg }}>
        {/* Header bar */}
        <div
          className="flex shrink-0 items-center justify-between border-b px-4 py-2.5"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <div>
            <span className="text-[13px] font-bold">재고 작업대</span>
            <span className="ml-2 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
              {loading ? "로딩 중..." : `${rows.length}건`}
            </span>
          </div>
          <button
            onClick={() => void loadItems()}
            className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          >
            <RefreshCw className="h-3 w-3" />
            새로고침
          </button>
        </div>

        {/* Scrollable table */}
        {loading ? (
          <div
            className="flex flex-1 items-center justify-center text-sm"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            데이터를 불러오는 중입니다...
          </div>
        ) : error ? (
          <div
            className="flex flex-1 items-center justify-center px-8 text-center text-sm"
            style={{ color: LEGACY_COLORS.red }}
          >
            {error}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="min-w-full text-left">
              <thead className="sticky top-0 z-10" style={{ background: LEGACY_COLORS.s2 }}>
                <tr className="text-[10px] uppercase tracking-[0.16em]" style={{ color: LEGACY_COLORS.muted2 }}>
                  <th className="px-4 py-2 font-semibold">상태</th>
                  <th className="px-4 py-2 font-semibold">품목</th>
                  <th className="px-4 py-2 font-semibold">파트</th>
                  <th className="px-4 py-2 text-right font-semibold">현재고</th>
                  <th className="px-4 py-2 text-right font-semibold">안전재고</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const stockState = getStockState(
                    row.quantity,
                    row.representative.min_stock == null
                      ? null
                      : Number(row.representative.min_stock),
                  );
                  const isSelected = selectedItem?.item_id === row.representative.item_id;
                  return (
                    <tr
                      key={row.key}
                      onClick={() => setSelectedItem(row.representative)}
                      className="cursor-pointer border-b"
                      style={{
                        borderColor: LEGACY_COLORS.border,
                        background: isSelected
                          ? "rgba(79,142,247,.10)"
                          : undefined,
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected)
                          (e.currentTarget as HTMLElement).style.background =
                            "rgba(255,255,255,.04)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected)
                          (e.currentTarget as HTMLElement).style.background = "";
                      }}
                    >
                      <td className="px-4 py-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{
                            background:
                              stockState.label === "정상"
                                ? "rgba(31,209,122,.16)"
                                : stockState.label === "부족"
                                  ? "rgba(244,185,66,.16)"
                                  : "rgba(242,95,92,.16)",
                            color: stockState.color,
                          }}
                        >
                          {stockState.label}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-[13px] font-semibold">
                          {row.representative.item_name}
                        </div>
                        <div className="mt-0.5 text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                          {row.representative.item_code}
                          {grouped && row.count > 1 ? ` · ${row.count}종 묶음` : ""}
                          {normalizeModel(row.representative.legacy_model) !== "공용"
                            ? ` · ${normalizeModel(row.representative.legacy_model)}`
                            : ""}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                        {row.representative.legacy_part || row.representative.location || "-"}
                      </td>
                      <td
                        className="px-4 py-2 text-right font-mono text-sm font-bold"
                        style={{ color: stockState.color }}
                      >
                        {formatNumber(row.quantity)}
                      </td>
                      <td
                        className="px-4 py-2 text-right font-mono text-[11px]"
                        style={{ color: LEGACY_COLORS.muted2 }}
                      >
                        {row.representative.min_stock != null
                          ? formatNumber(row.representative.min_stock)
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-16 text-center text-sm"
                      style={{ color: LEGACY_COLORS.muted2 }}
                    >
                      조건에 맞는 품목이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Right detail panel ──────────────────────────────────── */}
      <DesktopRightPanel
        title={selectedItem ? selectedItem.item_name : "품목 상세"}
        subtitle={
          selectedItem
            ? `${selectedItem.item_code} · ${selectedItem.legacy_part || "미지정"} · ${normalizeModel(selectedItem.legacy_model)}`
            : "왼쪽 목록에서 품목을 선택하면 재고 처리 기능이 표시됩니다."
        }
      >
        {selectedItem ? (
          <div className="space-y-3">
            {/* Item meta */}
            <section
              className="rounded-2xl border p-3"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div className="mb-2.5 flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-xl"
                  style={{ background: "rgba(79,142,247,.16)", color: LEGACY_COLORS.blue }}
                >
                  <Boxes className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[13px] font-bold">{selectedItem.item_name}</div>
                  <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    {selectedItem.spec || "사양 미입력"}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["현재고", `${formatNumber(selectedItem.quantity)} ${selectedItem.unit}`],
                  ["바코드", selectedItem.barcode || "-"],
                  ["공급처", selectedItem.supplier || "-"],
                  [
                    "안전재고",
                    selectedItem.min_stock != null ? formatNumber(selectedItem.min_stock) : "-",
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl px-2.5 py-2"
                    style={{ background: LEGACY_COLORS.s1 }}
                  >
                    <div className="mb-0.5 text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                      {label}
                    </div>
                    <div className="text-[12px] font-semibold">{value}</div>
                  </div>
                ))}
              </div>
              {selectedItem.legacy_file_type && (
                <div className="mt-2">
                  {(() => {
                    const badge = fileTypeBadge(selectedItem.legacy_file_type);
                    return (
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                        style={{ background: badge.bg, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                    );
                  })()}
                </div>
              )}
            </section>

            {/* Action panel */}
            <section
              className="rounded-2xl border p-3"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div
                className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em]"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                재고 처리
              </div>
              <div className="mb-2.5 grid grid-cols-3 gap-1.5">
                {(
                  [
                    ["ADJUST", "조정"],
                    ["RECEIVE", "입고"],
                    ["SHIP", "출고"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setAction(id);
                      setQuantity(
                        id === "ADJUST" ? String(Number(selectedItem.quantity)) : "1",
                      );
                    }}
                    className="rounded-xl px-2 py-1.5 text-xs font-semibold transition"
                    style={{
                      background: action === id ? LEGACY_COLORS.blue : LEGACY_COLORS.s1,
                      color: action === id ? "#fff" : LEGACY_COLORS.muted2,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mb-2">
                <div className="mb-1 text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {action === "ADJUST" ? "최종 수량" : "처리 수량"}
                </div>
                <input
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-xl border px-3 py-2 text-center font-mono text-xl font-black outline-none"
                  style={{
                    background: LEGACY_COLORS.s1,
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.text,
                  }}
                />
              </div>

              <div className="mb-2.5 grid grid-cols-4 gap-1.5">
                {[-10, -1, 1, 10].map((delta) => (
                  <button
                    key={delta}
                    onClick={() =>
                      setQuantity((current) => {
                        const base = Number(current || 0);
                        const minimum = action === "ADJUST" ? 0 : 1;
                        return String(Math.max(minimum, base + delta));
                      })
                    }
                    className="rounded-xl px-2 py-1.5 text-xs font-bold"
                    style={{
                      background:
                        delta < 0 ? "rgba(242,95,92,.14)" : "rgba(31,209,122,.14)",
                      color: delta < 0 ? LEGACY_COLORS.red : LEGACY_COLORS.green,
                    }}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </button>
                ))}
              </div>

              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="조정 사유 또는 메모"
                rows={2}
                className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
                style={{
                  background: LEGACY_COLORS.s1,
                  borderColor: LEGACY_COLORS.border,
                  color: LEGACY_COLORS.text,
                }}
              />

              {error ? (
                <div
                  className="mt-2 rounded-xl border px-3 py-2 text-xs"
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
                onClick={() => void submitInventoryAction()}
                disabled={saving}
                className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
              >
                {saving ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PackageSearch className="h-3.5 w-3.5" />
                )}
                {saving ? "처리 중..." : "재고 반영"}
              </button>
            </section>

            {/* Recent history */}
            <section
              className="rounded-2xl border p-3"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div
                className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em]"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                최근 이력 10건
              </div>
              <div className="space-y-1.5">
                {itemLogs.length === 0 ? (
                  <div
                    className="rounded-xl px-3 py-3 text-xs"
                    style={{ background: LEGACY_COLORS.s1, color: LEGACY_COLORS.muted2 }}
                  >
                    최근 거래 이력이 없습니다.
                  </div>
                ) : (
                  itemLogs.map((log) => (
                    <div
                      key={log.log_id}
                      className="rounded-xl px-2.5 py-2"
                      style={{ background: LEGACY_COLORS.s1 }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{
                            background: "rgba(79,142,247,.14)",
                            color: transactionColor(log.transaction_type),
                          }}
                        >
                          {transactionLabel(log.transaction_type)}
                        </span>
                        <span
                          className="font-mono text-xs font-bold"
                          style={{ color: transactionColor(log.transaction_type) }}
                        >
                          {log.quantity_change >= 0 ? "+" : ""}
                          {formatNumber(log.quantity_change)}
                        </span>
                      </div>
                      <div className="mt-1 text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                        {new Date(log.created_at).toLocaleString("ko-KR")}
                        {log.produced_by ? ` · ${log.produced_by}` : ""}
                      </div>
                      {log.notes ? (
                        <div className="mt-0.5 text-[11px]">{log.notes}</div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        ) : (
          <div
            className="rounded-2xl border px-4 py-5 text-sm leading-6"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.muted2,
            }}
          >
            품목을 선택하면 현재고, 공급처, 바코드, 안전재고와 함께 재고 조정/입고/출고 작업을
            즉시 처리할 수 있습니다.
          </div>
        )}
      </DesktopRightPanel>
    </div>
  );
}
