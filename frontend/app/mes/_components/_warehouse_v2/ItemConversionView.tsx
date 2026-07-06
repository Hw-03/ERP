"use client";

import { useState } from "react";
import { api, type Item, type ItemConversionMode, type ItemConversionPreview, type ItemConversionResult } from "@/lib/api";

interface WorkProps {
  items: Item[];
  loading?: boolean;
  onComplete: (result: ItemConversionResult) => void;
}

interface CompleteProps {
  result: ItemConversionResult | null;
  onNew: () => void;
  onHistory: () => void;
  onWarehouse: () => void;
}

const ALLOWED_PROCESS_TYPES = ["PA", "AF", "AA"];
const panelClass = "rounded border p-3";
const buttonBase = "rounded border px-3 py-2 disabled:opacity-45";
const fieldClass = "grid gap-1 border p-2";
const inputClass = "h-10 border px-2";

function positiveInt(value: string | number) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function formatQty(value: number, unit = "EA") {
  return `${value} ${unit}`;
}

function itemLabel(item: Item) {
  return `${item.mes_code ?? "-"} · ${item.item_name} · ${formatQty(Number(item.quantity || 0), item.unit)}`;
}

function isConvertibleItem(item: Item) {
  return ALLOWED_PROCESS_TYPES.includes(item.process_type_code ?? "") && !item.deleted_at;
}

