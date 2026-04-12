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

function PanelCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
        {title}
      </div>
      {children}
    </section>
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
    void api.getTransactions({ itemId: selectedItem.item_id, limit: 10 }).then(setItemLogs).catch(() => setItemLogs([]));
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
      const stock = getStockState(row.quantity, row.representative.min_stock == null ? null : Number(row.representative.min_stock));
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
      const message = nextError instanceof Error ? nextError.message : "재고 처리를 완료하지 못했습니다.";
      setError(message);
      onStatusChange(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="grid min-h-0 flex-1 grid-cols-[290px_minmax(0,1fr)] gap-5 px-6 py-6">
        <div className="space-y-4">
          <PanelCard title="파일 타입">
            <div className="flex flex-wrap gap-2">
              {LEGACY_FILE_TYPES.map((entry) => (
                <button
                  key={entry}
                  onClick={() => setFileType(entry)}
                  className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                  style={{
                    background: fileType === entry ? LEGACY_COLORS.blue : LEGACY_COLORS.s1,
                    borderColor: fileType === entry ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                    color: fileType === entry ? "#fff" : LEGACY_COLORS.muted2,
                  }}
                >
                  {entry}
                </button>
              ))}
            </div>
          </PanelCard>

          <PanelCard title="파트 / 모델">
            <div className="mb-3 flex flex-wrap gap-2">
              {LEGACY_PARTS.map((entry) => (
                <button
                  key={entry}
                  onClick={() => setPart(entry)}
                  className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                  style={{
                    background: part === entry ? "rgba(31,209,122,.16)" : LEGACY_COLORS.s1,
                    borderColor: part === entry ? LEGACY_COLORS.green : LEGACY_COLORS.border,
                    color: part === entry ? LEGACY_COLORS.green : LEGACY_COLORS.muted2,
                  }}
                >
                  {entry}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {LEGACY_MODELS.map((entry) => (
                <button
                  key={entry}
                  onClick={() => setModel(entry)}
                  className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                  style={{
                    background: model === entry ? "rgba(6,182,212,.16)" : LEGACY_COLORS.s1,
                    borderColor: model === entry ? LEGACY_COLORS.cyan : LEGACY_COLORS.border,
                    color: model === entry ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2,
                  }}
                >
                  {entry}
                </button>
              ))}
            </div>
          </PanelCard>

          <PanelCard title="상태 / 보기">
            <div className="mb-3 grid grid-cols-2 gap-2">
              {KPI_FILTERS.map((entry) => (
                <button
                  key={entry}
                  onClick={() => setKpi(entry)}
                  className="rounded-2xl border px-3 py-2 text-xs font-semibold"
                  style={{
                    background: kpi === entry ? "rgba(124,58,237,.18)" : LEGACY_COLORS.s1,
                    borderColor: kpi === entry ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
                    color: kpi === entry ? "#fff" : LEGACY_COLORS.muted2,
                  }}
                >
                  {entry}
                </button>
              ))}
            </div>
            <button
              onClick={() => setGrouped((current) => !current)}
              className="flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold"
              style={{
                background: grouped ? "rgba(244,185,66,.14)" : LEGACY_COLORS.s1,
                borderColor: grouped ? LEGACY_COLORS.yellow : LEGACY_COLORS.border,
                color: grouped ? LEGACY_COLORS.yellow : LEGACY_COLORS.muted2,
              }}
            >
              같은 품목 묶어 보기
              <span>{grouped ? "ON" : "OFF"}</span>
            </button>
          </PanelCard>

          <PanelCard title="요약">
            <div className="space-y-3">
              {[
                { label: "표시 품목", value: formatNumber(rows.length), color: LEGACY_COLORS.blue },
                { label: "총 재고", value: formatNumber(summary.totalQuantity), color: LEGACY_COLORS.green },
                { label: "부족", value: formatNumber(summary.lowCount), color: LEGACY_COLORS.yellow },
                { label: "품절", value: formatNumber(summary.zeroCount), color: LEGACY_COLORS.red },
              ].map((entry) => (
                <div key={entry.label} className="rounded-2xl px-4 py-3" style={{ background: LEGACY_COLORS.s1 }}>
                  <div className="mb-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    {entry.label}
                  </div>
                  <div className="font-mono text-xl font-black" style={{ color: entry.color }}>
                    {entry.value}
                  </div>
                </div>
              ))}
            </div>
          </PanelCard>
        </div>

        <div className="min-h-0 rounded-[28px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
          <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
            <div>
              <div className="text-lg font-black">재고 작업대</div>
              <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                검색, 필터, 그룹 보기, 상세 조정까지 한 화면에서 처리합니다.
              </div>
            </div>
            <button
              onClick={() => void loadItems()}
              className="flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            >
              <RefreshCw className="h-4 w-4" />
              새로고침
            </button>
          </div>

          {loading ? (
            <div className="flex h-[calc(100vh-220px)] items-center justify-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
              데이터를 불러오는 중입니다...
            </div>
          ) : error ? (
            <div className="flex h-[calc(100vh-220px)] items-center justify-center px-8 text-center text-sm" style={{ color: LEGACY_COLORS.red }}>
              {error}
            </div>
          ) : (
            <div className="h-[calc(100vh-220px)] overflow-auto">
              <table className="min-w-full text-left">
                <thead className="sticky top-0 z-10" style={{ background: LEGACY_COLORS.s2 }}>
                  <tr className="text-xs uppercase tracking-[0.16em]" style={{ color: LEGACY_COLORS.muted2 }}>
                    <th className="px-5 py-3">상태</th>
                    <th className="px-5 py-3">품목</th>
                    <th className="px-5 py-3">위치</th>
                    <th className="px-5 py-3 text-right">현재고</th>
                    <th className="px-5 py-3 text-right">안전재고</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const stockState = getStockState(
                      row.quantity,
                      row.representative.min_stock == null ? null : Number(row.representative.min_stock),
                    );
                    const badge = fileTypeBadge(row.representative.legacy_file_type);
                    return (
                      <tr
                        key={row.key}
                        onClick={() => setSelectedItem(row.representative)}
                        className="cursor-pointer border-b transition hover:bg-white/5"
                        style={{ borderColor: LEGACY_COLORS.border }}
                      >
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <span
                              className="rounded-full px-2.5 py-1 text-[11px] font-bold"
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
                            <span
                              className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                              style={{ background: badge.bg, color: badge.color }}
                            >
                              {badge.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-sm font-semibold">{row.representative.item_name}</div>
                          <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                            {row.representative.item_code}
                            {grouped && row.count > 1 ? ` · ${row.count}개 품목 묶음` : ""}
                            {normalizeModel(row.representative.legacy_model) !== "공용"
                              ? ` · ${normalizeModel(row.representative.legacy_model)}`
                              : ""}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                          {row.representative.legacy_part || row.representative.location || "-"}
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-base font-black" style={{ color: stockState.color }}>
                          {formatNumber(row.quantity)}
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                          {row.representative.min_stock != null ? formatNumber(row.representative.min_stock) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-16 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                        조건에 맞는 품목이 없습니다.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <DesktopRightPanel
        title={selectedItem ? selectedItem.item_name : "품목 상세"}
        subtitle={
          selectedItem
            ? `${selectedItem.item_code} · ${selectedItem.legacy_part || "미지정"} · ${normalizeModel(selectedItem.legacy_model)}`
            : "왼쪽 목록에서 품목을 선택하면 현재고, 메타데이터, 최근 이력과 재고 처리 기능이 표시됩니다."
        }
      >
        {selectedItem ? (
          <div className="space-y-4">
            <section className="rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              <div className="mb-3 flex items-center gap-2">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-2xl"
                  style={{ background: "rgba(79,142,247,.16)", color: LEGACY_COLORS.blue }}
                >
                  <Boxes className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold">{selectedItem.item_name}</div>
                  <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                    {selectedItem.spec || "사양 미입력"}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["현재고", `${formatNumber(selectedItem.quantity)} ${selectedItem.unit}`],
                  ["바코드", selectedItem.barcode || "-"],
                  ["공급처", selectedItem.supplier || "-"],
                  ["안전재고", selectedItem.min_stock != null ? formatNumber(selectedItem.min_stock) : "-"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl px-3 py-3" style={{ background: LEGACY_COLORS.s1 }}>
                    <div className="mb-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                      {label}
                    </div>
                    <div className="text-sm font-semibold">{value}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                재고 처리
              </div>
              <div className="mb-3 grid grid-cols-3 gap-2">
                {[
                  ["ADJUST", "조정"],
                  ["RECEIVE", "입고"],
                  ["SHIP", "출고"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setAction(id as DesktopInventoryAction);
                      setQuantity(id === "ADJUST" ? String(Number(selectedItem.quantity)) : "1");
                    }}
                    className="rounded-2xl px-3 py-2 text-sm font-semibold"
                    style={{
                      background: action === id ? LEGACY_COLORS.blue : LEGACY_COLORS.s1,
                      color: action === id ? "#fff" : LEGACY_COLORS.muted2,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mb-3">
                <div className="mb-2 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {action === "ADJUST" ? "최종 수량" : "처리 수량"}
                </div>
                <input
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-2xl border px-4 py-3 text-center font-mono text-xl font-black outline-none"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
              </div>

              <div className="mb-3 grid grid-cols-4 gap-2">
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
                    className="rounded-2xl px-3 py-2 text-sm font-bold"
                    style={{
                      background: delta < 0 ? "rgba(242,95,92,.14)" : "rgba(31,209,122,.14)",
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
                placeholder="조정 사유 또는 메모를 입력하세요."
                className="min-h-[96px] w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />

              {error ? (
                <div className="mt-3 rounded-2xl border px-3 py-2 text-sm" style={{ background: "rgba(242,95,92,.12)", borderColor: "rgba(242,95,92,.25)", color: LEGACY_COLORS.red }}>
                  {error}
                </div>
              ) : null}

              <button
                onClick={() => void submitInventoryAction()}
                disabled={saving}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold disabled:opacity-50"
                style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PackageSearch className="h-4 w-4" />}
                {saving ? "처리 중..." : "재고 반영"}
              </button>
            </section>

            <section className="rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                최근 이력 10건
              </div>
              <div className="space-y-2">
                {itemLogs.length === 0 ? (
                  <div className="rounded-2xl px-3 py-4 text-sm" style={{ background: LEGACY_COLORS.s1, color: LEGACY_COLORS.muted2 }}>
                    최근 거래 이력이 없습니다.
                  </div>
                ) : (
                  itemLogs.map((log) => (
                    <div key={log.log_id} className="rounded-2xl px-3 py-3" style={{ background: LEGACY_COLORS.s1 }}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span
                          className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                          style={{ background: "rgba(79,142,247,.14)", color: transactionColor(log.transaction_type) }}
                        >
                          {transactionLabel(log.transaction_type)}
                        </span>
                        <span className="font-mono text-sm font-bold" style={{ color: transactionColor(log.transaction_type) }}>
                          {log.quantity_change >= 0 ? "+" : ""}
                          {formatNumber(log.quantity_change)}
                        </span>
                      </div>
                      <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                        {new Date(log.created_at).toLocaleString("ko-KR")}
                      </div>
                      {log.produced_by ? (
                        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                          담당: {log.produced_by}
                        </div>
                      ) : null}
                      {log.notes ? <div className="mt-1 text-sm">{log.notes}</div> : null}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        ) : (
          <div className="rounded-3xl border px-4 py-5 text-sm leading-6" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
            품목을 선택하면 현재고, 공급처, 바코드, 안전재고와 함께 재고 조정/입고/출고 작업을 즉시 처리할 수 있습니다.
          </div>
        )}
      </DesktopRightPanel>
    </div>
  );
}
