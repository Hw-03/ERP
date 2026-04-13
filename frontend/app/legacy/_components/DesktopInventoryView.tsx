"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Activity, PackageSearch, Search, TrendingUp } from "lucide-react";
import { api, type Item, type TransactionLog } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import {
  LEGACY_COLORS,
  LEGACY_FILE_TYPES,
  LEGACY_MODELS,
  fileTypeBadge,
  formatNumber,
  getStockState,
  normalizeModel,
  transactionColor,
  transactionLabel,
} from "./legacyUi";

type DesktopInventoryAction = "ADJUST" | "RECEIVE" | "SHIP";
type KpiFilter = "ALL" | "NORMAL" | "LOW" | "ZERO";
type CapacityMode = "FAST" | "MAX" | null;

const KPI_OPTIONS: { label: string; value: KpiFilter }[] = [
  { label: "전체", value: "ALL" },
  { label: "정상", value: "NORMAL" },
  { label: "부족", value: "LOW" },
  { label: "품절", value: "ZERO" },
];

function getMinStock(item: Item) {
  return item.min_stock == null ? 10 : Number(item.min_stock);
}

function matchesSearch(item: Item, keyword: string) {
  if (!keyword) return true;
  const haystack = [
    item.item_code,
    item.item_name,
    item.spec ?? "",
    item.location ?? "",
    item.supplier ?? "",
    item.legacy_model ?? "",
    item.barcode ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(keyword);
}

function matchesKpi(item: Item, kpi: KpiFilter) {
  const qty = Number(item.quantity);
  const min = getMinStock(item);
  if (kpi === "NORMAL") return qty > 0 && qty >= min;
  if (kpi === "LOW") return qty > 0 && qty < min;
  if (kpi === "ZERO") return qty <= 0;
  return true;
}

function FilterChip({
  active,
  color,
  label,
  onClick,
}: {
  active: boolean;
  color: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
      style={{
        background: active ? color : LEGACY_COLORS.s1,
        borderColor: active ? color : LEGACY_COLORS.border,
        color: active ? "#fff" : LEGACY_COLORS.muted2,
      }}
    >
      {label}
    </button>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative overflow-hidden rounded-2xl border px-4 py-4 text-left transition hover:opacity-95"
      style={{
        background: active ? `${color}1a` : LEGACY_COLORS.s1,
        borderColor: active ? color : LEGACY_COLORS.border,
      }}
    >
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </div>
      <div className="font-mono text-[30px] font-black leading-none" style={{ color }}>
        {formatNumber(value)}
      </div>
      <div className="mt-2 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
        {hint}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: color }} />
    </button>
  );
}