export function ItemConversionWorkView({ items, loading = false, onComplete }: WorkProps) {
  const [mode, setMode] = useState<ItemConversionMode | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [quantity, setQuantity] = useState<number | "">(1);
  const [memo, setMemo] = useState("");
  const [preview, setPreview] = useState<ItemConversionPreview | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const candidates = items.filter(isConvertibleItem);
  const source = candidates.find((item) => item.item_id === sourceId);
  const targetCandidates = source
    ? candidates.filter((item) => item.item_id !== sourceId && item.process_type_code === source.process_type_code)
    : candidates;
  const changeQty = quantity === "" ? 0 : positiveInt(quantity);
  const sourceOver = Boolean(source && changeQty > Number(source.quantity || 0));
  const needsMemo = preview?.resolved_mode === "BOM";
  const canPreview = Boolean(mode && source && targetId && changeQty >= 1 && !sourceOver && !busy);
  const canExecute = Boolean(preview?.executable && !sourceOver && (!needsMemo || memo.trim()) && !busy);

  const clearPreview = () => {
    setPreview(null);
    setReady(false);
    setError("");
  };

  const chooseMode = (nextMode: ItemConversionMode) => {
    setMode(nextMode);
    setMemo("");
    clearPreview();
  };

  const renderSelect = (
    kind: "source" | "target",
    label: string,
    value: string,
    setValue: (value: string) => void,
    choices: Item[],
  ) => (
    <label className={fieldClass}>
      <span className="text-sm font-black">{label}</span>
      <select
        data-testid={`item-conversion-${kind}-search`}
        value={value}
        disabled={loading || (kind === "target" && !source)}
        onChange={(event) => {
          setValue(event.target.value);
          clearPreview();
        }}
        className={inputClass}
      >
        <option value="">{kind === "source" ? "품목" : source ? source.process_type_code : "-"}</option>
        {choices.map((item) => (
          <option key={item.item_id} value={item.item_id} disabled={!item.bom_completed_at}>
            {itemLabel(item)}
          </option>
        ))}
      </select>
    </label>
  );

  async function loadPreview() {
    if (!canPreview || !mode) return;
    setBusy(true);
    setError("");
    try {
      setPreview(await api.getItemConversionPreview({
        source_item_id: sourceId,
        target_item_id: targetId,
        quantity: changeQty,
        requested_mode: mode,
      }));
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "확인 실패");
    } finally {
      setBusy(false);
    }
  }

  async function executeChange() {
    if (!canExecute || !preview || !mode) return;
    setBusy(true);
    setError("");
    try {
      onComplete(await api.executeItemConversion({
        source_item_id: sourceId,
        target_item_id: targetId,
        quantity: preview.quantity,
        requested_mode: mode,
        memo: memo.trim() || null,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리 실패");
    } finally {
      setBusy(false);
      setReady(false);
    }
  }

  const alert = sourceOver
    ? `재고 ${formatQty(Number(source?.quantity || 0), source?.unit)} 이하`
    : preview?.blocking_reason || error;

  if (!mode) {
    return (
      <section className={`grid gap-3 ${panelClass} xl:grid-cols-2`}>
        <button className="min-h-32 rounded border bg-white p-4 text-left" onClick={() => chooseMode("SPEC")}>
          <div className="text-2xl font-black">사양 전환</div>
        </button>
        <button className="min-h-32 rounded border bg-white p-4 text-left" onClick={() => chooseMode("BOM")}>
          <div className="text-2xl font-black">구성 전환</div>
        </button>
      </section>
    );
  }

  return (
    <section className={`grid gap-3 ${panelClass}`}>
      <div className="flex items-center justify-between gap-2 border p-2">
        <div className="text-xs font-black text-blue-700">{mode === "SPEC" ? "사양 전환" : "구성 전환"}</div>
        <button className={buttonBase} onClick={() => setMode(null)}>방식 선택</button>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {renderSelect("source", "소스", sourceId, setSourceId, candidates)}
        {renderSelect("target", "대상", targetId, setTargetId, targetCandidates)}
      </div>
      <div className="grid gap-3 xl:grid-cols-[180px_minmax(0,1fr)_auto]">
        <label className={fieldClass}>
          <span className="text-xs font-black">전환 수량</span>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value === "" ? "" : positiveInt(event.target.value));
              clearPreview();
            }}
            className={inputClass}
          />
        </label>
        <label className={fieldClass}>
          <span className="text-xs font-black">메모</span>
          <input
            data-testid="item-conversion-memo"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            className={inputClass}
          />
        </label>
        <button className={`${buttonBase} self-end`} disabled={!canPreview} onClick={() => void loadPreview()}>
          {busy ? "확인 중" : "비교"}
        </button>
      </div>
      {alert && <div className="rounded border px-3 py-2 text-sm font-bold text-red-700">{alert}</div>}
      <div data-testid="item-conversion-preview" className={panelClass}>
        {!preview ? (
          <div className="py-8 text-center text-sm font-bold">선택</div>
        ) : preview.lines.length === 0 ? (
          <div className="py-8 text-center text-sm font-bold">차이 없음</div>
        ) : (
          <div className="grid gap-2">
            {preview.lines.map((line) => {
              const add = line.total_delta > 0;
              return (
                <div key={line.item_id} className="rounded border px-3 py-2">
                  <div className="flex justify-between gap-2">
                    <div className="font-black">{line.item_name}</div>
                    <span className={add ? "font-black text-amber-700" : "font-black text-emerald-700"}>
                      {add ? "추가 차감" : "회수 입고"} {formatQty(Math.abs(line.total_delta), line.unit)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <button className={buttonBase} disabled={!preview || !canPreview} onClick={() => setReady(true)}>
          확인
        </button>
      </div>
      {ready && preview && (
        <div className={panelClass}>
          <div className="text-sm font-black">요약</div>
          <div className="mt-2 text-sm font-bold">
            {preview.source_item_name} -{formatQty(preview.quantity)} / {preview.target_item_name} +{formatQty(preview.quantity)}
            {preview.lines.length > 0 ? ` / 구성품 ${preview.lines.length}건` : ""}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button className={buttonBase} onClick={() => setReady(false)}>취소</button>
            <button data-testid="item-conversion-confirm-button" className={buttonBase} disabled={!canExecute} onClick={() => void executeChange()}>
              실행
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function ItemConversionCompleteView({ result, onNew, onHistory, onWarehouse }: CompleteProps) {
  return (
    <section data-testid="item-conversion-complete" className={panelClass}>
      {result ? (
        <div>
          <div className="text-xl font-black">품목 전환 완료</div>
          <div className="mt-1 text-sm font-bold">{result.source_item_name} → {result.target_item_name} · {formatQty(result.quantity)}</div>
        </div>
      ) : (
        <div className="py-10 text-center text-sm font-bold">새 작업</div>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button className={buttonBase} onClick={onNew}>새 품목 전환</button>
        <button className={buttonBase} onClick={onHistory}>내역 보기</button>
        <button className={buttonBase} onClick={onWarehouse}>돌아가기</button>
      </div>
    </section>
  );
}
