"use client";

import { useMemo, useState } from "react";
import { api, type Item, type ShippingComponentChangePreview, type ShippingComponentChangeResult } from "@/lib/api";

interface WorkProps {
  items: Item[];
  loading?: boolean;
  onComplete: (result: ShippingComponentChangeResult) => void;
}

interface CompleteProps {
  result: ShippingComponentChangeResult | null;
  onNew: () => void;
  onHistory: () => void;
  onWarehouse: () => void;
}

function positiveInt(value: string | number) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

const buttonBase = "rounded border px-3 py-2 text-sm font-black";

export function ItemConversionWorkView({ items, loading = false, onComplete }: WorkProps) {
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [quantity, setQuantity] = useState<number | "">(1);
  const [memo, setMemo] = useState("");
  const [preview, setPreview] = useState<ShippingComponentChangePreview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const paItems = useMemo(() => items.filter((item) => item.process_type_code === "PA" && !item.deleted_at), [items]);
  const source = paItems.find((item) => item.item_id === sourceId);
  const changeQty = quantity === "" ? 0 : positiveInt(quantity);
  const sameItem = Boolean(sourceId && targetId && sourceId === targetId);
  const sourceOver = Boolean(source && changeQty > source.quantity);
  const hasShortage = Boolean(preview?.source_shortage_quantity || preview?.lines.some((line) => line.shortage_quantity > 0));
  const canPreview = Boolean(sourceId && targetId && !sameItem && changeQty >= 1 && !sourceOver && !busy);
  const canExecute = Boolean(preview?.lines.length && !sameItem && !sourceOver && !hasShortage && !busy);

  const clearPreview = () => {
    setPreview(null);
    setConfirmOpen(false);
    setError("");
  };

  const renderSelect = (
    kind: "source" | "target",
    label: string,
    value: string,
    setValue: (value: string) => void,
    excludeId?: string,
  ) => (
    <label className="grid gap-2 rounded border bg-white p-3">
      <span className="text-sm font-black">{label}</span>
      <select
        data-testid={`item-conversion-${kind}-search`}
        value={value}
        disabled={loading}
        onChange={(event) => {
          setValue(event.target.value);
          clearPreview();
        }}
        className="h-10 rounded border px-2 text-sm font-bold"
      >
        <option value="">PA 선택</option>
        {paItems.filter((item) => item.item_id !== excludeId).map((item) => (
          <option key={item.item_id} value={item.item_id}>
            {item.mes_code ?? "-"} · {item.item_name} · 현재 {item.quantity} {item.unit}
          </option>
        ))}
      </select>
    </label>
  );

  async function loadPreview() {
    if (!canPreview) return;
    setBusy(true);
    setError("");
    try {
      setPreview(await api.getIndependentShippingComponentChangePreview({
        source_pa_item_id: sourceId,
        target_pa_item_id: targetId,
        quantity: changeQty,
      }));
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "차이를 확인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function executeChange() {
    if (!canExecute || !preview) return;
    setBusy(true);
    setError("");
    try {
      onComplete(await api.executeIndependentShippingComponentChange({
        source_pa_item_id: sourceId,
        target_pa_item_id: targetId,
        quantity: preview.quantity,
        memo: memo.trim() || null,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "품목 전환을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  const alert = sameItem
    ? "소스 PA와 대상 PA는 달라야 합니다."
    : sourceOver
      ? `소스 PA 현재 재고 ${source?.quantity ?? 0} EA 이하로 입력하세요.`
      : error;

  return (
    <section data-testid="item-conversion-work" className="grid gap-3 rounded border bg-white p-3">
      <div className="grid gap-3 xl:grid-cols-2">
        {renderSelect("source", "소스 PA", sourceId, setSourceId)}
        {renderSelect("target", "대상 PA", targetId, setTargetId, sourceId)}
      </div>
      <div className="grid gap-3 xl:grid-cols-[180px_minmax(0,1fr)_auto]">
        <label className="grid gap-2 rounded border bg-white p-3">
          <span className="text-xs font-black">전환 수량</span>
          <input
            data-testid="item-conversion-quantity"
            type="number"
            min={1}
            max={source?.quantity || undefined}
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value === "" ? "" : positiveInt(event.target.value));
              clearPreview();
            }}
            className="h-10 rounded border px-2 text-sm font-bold"
          />
        </label>
        <label className="grid gap-2 rounded border bg-white p-3">
          <span className="text-xs font-black">메모</span>
          <input
            data-testid="item-conversion-memo"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            className="h-10 rounded border px-2 text-sm font-bold"
            placeholder="선택 입력"
          />
        </label>
        <button data-testid="item-conversion-preview-button" className={`${buttonBase} self-end`} disabled={!canPreview} onClick={() => void loadPreview()}>
          {busy ? "확인 중" : "차이 확인"}
        </button>
      </div>
      {alert && <div className="rounded border px-3 py-2 text-sm font-bold text-red-700">{alert}</div>}
      <div data-testid="item-conversion-preview" className="rounded border bg-white p-3">
        {!preview ? (
          <div className="py-8 text-center text-sm font-bold">소스 PA, 대상 PA, 수량을 선택하세요.</div>
        ) : preview.lines.length === 0 ? (
          <div className="py-8 text-center text-sm font-bold">직계 BOM 차이가 없습니다.</div>
        ) : (
          <div className="grid gap-2">
            {preview.lines.map((line) => {
              const add = line.total_delta > 0;
              return (
                <div key={line.item_id} className="rounded border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black">{line.item_name}</div>
                      <div className="text-xs font-bold">
                        {line.mes_code ?? "-"} · 소스 {line.source_quantity} / 대상 {line.target_quantity} {line.unit}
                      </div>
                    </div>
                    <span className={add ? "font-black text-amber-700" : "font-black text-emerald-700"}>
                      {add ? "추가 차감" : "회수 입고"} {Math.abs(line.total_delta)} {line.unit}
                    </span>
                  </div>
                  {line.shortage_quantity > 0 && <div className="text-xs font-black text-red-700">부족 {line.shortage_quantity} {line.unit}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <button data-testid="item-conversion-execute-button" className={buttonBase} disabled={!canExecute} onClick={() => setConfirmOpen(true)}>
          품목 전환 실행
        </button>
      </div>
      {confirmOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-6">
          <div className="w-full max-w-lg rounded border bg-white p-5 shadow-xl">
            <div className="text-xl font-black">품목 전환을 확정할까요?</div>
            <div className="mt-3 grid gap-1 text-sm font-bold">
              <div>{preview.source_item_name} -{preview.quantity} EA</div>
              <div>{preview.target_item_name} +{preview.quantity} EA</div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className={buttonBase} onClick={() => setConfirmOpen(false)}>취소</button>
              <button data-testid="item-conversion-confirm-button" className={buttonBase} disabled={busy} onClick={() => void executeChange()}>확정</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function ItemConversionCompleteView({ result, onNew, onHistory, onWarehouse }: CompleteProps) {
  return (
    <section data-testid="item-conversion-complete" className="rounded border bg-white p-5">
      {result ? (
        <div>
          <div className="text-xl font-black">품목 전환 완료</div>
          <div className="mt-1 text-sm font-bold">{result.source_item_name} → {result.target_item_name} · {result.quantity} EA</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded border px-4 py-3 font-black">소스 PA -{result.quantity} EA</div>
            <div className="rounded border px-4 py-3 font-black">대상 PA +{result.quantity} EA</div>
          </div>
        </div>
      ) : (
        <div className="py-10 text-center text-sm font-bold">새 품목 전환을 시작하세요.</div>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button className={buttonBase} onClick={onNew}>새 품목 전환</button>
        <button className={buttonBase} onClick={onHistory}>입출고 내역에서 보기</button>
        <button className={buttonBase} onClick={onWarehouse}>입출고로 돌아가기</button>
      </div>
    </section>
  );
}
