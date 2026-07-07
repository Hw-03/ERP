"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  ClipboardCheck,
  GitCompareArrows,
  Layers,
  PackageCheck,
} from "lucide-react";
import { api, type Item, type ItemConversionMode, type ItemConversionPreview, type ItemConversionResult } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

interface WorkProps {
  items: Item[];
  loading?: boolean;
  onBack?: () => void;
  onComplete: (result: ItemConversionResult) => void;
}

interface CompleteProps {
  result: ItemConversionResult | null;
  onNew: () => void;
  onHistory: () => void;
  onWarehouse: () => void;
}

const ALLOWED_PROCESS_TYPES = ["PA", "AF", "AA"];
const panelClass = "rounded-[22px] border p-4";
const buttonBase = "rounded-[16px] border px-4 py-3 text-sm font-black transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45";
const fieldClass = "grid gap-2 rounded-[18px] border p-4";
const inputClass = "h-12 rounded-[14px] border px-3 text-sm font-bold outline-none focus:border-[var(--c-blue)]";

function conversionPanelStyle(accent: string = LEGACY_COLORS.blue) {
  return {
    background: LEGACY_COLORS.s1,
    borderColor: LEGACY_COLORS.border,
    boxShadow: "var(--c-card-shadow)",
    backgroundImage: `linear-gradient(135deg, ${tint(accent, 5)}, transparent 42%)`,
  };
}

function fieldStyle() {
  return {
    background: LEGACY_COLORS.s2,
    borderColor: LEGACY_COLORS.border,
  };
}

function primaryButtonStyle(accent: string = LEGACY_COLORS.blue) {
  return {
    background: accent,
    borderColor: accent,
    color: "white",
  };
}

function secondaryButtonStyle() {
  return {
    background: LEGACY_COLORS.s2,
    borderColor: LEGACY_COLORS.border,
    color: LEGACY_COLORS.text,
  };
}

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

function pushConversionModeHistory(mode: ItemConversionMode): void {
  window.history.pushState(
    { ...(window.history.state || {}), wic: "work", wicm: mode },
    "",
    window.location.href,
  );
}

type ConversionStepId = 1 | 2 | 3 | 4;
type ConversionStepState = "done" | "active" | "locked";

const CONVERSION_STEPS: Array<{ id: ConversionStepId; title: string }> = [
  { id: 1, title: "방식 선택" },
  { id: 2, title: "소스·대상 선택" },
  { id: 3, title: "차이 확인" },
  { id: 4, title: "실행" },
];

function conversionModeLabel(mode: ItemConversionMode | null) {
  if (mode === "SPEC") return "사양 전환";
  if (mode === "BOM") return "구성 전환";
  return "";
}

function conversionCurrentStep(mode: ItemConversionMode | null, preview: ItemConversionPreview | null, ready: boolean): ConversionStepId {
  if (ready) return 4;
  if (preview) return 3;
  if (mode) return 2;
  return 1;
}