function InsightCard({
  icon,
  title,
  description,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-3xl border px-5 py-4 text-left transition hover:opacity-95"
      style={{ borderColor: `${color}44`, background: "rgba(7,12,28,.88)" }}
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold" style={{ color }}>
        {icon}
        {title}
      </div>
      <div className="text-sm font-bold">모델별 생산 가능 수량 보기</div>
      <div className="mt-1 text-xs leading-5" style={{ color: LEGACY_COLORS.muted2 }}>
        {description}
      </div>
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
  const [model, setModel] = useState("전체");
  const [kpi, setKpi] = useState<KpiFilter>("ALL");
  const [localSearch, setLocalSearch] = useState("");
  const [action, setAction] = useState<DesktopInventoryAction>("ADJUST");
  const [quantity, setQuantity] = useState("0");
  const [notes, setNotes] = useState("");
  const [capacityMode, setCapacityMode] = useState<CapacityMode>(null);

  const deferredLocalSearch = useDeferredValue(localSearch.trim().toLowerCase());

  async function loadItems() {
    try {
      setLoading(true);
      setError(null);

      const nextItems = await api.getItems({
        limit: 2000,
        search: globalSearch.trim() || undefined,
        legacyFileType: fileType === "전체" ? undefined : fileType,
        legacyModel: model === "전체" ? undefined : model,
      });

      setItems(nextItems);
      onStatusChange(`재고 ${nextItems.length}건을 불러왔습니다.`);
      setSelectedItem((current) => (current ? nextItems.find((item) => item.item_id === current.item_id) ?? null : null));
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
  }, [globalSearch, fileType, model]);

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

  const scopedItems = useMemo(() => items.filter((item) => matchesSearch(item, deferredLocalSearch)), [items, deferredLocalSearch]);
  const filteredItems = useMemo(() => scopedItems.filter((item) => matchesKpi(item, kpi)), [scopedItems, kpi]);

  const summary = useMemo(() => {
    const totalQuantity = scopedItems.reduce((acc, item) => acc + Number(item.quantity), 0);
    const normalCount = scopedItems.filter((item) => {
      const qty = Number(item.quantity);
      return qty > 0 && qty >= getMinStock(item);
    }).length;
    const lowCount = scopedItems.filter((item) => {
      const qty = Number(item.quantity);
      return qty > 0 && qty < getMinStock(item);
    }).length;
    const zeroCount = scopedItems.filter((item) => Number(item.quantity) <= 0).length;

    return {
      totalCount: scopedItems.length,
      totalQuantity,
      normalCount,
      lowCount,
      zeroCount,
    };
  }, [scopedItems]);

  const capacityRows = useMemo(() => {
    const models = Array.from(
      new Set(
        scopedItems
          .map((item) => normalizeModel(item.legacy_model))
          .filter((entry) => entry && entry !== "전체"),
      ),
    );

    const fallbackModels = LEGACY_MODELS.filter((entry) => entry !== "전체");
    return Array.from(new Set([...models, ...fallbackModels])).map((entry) => ({
      model: entry,
      fastTrack: 0,
      maxTrack: 0,
      note: "BOM과 완제품 데이터가 준비되면 실제 수량 계산으로 교체됩니다.",
    }));
  }, [scopedItems]);

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
    <div className="flex min-h-0 flex-1 gap-5 px-6 py-6">
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-[28px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        <div className="border-b px-5 py-4" style={{ borderColor: LEGACY_COLORS.border, background: "rgba(8,10,16,.74)" }}>
          <div className="mb-3 flex items-center gap-2 rounded-2xl border px-4 py-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <Search size={15} style={{ color: LEGACY_COLORS.blue }} />
            <input
              value={localSearch}
              onChange={(event) => setLocalSearch(event.target.value)}
              placeholder="품명, 코드, 바코드, 모델 검색"
              className="w-full bg-transparent text-sm outline-none"
              style={{ color: LEGACY_COLORS.text }}
            />
            {localSearch ? (
              <button onClick={() => setLocalSearch("")} className="text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                지우기
              </button>
            ) : null}
          </div>

          <div className="mb-3 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            검색 기준 {formatNumber(scopedItems.length)}개 / 현재 목록 {formatNumber(filteredItems.length)}개
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {LEGACY_FILE_TYPES.map((entry) => (
              <FilterChip key={entry} active={fileType === entry} color={LEGACY_COLORS.blue} label={entry} onClick={() => setFileType(entry)} />
            ))}
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {LEGACY_MODELS.map((entry) => (
              <FilterChip key={entry} active={model === entry} color={LEGACY_COLORS.cyan} label={entry} onClick={() => setModel(entry)} />
            ))}
          </div>

          <div className="grid gap-3 xl:grid-cols-4">
            <SummaryCard label="전체" value={summary.totalCount} hint={`총 재고 ${formatNumber(summary.totalQuantity)}`} color={LEGACY_COLORS.blue} active={kpi === "ALL"} onClick={() => setKpi("ALL")} />
            <SummaryCard label="정상" value={summary.normalCount} hint="운영 가능 품목" color={LEGACY_COLORS.green} active={kpi === "NORMAL"} onClick={() => setKpi("NORMAL")} />
            <SummaryCard label="부족" value={summary.lowCount} hint="안전재고 이하" color={LEGACY_COLORS.yellow} active={kpi === "LOW"} onClick={() => setKpi("LOW")} />
            <SummaryCard label="품절" value={summary.zeroCount} hint="재고 0 품목" color={LEGACY_COLORS.red} active={kpi === "ZERO"} onClick={() => setKpi("ZERO")} />
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            <InsightCard
              icon={<Activity size={14} />}
              title="즉시생산"
              description="클릭하면 모델별 즉시 생산 가능 수량 목록을 표시합니다."
              color={LEGACY_COLORS.blue}
              onClick={() => setCapacityMode("FAST")}
            />
            <InsightCard
              icon={<TrendingUp size={14} />}
              title="최대생산"
              description="클릭하면 모델별 최대 생산 가능 수량 목록을 표시합니다."
              color={LEGACY_COLORS.cyan}
              onClick={() => setCapacityMode("MAX")}
            />
          </div>
        </div>

        {error ? (
          <div className="p-8 text-sm" style={{ color: LEGACY_COLORS.red }}>
            {error}
          </div>
        ) : loading ? (
          <div className="p-8 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            재고 데이터를 불러오는 중입니다...
          </div>
        ) : (
          <div className="min-h-0 overflow-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: LEGACY_COLORS.s2 }}>
                  {["상태", "품목명", "코드", "위치", "현재고", "안전재고", "모델"].map((head) => (
                    <th key={head} className="border-b px-4 py-3 text-left text-[11px] font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const stock = getStockState(Number(item.quantity), item.min_stock == null ? null : Number(item.min_stock));
                  const badge = fileTypeBadge(item.legacy_file_type);
                  const selected = selectedItem?.item_id === item.item_id;

                  return (
                    <tr
                      key={item.item_id}
                      onClick={() => setSelectedItem((current) => (current?.item_id === item.item_id ? null : item))}
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
                        <div className="mt-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                          {item.spec || "-"}
                        </div>
                      </td>
                      <td className="border-b px-4 py-3 align-top font-mono text-[12px]" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                        {item.item_code}
                      </td>
                      <td className="border-b px-4 py-3 align-top" style={{ borderColor: LEGACY_COLORS.border }}>
                        {item.location ?? "-"}
                      </td>
                      <td className="border-b px-4 py-3 align-top text-right font-mono text-[13px] font-bold" style={{ borderColor: LEGACY_COLORS.border }}>
                        {formatNumber(item.quantity)}
                      </td>
                      <td className="border-b px-4 py-3 align-top text-right font-mono text-[13px]" style={{ borderColor: LEGACY_COLORS.border }}>
                        {item.min_stock == null ? "-" : formatNumber(item.min_stock)}
                      </td>
                      <td className="border-b px-4 py-3 align-top text-[12px]" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                        {normalizeModel(item.legacy_model)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DesktopRightPanel
        title={selectedItem ? selectedItem.item_name : "품목을 선택해 주세요"}
        subtitle={
          selectedItem
            ? `${selectedItem.item_code} / ${selectedItem.location ?? "위치 미지정"} / 현재고 ${formatNumber(selectedItem.quantity)}`
            : "가운데 목록에서 품목을 선택하면 상세 정보와 재고 처리 내용을 여기에서 바로 확인할 수 있습니다."
        }
      >
        {!selectedItem ? (
          <div className="flex min-h-[560px] h-full flex-col items-center justify-center gap-4 rounded-[28px] border p-8 text-center" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <div className="rounded-3xl p-5" style={{ background: "rgba(79,142,247,.12)", color: LEGACY_COLORS.blue }}>
              <PackageSearch size={26} />
            </div>
            <div className="text-base font-bold">품목을 선택해 주세요</div>
            <div className="max-w-[300px] text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
              재고를 확인할 품목을 고르면 같은 위치에서 상세 정보와 처리 버튼이 바로 바뀝니다.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-[28px] border p-5" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                현재 선택
              </div>
              <div className="space-y-2 text-sm">
                <div>품목명: <span className="font-semibold">{selectedItem.item_name}</span></div>
                <div>품목코드: <span className="font-mono">{selectedItem.item_code}</span></div>
                <div>현재고: <span className="font-mono">{formatNumber(selectedItem.quantity)}</span></div>
                <div>안전재고: <span className="font-mono">{selectedItem.min_stock == null ? "-" : formatNumber(selectedItem.min_stock)}</span></div>
                <div>위치: {selectedItem.location ?? "-"}</div>
                <div>모델: {normalizeModel(selectedItem.legacy_model)}</div>
              </div>
            </section>

            <section className="rounded-[28px] border p-5" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
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
                  placeholder={action === "ADJUST" ? "변경 후 현재고 수량" : "처리 수량"}
                />
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="min-h-[100px] w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                  style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}
                  placeholder="처리 사유 또는 메모"
                />
              </div>
            </section>

            <section className="rounded-[28px] border p-5" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
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
                  background: action === "SHIP" ? LEGACY_COLORS.red : action === "RECEIVE" ? LEGACY_COLORS.green : LEGACY_COLORS.blue,
                }}
              >
                {saving ? "처리 중..." : action === "SHIP" ? "출고 실행" : action === "RECEIVE" ? "입고 실행" : "재고 조정 적용"}
              </button>
            </section>

            <section className="rounded-[28px] border p-5" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                최근 이력
              </div>
              <div className="space-y-2">
                {itemLogs.length === 0 ? (
                  <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                    최근 이력이 없습니다.
                  </div>
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

      {capacityMode ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-6" onClick={() => setCapacityMode(null)}>
          <div className="w-full max-w-[480px] rounded-[32px] border p-8 text-center" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 inline-flex rounded-2xl px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ background: capacityMode === "FAST" ? "rgba(79,142,247,.14)" : "rgba(6,182,212,.14)", color: capacityMode === "FAST" ? LEGACY_COLORS.blue : LEGACY_COLORS.cyan }}>
              {capacityMode === "FAST" ? "즉시생산" : "최대생산"}
            </div>
            <div className="mt-2 text-2xl font-black">BOM 세팅 후 표시</div>
            <div className="mt-3 text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
              제품 BOM과 완제품 데이터가 등록되면<br />모델별 생산 가능 수량이 이 자리에 표시됩니다.
            </div>
            <button onClick={() => setCapacityMode(null)} className="mt-6 rounded-2xl border px-6 py-2.5 text-sm font-semibold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
