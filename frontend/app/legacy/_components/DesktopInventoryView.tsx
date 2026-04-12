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
    <section
      className="rounded-3xl border p-4"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
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
      onStatusChange(`재고 ${nextItems.length}건을 불러왔습니다.`);
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

  const numericQty = Number(quantity || 0);
  const expectedQuantity =
    selectedItem && !Number.isNaN(numericQty)
      ? action === "ADJUST"
        ? numericQty
        : action === "RECEIVE"
          ? Number(selectedItem.quantity) + numericQty
          : Number(selectedItem.quantity) - numericQty
      : null;

  async function submitInventoryAction() {
    if (!selectedItem) return;
    if (Number.isNaN(numericQty) || numericQty < 0) {
      setError("수량을 다시 확인해 주세요.");
      return;
    }
    if (action !== "ADJUST" && numericQty <= 0) {
      setError("입고와 출고 수량은 1 이상이어야 합니다.");
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
      onStatusChange(`${selectedItem.item_name} 재고 처리를 완료했습니다.`);
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
          <PanelCard title="파일 구분">
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
              className="w-full rounded-2xl border px-3 py-2 text-xs font-semibold"
              style={{
                background: grouped ? "rgba(244,185,66,.18)" : LEGACY_COLORS.s1,
                borderColor: grouped ? LEGACY_COLORS.yellow : LEGACY_COLORS.border,
                color: grouped ? LEGACY_COLORS.yellow : LEGACY_COLORS.muted2,
              }}
            >
              {grouped ? "묶음 보기 켜짐" : "묶음 보기"}
            </button>
          </PanelCard>

          <PanelCard title="요약">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border p-3" style={{ borderColor: LEGACY_COLORS.border }}>
                <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>품목 수</div>
                <div className="mt-1 text-2xl font-black">{formatNumber(rows.length)}</div>
              </div>
              <div className="rounded-2xl border p-3" style={{ borderColor: LEGACY_COLORS.border }}>
                <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>총 재고</div>
                <div className="mt-1 text-2xl font-black">{formatNumber(summary.totalQuantity)}</div>
              </div>
              <div className="rounded-2xl border p-3" style={{ borderColor: LEGACY_COLORS.border }}>
                <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>부족</div>
                <div className="mt-1 text-2xl font-black" style={{ color: LEGACY_COLORS.yellow }}>{formatNumber(summary.lowCount)}</div>
              </div>
              <div className="rounded-2xl border p-3" style={{ borderColor: LEGACY_COLORS.border }}>
                <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>품절</div>
                <div className="mt-1 text-2xl font-black" style={{ color: LEGACY_COLORS.red }}>{formatNumber(summary.zeroCount)}</div>
              </div>
            </div>
          </PanelCard>
        </div>

        <div className="min-h-0 overflow-hidden rounded-[28px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
          <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl p-2" style={{ background: "rgba(79,142,247,.15)", color: LEGACY_COLORS.blue }}>
                <Boxes size={18} />
              </div>
              <div>
                <div className="text-lg font-black">재고 현황</div>
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  상태, 모델, 파트 기준으로 실시간 필터링됩니다.
                </div>
              </div>
            </div>
            <button
              onClick={() => void loadItems()}
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold"
              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
            >
              <RefreshCw size={14} />
              새로고침
            </button>
          </div>

          {error ? (
            <div className="p-8 text-sm" style={{ color: LEGACY_COLORS.red }}>{error}</div>
          ) : loading ? (
            <div className="p-8 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>재고 데이터를 불러오는 중입니다...</div>
          ) : (
            <div className="min-h-0 overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10">
                  <tr style={{ background: LEGACY_COLORS.s2 }}>
                    {["상태", "품목명", "코드", "위치", "현재고", "안전재고", "모델/파트"].map((head) => (
                      <th
                        key={head}
                        className="border-b px-4 py-3 text-left text-[11px] font-bold"
                        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const item = row.representative;
                    const stock = getStockState(row.quantity, item.min_stock == null ? null : Number(item.min_stock));
                    const badge = fileTypeBadge(item.legacy_file_type);
                    const selected = selectedItem?.item_id === item.item_id;

                    return (
                      <tr
                        key={row.key}
                        onClick={() => setSelectedItem(item)}
                        className="cursor-pointer"
                        style={{ background: selected ? "rgba(79,142,247,.08)" : "transparent" }}
                      >
                        <td className="border-b px-4 py-3 align-top" style={{ borderColor: LEGACY_COLORS.border }}>
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex w-fit rounded-full px-2 py-1 text-[10px] font-bold" style={{ color: stock.color, background: `${stock.color}22` }}>
                              {stock.label}
                            </span>
                            <span className="inline-flex w-fit rounded-full px-2 py-1 text-[10px] font-bold" style={{ color: badge.color, background: badge.bg }}>
                              {badge.label}
                            </span>
                          </div>
                        </td>
                        <td className="border-b px-4 py-3 align-top" style={{ borderColor: LEGACY_COLORS.border }}>
                          <div className="font-semibold">{item.item_name}</div>
                          {row.count > 1 ? (
                            <div className="mt-1 text-[11px]" style={{ color: LEGACY_COLORS.cyan }}>
                              동일 품목 {row.count}건 묶음
                            </div>
                          ) : null}
                        </td>
                        <td className="border-b px-4 py-3 align-top font-mono text-[12px]" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                          {item.item_code}
                        </td>
                        <td className="border-b px-4 py-3 align-top" style={{ borderColor: LEGACY_COLORS.border }}>
                          {item.location ?? "-"}
                        </td>
                        <td className="border-b px-4 py-3 align-top text-right font-mono text-[13px] font-bold" style={{ borderColor: LEGACY_COLORS.border }}>
                          {formatNumber(row.quantity)}
                        </td>
                        <td className="border-b px-4 py-3 align-top text-right font-mono text-[13px]" style={{ borderColor: LEGACY_COLORS.border }}>
                          {item.min_stock == null ? "-" : formatNumber(item.min_stock)}
                        </td>
                        <td className="border-b px-4 py-3 align-top text-[12px]" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                          {normalizeModel(item.legacy_model)} / {item.legacy_part ?? "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <DesktopRightPanel
        title={selectedItem ? selectedItem.item_name : "품목을 선택해 주세요"}
        subtitle={
          selectedItem
            ? `${selectedItem.item_code} / ${selectedItem.location ?? "위치 미지정"} / 현재고 ${formatNumber(selectedItem.quantity)}`
            : "가운데 표에서 품목을 선택하면 상세 정보와 재고 처리를 바로 할 수 있습니다."
        }
      >
        {!selectedItem ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-3xl p-4" style={{ background: "rgba(79,142,247,.12)", color: LEGACY_COLORS.blue }}>
              <PackageSearch size={26} />
            </div>
            <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
              재고를 확인할 품목을 선택해 주세요.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-3xl border p-4" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                현재 선택
              </div>
              <div className="space-y-2 text-sm">
                <div>품목명: <span className="font-semibold">{selectedItem.item_name}</span></div>
                <div>품목코드: <span className="font-mono">{selectedItem.item_code}</span></div>
                <div>현재고: <span className="font-mono">{formatNumber(selectedItem.quantity)}</span></div>
                <div>안전재고: <span className="font-mono">{selectedItem.min_stock == null ? "-" : formatNumber(selectedItem.min_stock)}</span></div>
                <div>위치: {selectedItem.location ?? "-"}</div>
                <div>모델/파트: {normalizeModel(selectedItem.legacy_model)} / {selectedItem.legacy_part ?? "-"}</div>
              </div>
            </section>

            <section className="rounded-3xl border p-4" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                처리 유형
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["ADJUST", "조정"],
                  ["RECEIVE", "입고"],
                  ["SHIP", "출고"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setAction(value as DesktopInventoryAction)}
                    className="rounded-2xl border px-3 py-2 text-xs font-semibold"
                    style={{
                      borderColor: action === value ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                      background: action === value ? "rgba(79,142,247,.14)" : LEGACY_COLORS.s1,
                      color: action === value ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-4 space-y-3">
                <input
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                  style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}
                  placeholder={action === "ADJUST" ? "바꿀 현재고 수량" : "처리 수량"}
                />
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="min-h-[88px] w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                  style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}
                  placeholder="처리 사유 또는 메모"
                />
              </div>
            </section>

            <section className="rounded-3xl border p-4" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                실행 요약
              </div>
              <div className="space-y-2 text-sm">
                <div>처리 유형: {action === "ADJUST" ? "조정" : action === "RECEIVE" ? "입고" : "출고"}</div>
                <div>변경 수량: <span className="font-mono">{formatNumber(quantity)}</span></div>
                <div>처리 후 예상 재고: <span className="font-mono">{expectedQuantity == null ? "-" : formatNumber(expectedQuantity)}</span></div>
              </div>
              <button
                onClick={() => void submitInventoryAction()}
                disabled={saving}
                className="mt-4 w-full rounded-2xl px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                style={{
                  background:
                    action === "SHIP"
                      ? LEGACY_COLORS.red
                      : action === "RECEIVE"
                        ? LEGACY_COLORS.green
                        : LEGACY_COLORS.blue,
                }}
              >
                {saving ? "처리 중..." : action === "SHIP" ? "출고 실행" : action === "RECEIVE" ? "입고 실행" : "재고 조정 적용"}
              </button>
            </section>

            <section className="rounded-3xl border p-4" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                최근 이력
              </div>
              <div className="space-y-2">
                {itemLogs.length === 0 ? (
                  <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>최근 이력이 없습니다.</div>
                ) : (
                  itemLogs.map((log) => (
                    <div key={log.log_id} className="rounded-2xl border p-3" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold" style={{ color: transactionColor(log.transaction_type) }}>
                          {transactionLabel(log.transaction_type)}
                        </span>
                        <span className="font-mono text-xs">{formatNumber(log.quantity_change)}</span>
                      </div>
                      <div className="mt-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                        {log.notes || "메모 없음"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </DesktopRightPanel>
    </div>
  );
}