function ItemConversionStepChrome({
  mode,
  preview,
  ready,
  onBack,
  onModeSelection,
  onPreviewStep,
}: {
  mode: ItemConversionMode | null;
  preview: ItemConversionPreview | null;
  ready: boolean;
  onBack?: () => void;
  onModeSelection: () => void;
  onPreviewStep: () => void;
}) {
  const currentStep = conversionCurrentStep(mode, preview, ready);

  return (
    <div className="iwc shrink-0">
      <div className="grid gap-2 xl:grid-cols-[180px_minmax(0,1fr)]">
        {onBack && (
          <button
            type="button"
            className="iwpb done"
            onClick={onBack}
            data-testid="item-conversion-back"
          >
            <span className="iwpl">← 작업 유형 선택</span>
          </button>
        )}
        <nav className="iwp iwp--four" data-testid="item-conversion-step-nav">
          {CONVERSION_STEPS.map((step) => {
            const state: ConversionStepState =
              step.id < currentStep ? "done" : step.id === currentStep ? "active" : "locked";
            const summary = step.id === 1 && mode ? conversionModeLabel(mode) : "";
            const onClick =
              state === "done" && step.id === 1
                ? onModeSelection
                : state === "done" && (step.id === 2 || step.id === 3)
                  ? onPreviewStep
                  : undefined;

            return (
              <button
                key={step.id}
                type="button"
                className={state === "active" ? "iwpb a" : state === "done" ? "iwpb done" : "iwpb locked"}
                data-state={state}
                data-testid="item-conversion-step-nav-item"
                disabled={!onClick}
                onClick={onClick}
              >
                <span className="iwpl">{step.title}</span>
                {summary && <span className="iwps">{summary}</span>}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export function ItemConversionWorkView({ items, loading = false, onBack, onComplete }: WorkProps) {
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

  const resetMode = () => {
    setMode(null);
    setSourceId("");
    setTargetId("");
    setQuantity(1);
    setMemo("");
    clearPreview();
  };

  const chooseMode = (nextMode: ItemConversionMode) => {
    pushConversionModeHistory(nextMode);
    setMode(nextMode);
    setMemo("");
    clearPreview();
  };

  const backToModeSelection = () => {
    if (window.history.state?.wicm) {
      window.history.back();
      return;
    }
    resetMode();
  };

  useEffect(() => {
    function handleModePop(event: PopStateEvent) {
      if (!(event.state as { wicm?: unknown } | null)?.wicm) {
        resetMode();
      }
    }

    window.addEventListener("popstate", handleModePop);
    return () => window.removeEventListener("popstate", handleModePop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderSelect = (
    kind: "source" | "target",
    label: string,
    value: string,
    setValue: (value: string) => void,
    choices: Item[],
  ) => (
    <label className={fieldClass} style={fieldStyle()}>
      <span className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{label}</span>
      <select
        data-testid={`item-conversion-${kind}-search`}
        value={value}
        disabled={loading || (kind === "target" && !source)}
        onChange={(event) => {
          setValue(event.target.value);
          clearPreview();
        }}
        className={inputClass}
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
      >
        <option value="">{kind === "source" ? "품목 선택" : source ? `${source.process_type_code} 품목 선택` : "소스 먼저 선택"}</option>
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
      <section className="flex h-full min-h-0 flex-col gap-4 rounded-[28px] border p-4" style={conversionPanelStyle(LEGACY_COLORS.cyan)}>
        <ItemConversionStepChrome
          mode={mode}
          preview={preview}
          ready={ready}
          onBack={onBack}
          onModeSelection={resetMode}
          onPreviewStep={() => setReady(false)}
        />
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
          <button
            type="button"
            className="flex h-full min-h-0 flex-col items-start justify-between rounded-[22px] border p-10 text-left transition-all hover:brightness-110 active:scale-[0.99]"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.blue,
            }}
            onClick={() => chooseMode("SPEC")}
          >
            <div className="flex items-center gap-5">
              <ArrowLeftRight className="h-10 w-10" />
              <span className="text-4xl font-black leading-tight">사양 전환</span>
            </div>
            <span className="text-xl font-bold leading-tight" style={{ color: LEGACY_COLORS.muted2 }}>
              표시 사양만 전환
            </span>
          </button>
          <button
            type="button"
            className="flex h-full min-h-0 flex-col items-start justify-between rounded-[22px] border p-10 text-left transition-all hover:brightness-110 active:scale-[0.99]"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.yellow,
            }}
            onClick={() => chooseMode("BOM")}
          >
            <div className="flex items-center gap-5">
              <Layers className="h-10 w-10" />
              <span className="text-4xl font-black leading-tight">구성 전환</span>
            </div>
            <span className="text-xl font-bold leading-tight" style={{ color: LEGACY_COLORS.muted2 }}>
              BOM 차이 반영
            </span>
          </button>
        </div>
      </section>
    );
  }

  const modeAccent = mode === "SPEC" ? LEGACY_COLORS.blue : LEGACY_COLORS.yellow;

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 rounded-[28px] border p-4" style={conversionPanelStyle(modeAccent)}>
      <ItemConversionStepChrome
        mode={mode}
        preview={preview}
        ready={ready}
        onBack={onBack}
        onModeSelection={resetMode}
        onPreviewStep={() => setReady(false)}
      />
      <div className="grid shrink-0 gap-3 xl:grid-cols-2">
        {renderSelect("source", "소스 품목", sourceId, setSourceId, candidates)}
        {renderSelect("target", "대상 품목", targetId, setTargetId, targetCandidates)}
      </div>
      <div className="grid shrink-0 gap-3 xl:grid-cols-[180px_minmax(0,1fr)_auto]">
        <label className={fieldClass} style={fieldStyle()}>
          <span className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>전환 수량</span>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value === "" ? "" : positiveInt(event.target.value));
              clearPreview();
            }}
            className={inputClass}
            style={{
              background: LEGACY_COLORS.s1,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          />
        </label>
        <label className={fieldClass} style={fieldStyle()}>
          <span className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>
            메모 {needsMemo ? "(필수)" : "(선택)"}
          </span>
          <input
            data-testid="item-conversion-memo"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            className={inputClass}
            style={{
              background: LEGACY_COLORS.s1,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          />
        </label>
        <button
          data-testid="item-conversion-preview-button"
          className={`${buttonBase} self-end`}
          style={primaryButtonStyle(modeAccent)}
          disabled={!canPreview}
          onClick={() => void loadPreview()}
        >
          {busy ? "확인 중" : "차이 확인"}
        </button>
      </div>
      {alert && (
        <div
          className="shrink-0 rounded-[16px] border px-4 py-3 text-sm font-bold"
          style={{ background: tint(LEGACY_COLORS.red, 8), borderColor: tint(LEGACY_COLORS.red, 30), color: LEGACY_COLORS.red }}
        >
          {alert}
        </div>
      )}
      <div data-testid="item-conversion-preview" className="min-h-0 flex-1 rounded-[22px] border p-4" style={fieldStyle()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <GitCompareArrows className="h-5 w-5" style={{ color: modeAccent }} />
            <span className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>실행 요약</span>
          </div>
          {preview && (
            <span className="rounded-full px-3 py-1 text-xs font-black" style={{ background: tint(modeAccent, 14), color: modeAccent }}>
              {preview.lines.length > 0 ? `구성품 ${preview.lines.length}건` : "품목만 전환"}
            </span>
          )}
        </div>
        {!preview ? (
          <div className="flex h-full min-h-[180px] items-center justify-center rounded-[18px] border border-dashed text-center text-sm font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
            소스 품목, 대상 품목, 수량을 선택한 뒤 차이를 확인하세요.
          </div>
        ) : preview.lines.length === 0 ? (
          <div className="flex min-h-[180px] items-center justify-center gap-2 rounded-[18px] border text-sm font-black" style={{ borderColor: tint(LEGACY_COLORS.green, 28), background: tint(LEGACY_COLORS.green, 8), color: LEGACY_COLORS.green }}>
            <CheckCircle2 className="h-5 w-5" />
            BOM 차이 없음
          </div>
        ) : (
          <div className="grid max-h-full gap-2 overflow-y-auto pr-1">
            {preview.lines.map((line) => {
              const add = line.total_delta > 0;
              return (
                <div key={line.item_id} className="rounded-[16px] border px-4 py-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                  <div className="flex justify-between gap-2">
                    <div className="font-black" style={{ color: LEGACY_COLORS.text }}>{line.item_name}</div>
                    <span className="font-black" style={{ color: add ? LEGACY_COLORS.yellow : LEGACY_COLORS.green }}>
                      {add ? "추가 차감" : "회수 입고"} {formatQty(Math.abs(line.total_delta), line.unit)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex shrink-0 justify-end">
        <button className={buttonBase} style={secondaryButtonStyle()} disabled={!preview || !canPreview} onClick={() => setReady(true)}>
          확인
        </button>
      </div>
      {ready && preview && (
        <div className="shrink-0 rounded-[22px] border p-4" style={{ background: tint(modeAccent, 8), borderColor: tint(modeAccent, 28) }}>
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
            <ClipboardCheck className="h-4 w-4" style={{ color: modeAccent }} />
            실행 전 확인
          </div>
          <div className="mt-2 text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
            {preview.source_item_name} -{formatQty(preview.quantity)} / {preview.target_item_name} +{formatQty(preview.quantity)}
            {preview.lines.length > 0 ? ` / 구성품 ${preview.lines.length}건` : ""}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button className={buttonBase} style={secondaryButtonStyle()} onClick={() => setReady(false)}>취소</button>
            <button data-testid="item-conversion-confirm-button" className={buttonBase} style={primaryButtonStyle(modeAccent)} disabled={!canExecute} onClick={() => void executeChange()}>
              품목 전환 실행
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function ItemConversionCompleteView({ result, onNew, onHistory, onWarehouse }: CompleteProps) {
  return (
    <section data-testid="item-conversion-complete" className="flex h-full min-h-0 flex-col rounded-[28px] border p-6" style={conversionPanelStyle(LEGACY_COLORS.green)}>
      {result ? (
        <div className="rounded-[22px] border p-5" style={fieldStyle()}>
          <div className="flex items-center gap-3 text-2xl font-black" style={{ color: LEGACY_COLORS.green }}>
            <PackageCheck className="h-7 w-7" />
            품목 전환 완료
          </div>
          <div className="mt-3 text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
            {result.source_item_name} → {result.target_item_name} · {formatQty(result.quantity)}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>새 작업</div>
      )}
      <div className="mt-auto flex flex-wrap justify-end gap-2 pt-5">
        <button className={buttonBase} style={primaryButtonStyle(LEGACY_COLORS.green)} onClick={onNew}>새 품목 전환</button>
        <button className={buttonBase} style={secondaryButtonStyle()} onClick={onHistory}>입출고 내역에서 보기</button>
        <button className={buttonBase} style={secondaryButtonStyle()} onClick={onWarehouse}>입출고로 돌아가기</button>
      </div>
    </section>
  );
}
