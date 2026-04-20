"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Activity, PackageSearch, Search, Sparkles } from "lucide-react";
import { api, type Item, type TransactionLog } from "@/lib/api";
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
      type="button"
      onClick={onClick}
      className="rounded-[14px] border px-4 py-2 text-sm font-semibold transition"
      style={{
        background: active ? color : LEGACY_COLORS.s2,
        borderColor: active ? color : LEGACY_COLORS.border,
        color: active ? "#fff" : LEGACY_COLORS.textSoft,
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
      type="button"
      onClick={onClick}
      className="rounded-[18px] border px-5 py-4 text-left transition"
      style={{
        background: LEGACY_COLORS.s2,
        borderColor: active ? color : LEGACY_COLORS.border,
        boxShadow: active ? `inset 0 -3px 0 0 ${color}` : "none",
      }}
    >
      <div className="mb-2 text-sm" style={{ color: LEGACY_COLORS.textSoft }}>
        {label}
      </div>
      <div
        className="font-mono text-[36px] font-black leading-none"
        style={{ color: active ? color : LEGACY_COLORS.text }}
      >
        {formatNumber(value)}
      </div>
      <div className="mt-2 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
        {hint}
      </div>
    </button>
  );
}

function InsightCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[18px] border px-5 py-5 text-left transition"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="mb-2 flex items-center gap-2 text-sm" style={{ color: LEGACY_COLORS.cyan }}>
        <Sparkles size={16} />
        <span>{title}</span>
      </div>
      <div className="text-[18px] font-semibold leading-tight" style={{ color: LEGACY_COLORS.text }}>
        모델별 생산 가능 수량 보기
      </div>
      <div className="mt-2 text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
        {description}
      </div>
    </button>
  );
}

function SideCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="pb-8">
      <div className="mb-4 h-12 w-12 rounded-[16px] bg-white/95" />
      <h3 className="text-[18px] font-bold" style={{ color: LEGACY_COLORS.text }}>
        {title}
      </h3>
      <p className="mt-3 text-sm leading-8" style={{ color: LEGACY_COLORS.textSoft }}>
        {description}
      </p>
      {children ? <div className="mt-5">{children}</div> : null}
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
  const [fileType, setFileType] = useState<(typeof LEGACY_FILE_TYPES)[number]>(LEGACY_FILE_TYPES[0]);
  const [model, setModel] = useState<(typeof LEGACY_MODELS)[number]>(LEGACY_MODELS[0]);
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
        legacyFileType: fileType === LEGACY_FILE_TYPES[0] ? undefined : fileType,
        legacyModel: model === LEGACY_MODELS[0] ? undefined : model,
      });

      setItems(nextItems);
      onStatusChange(`재고 ${nextItems.length}건을 불러옵니다.`);
      setSelectedItem((current) =>
        current ? nextItems.find((item) => item.item_id === current.item_id) ?? null : null,
      );
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

  const scopedItems = useMemo(
    () => items.filter((item) => matchesSearch(item, deferredLocalSearch)),
    [items, deferredLocalSearch],
  );

  const filteredItems = useMemo(
    () => scopedItems.filter((item) => matchesKpi(item, kpi)),
    [scopedItems, kpi],
  );

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

    return { totalCount: scopedItems.length, totalQuantity, normalCount, lowCount, zeroCount };
  }, [scopedItems]);

  const capacityRows = useMemo(() => {
    const defaultModel = LEGACY_MODELS[0];
    const models = Array.from(
      new Set(
        scopedItems
          .map((item) => normalizeModel(item.legacy_model))
          .filter((entry) => entry && entry !== defaultModel),
      ),
    );
    const fallbackModels = LEGACY_MODELS.filter((entry) => entry !== defaultModel);

    return Array.from(new Set([...models, ...fallbackModels])).map((entry) => ({
      model: entry,
      fastTrack: 0,
      maxTrack: 0,
      note: "BOM과 공정 데이터가 연결되면 실제 생산 가능 수량 계산으로 대체됩니다.",
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
    <div className="flex h-[calc(100vh-108px)] min-h-0 overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto min-w-0 max-w-[1040px]">
          <div className="mb-6 flex items-center gap-2 text-sm" style={{ color: LEGACY_COLORS.textSoft }}>
            <div
              className="flex h-5 w-5 items-center justify-center rounded-full text-[11px]"
              style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}
            >
              i
            </div>
            <span>재고 {summary.totalCount}건을 불러옵니다.</span>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-4">
            <SummaryCard
              label="전체"
              value={summary.totalCount}
              hint={`총 재고 ${formatNumber(summary.totalQuantity)}`}
              color={LEGACY_COLORS.blue}
              active={kpi === "ALL"}
              onClick={() => setKpi("ALL")}
            />
            <SummaryCard
              label="정상"
              value={summary.normalCount}
              hint="운영 가능 품목"
              color={LEGACY_COLORS.green}
              active={kpi === "NORMAL"}
              onClick={() => setKpi("NORMAL")}
            />
            <SummaryCard
              label="경고"
              value={summary.lowCount}
              hint="안전재고 이하"
              color={LEGACY_COLORS.yellow}
              active={kpi === "LOW"}
              onClick={() => setKpi("LOW")}
            />
            <SummaryCard
              label="품절"
              value={summary.zeroCount}
              hint="재고 0 품목"
              color={LEGACY_COLORS.red}
              active={kpi === "ZERO"}
              onClick={() => setKpi("ZERO")}
            />
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {LEGACY_FILE_TYPES.map((entry) => (
              <FilterChip
                key={entry}
                active={fileType === entry}
                color={LEGACY_COLORS.blue}
                label={entry}
                onClick={() => setFileType(entry)}
              />
            ))}
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            {LEGACY_MODELS.map((entry) => (
              <FilterChip
                key={entry}
                active={model === entry}
                color={LEGACY_COLORS.cyan}
                label={entry}
                onClick={() => setModel(entry)}
              />
            ))}
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <InsightCard
              title="즉시생산"
              description="출하전에 드론 즉시 상대 가능 수량을 조회합니다."
              onClick={() => setCapacityMode("FAST")}
            />
            <InsightCard
              title="최대생산"
              description="출하전에 드론 최대 생산 가능 수량을 조회합니다."
              onClick={() => setCapacityMode("MAX")}
            />
          </div>

          <div className="mb-4">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
                size={20}
                style={{ color: LEGACY_COLORS.muted2 }}
              />
              <input
                value={localSearch}
                onChange={(event) => setLocalSearch(event.target.value)}
                placeholder="품명, 코드, 브랜드, 모델 검색"
                className="w-full rounded-[14px] border px-12 py-3.5 text-base outline-none"
                style={{
                  background: LEGACY_COLORS.s2,
                  borderColor: LEGACY_COLORS.border,
                  color: LEGACY_COLORS.text,
                }}
              />
            </div>
            <div className="mt-3 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
              정렬 가능 {formatNumber(scopedItems.length)}개 / 결과 총 {formatNumber(filteredItems.length)}개
            </div>
          </div>

          {error ? (
            <div
              className="mb-4 rounded-[16px] border px-4 py-4 text-sm"
              style={{
                background: LEGACY_COLORS.redSoft,
                borderColor: LEGACY_COLORS.red,
                color: LEGACY_COLORS.text,
              }}
            >
              {error}
            </div>
          ) : null}

          <div
            className="overflow-hidden rounded-[20px] border"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            {loading ? (
              <div className="px-6 py-10 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                재고 데이터를 불러오는 중입니다...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-10 text-center">
                <div
                  className="mb-4 rounded-[18px] p-4"
                  style={{ background: LEGACY_COLORS.blueSoft, color: LEGACY_COLORS.blue }}
                >
                  <PackageSearch size={28} />
                </div>
                <div className="text-lg font-bold">조건에 맞는 품목이 없습니다</div>
                <div className="mt-2 max-w-[320px] text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
                  검색어나 필터 조건을 조정한 뒤 다시 확인해 주세요.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                      {["설명", "품목명", "코드", "단위", "현재고", "안전재고", "모델"].map((head) => (
                        <th
                          key={head}
                          className="px-4 py-4 text-left text-[13px] font-semibold"
                          style={{ color: LEGACY_COLORS.textSoft }}
                        >
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => {
                      const stock = getStockState(
                        Number(item.quantity),
                        item.min_stock == null ? null : Number(item.min_stock),
                      );
                      const badge = fileTypeBadge(item.legacy_file_type);
                      const selected = selectedItem?.item_id === item.item_id;

                      return (
                        <tr
                          key={item.item_id}
                          onClick={() =>
                            setSelectedItem((current) =>
                              current?.item_id === item.item_id ? null : item,
                            )
                          }
                          className="cursor-pointer transition"
                          style={{
                            background: selected ? "rgba(37, 99, 235, 0.08)" : "transparent",
                            borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                          }}
                        >
                          <td className="px-4 py-4 align-top">
                            <div className="flex flex-wrap gap-2">
                              <span
                                className="inline-flex rounded-md px-2 py-1 text-xs font-bold"
                                style={{
                                  color: stock.color,
                                  background: `color-mix(in srgb, ${stock.color} 16%, transparent)`,
                                }}
                              >
                                {stock.label}
                              </span>
                              <span
                                className="inline-flex rounded-md px-2 py-1 text-xs font-bold"
                                style={{ color: badge.color, background: badge.bg }}
                              >
                                {badge.label}
                              </span>
                              <span
                                className="inline-flex rounded-md px-2 py-1 text-xs font-bold"
                                style={{ color: LEGACY_COLORS.textSoft, background: LEGACY_COLORS.s3 }}
                              >
                                세
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top text-[15px] font-semibold" style={{ color: LEGACY_COLORS.text }}>
                            {item.item_name}
                          </td>
                          <td className="px-4 py-4 align-top text-[15px]" style={{ color: LEGACY_COLORS.textSoft }}>
                            {item.item_code}
                          </td>
                          <td className="px-4 py-4 align-top" style={{ color: LEGACY_COLORS.textSoft }}>
                            {item.unit || "-"}
                          </td>
                          <td className="px-4 py-4 align-top text-[15px] font-semibold" style={{ color: LEGACY_COLORS.text }}>
                            {formatNumber(item.quantity)}
                          </td>
                          <td className="px-4 py-4 align-top" style={{ color: LEGACY_COLORS.textSoft }}>
                            {item.min_stock == null ? "-" : formatNumber(item.min_stock)}
                          </td>
                          <td className="px-4 py-4 align-top" style={{ color: LEGACY_COLORS.textSoft }}>
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
        </div>
      </div>

      <aside
        className="hidden h-full w-[320px] shrink-0 border-l px-6 py-6 xl:block"
        style={{ borderColor: LEGACY_COLORS.border, background: "rgba(9, 13, 24, 0.82)" }}
      >
        <SideCard
          title={selectedItem ? selectedItem.item_name : "품목을 선택해 주세요"}
          description={
            selectedItem
              ? `${selectedItem.item_code} / ${selectedItem.location ?? "위치 미지정"} / 현재고 ${formatNumber(selectedItem.quantity)}`
              : "가공과 속록에서 품목을 선택하여 실제 정보와 처리 내용을 여기에서 바로 확인합니다."
          }
        >
          {selectedItem ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div
                  className="rounded-[14px] border px-3 py-3"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                >
                  <div className="text-xs" style={{ color: LEGACY_COLORS.textSoft }}>
                    현재고
                  </div>
                  <div className="mt-1 font-mono text-lg font-bold">{formatNumber(selectedItem.quantity)}</div>
                </div>
                <div
                  className="rounded-[14px] border px-3 py-3"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                >
                  <div className="text-xs" style={{ color: LEGACY_COLORS.textSoft }}>
                    안전재고
                  </div>
                  <div className="mt-1 font-mono text-lg font-bold">
                    {selectedItem.min_stock == null ? "-" : formatNumber(selectedItem.min_stock)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  ["ADJUST", "조정"],
                  ["RECEIVE", "입고"],
                  ["SHIP", "출고"],
                ].map(([value, label]) => {
                  const active = action === value;
                  const activeColor =
                    value === "SHIP"
                      ? LEGACY_COLORS.red
                      : value === "RECEIVE"
                        ? LEGACY_COLORS.green
                        : LEGACY_COLORS.blue;

                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAction(value as DesktopInventoryAction)}
                      className="rounded-[12px] border px-3 py-2 text-xs font-semibold"
                      style={{
                        background: active ? `color-mix(in srgb, ${activeColor} 16%, transparent)` : LEGACY_COLORS.s2,
                        borderColor: active ? activeColor : LEGACY_COLORS.border,
                        color: active ? activeColor : LEGACY_COLORS.textSoft,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <input
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder={action === "ADJUST" ? "변경할 현재고 수량" : "처리 수량"}
                className="w-full rounded-[12px] border px-4 py-3 outline-none"
                style={{
                  background: LEGACY_COLORS.s2,
                  borderColor: LEGACY_COLORS.border,
                  color: LEGACY_COLORS.text,
                }}
              />
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="처리 사유 또는 메모"
                className="min-h-[88px] w-full rounded-[12px] border px-4 py-3 outline-none"
                style={{
                  background: LEGACY_COLORS.s2,
                  borderColor: LEGACY_COLORS.border,
                  color: LEGACY_COLORS.text,
                }}
              />
              <div className="text-sm" style={{ color: LEGACY_COLORS.textSoft }}>
                처리 후 예상 재고:{" "}
                <span className="font-mono font-bold">
                  {expectedQuantity == null ? "-" : formatNumber(expectedQuantity)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void submitInventoryAction()}
                disabled={saving}
                className="w-full rounded-[14px] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                style={{ background: action === "SHIP" ? LEGACY_COLORS.red : LEGACY_COLORS.blue }}
              >
                {saving ? "처리 중..." : action === "SHIP" ? "출고 실행" : action === "RECEIVE" ? "입고 실행" : "재고 조정 적용"}
              </button>
            </div>
          ) : null}
        </SideCard>

        <SideCard
          title={selectedItem ? "실시간 작업 이력" : "품목을 선택해 주세요"}
          description={
            selectedItem
              ? "최근 재고 변경 이력과 실제 정보의 차이를 여기에서 바로 비교합니다."
              : "재고를 실시간 추적해 같은 화면에서 실제 정보와 재의 변화를 비교합니다."
          }
        >
          {selectedItem ? (
            <div className="space-y-3">
              {itemLogs.length === 0 ? (
                <div
                  className="rounded-[14px] border px-4 py-4 text-sm"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.textSoft }}
                >
                  최근 이력이 없습니다.
                </div>
              ) : (
                itemLogs.map((log) => (
                  <div
                    key={log.log_id}
                    className="rounded-[14px] border px-4 py-4"
                    style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold" style={{ color: transactionColor(log.transaction_type) }}>
                        {transactionLabel(log.transaction_type)}
                      </span>
                      <span className="font-mono text-sm font-bold" style={{ color: transactionColor(log.transaction_type) }}>
                        {log.quantity_change >= 0 ? "+" : ""}
                        {formatNumber(log.quantity_change)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs leading-5" style={{ color: LEGACY_COLORS.textSoft }}>
                      {log.notes || "메모 없음"}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </SideCard>
      </aside>

      {capacityMode ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-6"
          onClick={() => setCapacityMode(null)}
        >
          <div
            className="w-full max-w-[560px] rounded-[24px] border px-8 py-8"
            style={{ background: LEGACY_COLORS.panel, borderColor: LEGACY_COLORS.borderStrong }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 text-sm font-semibold" style={{ color: LEGACY_COLORS.cyan }}>
              {capacityMode === "FAST" ? "즉시생산" : "최대생산"}
            </div>
            <div className="text-2xl font-black">모델별 생산 가능 수량</div>
            <div className="mt-3 text-sm leading-6" style={{ color: LEGACY_COLORS.textSoft }}>
              아직 BOM 연결이 완료되지 않아 수량은 0으로 표시되지만, 이 위치와 구조는 최종 생산 계산 화면의 기준이 됩니다.
            </div>

            <div className="mt-6 space-y-3">
              {capacityRows.map((row) => (
                <div
                  key={row.model}
                  className="rounded-[18px] border px-4 py-4"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold">{row.model}</div>
                      <div className="mt-1 text-xs leading-5" style={{ color: LEGACY_COLORS.textSoft }}>
                        {row.note}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-right">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: LEGACY_COLORS.muted2 }}>
                          즉시
                        </div>
                        <div className="font-mono text-xl font-black">{formatNumber(row.fastTrack)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: LEGACY_COLORS.muted2 }}>
                          최대
                        </div>
                        <div className="font-mono text-xl font-black">{formatNumber(row.maxTrack)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCapacityMode(null)}
              className="mt-6 w-full rounded-[14px] border px-4 py-3 text-sm font-semibold"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
