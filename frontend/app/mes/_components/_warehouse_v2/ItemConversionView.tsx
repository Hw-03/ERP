"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type Item,
  type ItemConversionMode,
  type ItemConversionPreview,
  type ItemConversionResult,
} from "@/lib/api";

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

type ConversionStepId = 1 | 2 | 3 | 4;
type ConversionStepState = "done" | "active" | "locked";
type PickerKind = "source" | "target";

const ALLOWED_PROCESS_TYPES = ["PA", "AF", "AA"];
const CONVERSION_STEPS: Array<{ id: ConversionStepId; title: string }> = [
  { id: 1, title: "방식 선택" },
  { id: 2, title: "소스·대상 선택" },
  { id: 3, title: "차이 확인" },
  { id: 4, title: "실행" },
];

const buttonPrimary = "icb icb-primary";
const buttonSecondary = "icb icb-secondary";

function positiveInt(value: string | number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function formatQty(value: number, unit = "EA"): string {
  return `${value} ${unit}`;
}

function itemStock(item: Item): number {
  return Number(item.quantity || 0);
}

function itemLabel(item: Item): string {
  return `${item.mes_code ?? "-"} · ${item.item_name} · ${formatQty(itemStock(item), item.unit)}`;
}

function isConvertibleItem(item: Item): boolean {
  return ALLOWED_PROCESS_TYPES.includes(item.process_type_code ?? "") && !item.deleted_at;
}

function conversionModeLabel(mode: ItemConversionMode | null): string {
  if (mode === "SPEC") return "사양 전환";
  if (mode === "BOM") return "구성 전환";
  return "";
}

function conversionStep(mode: ItemConversionMode | null, preview: ItemConversionPreview | null, ready: boolean): ConversionStepId {
  if (ready) return 4;
  if (preview) return 3;
  if (mode) return 2;
  return 1;
}

function pushConversionModeHistory(mode: ItemConversionMode): void {
  window.history.pushState(
    { ...(window.history.state || {}), wic: "work", wicm: mode },
    "",
    window.location.href,
  );
}

function filterCandidates(candidates: Item[], query: string): Item[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return candidates;
  return candidates.filter((item) => {
    const name = item.item_name.toLowerCase();
    const code = (item.mes_code ?? "").toLowerCase();
    const process = (item.process_type_code ?? "").toLowerCase();
    return name.includes(normalized) || code.includes(normalized) || process.includes(normalized);
  });
}

export function ItemConversionWorkView({ items, loading = false, onBack, onComplete }: WorkProps) {
  const [mode, setMode] = useState<ItemConversionMode | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [memo, setMemo] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [targetQuery, setTargetQuery] = useState("");
  const [preview, setPreview] = useState<ItemConversionPreview | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(
    () => items.filter(isConvertibleItem).sort((a, b) => (a.mes_code ?? "").localeCompare(b.mes_code ?? "")),
    [items],
  );
  const sourceItem = candidates.find((item) => item.item_id === sourceId) ?? null;
  const targetItem = candidates.find((item) => item.item_id === targetId) ?? null;
  const targetCandidates = sourceItem
    ? candidates.filter(
        (item) =>
          item.item_id !== sourceItem.item_id &&
          item.process_type_code === sourceItem.process_type_code,
      )
    : [];
  const filteredSources = filterCandidates(candidates, sourceQuery).slice(0, 80);
  const filteredTargets = filterCandidates(targetCandidates, targetQuery).slice(0, 80);
  const currentStep = conversionStep(mode, preview, ready);
  const sourceOver = sourceItem ? quantity > itemStock(sourceItem) : false;
  const canPreview = Boolean(mode && sourceItem && targetItem && !sourceOver && quantity >= 1);
  const memoRequired = mode === "BOM";
  const memoReady = !memoRequired || memo.trim().length > 0;
  const canGoExecute = Boolean(preview?.executable && memoReady);

  const clearPreviewState = useCallback((): void => {
    setPreview(null);
    setReady(false);
    setError(null);
  }, []);

  const resetToModeSelection = useCallback((): void => {
    setMode(null);
    setSourceId("");
    setTargetId("");
    setQuantity(1);
    setMemo("");
    setSourceQuery("");
    setTargetQuery("");
    clearPreviewState();
  }, [clearPreviewState]);

  useEffect(() => {
    const handlePop = (event: PopStateEvent) => {
      const state = (event.state || {}) as { wic?: string; wicm?: ItemConversionMode };
      if (state.wic === "work" && state.wicm) return;
      resetToModeSelection();
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [resetToModeSelection]);

  function selectMode(nextMode: ItemConversionMode): void {
    setMode(nextMode);
    setSourceId("");
    setTargetId("");
    setQuantity(1);
    setMemo("");
    setSourceQuery("");
    setTargetQuery("");
    clearPreviewState();
    pushConversionModeHistory(nextMode);
  }

  function selectSource(item: Item): void {
    setSourceId(item.item_id);
    setSourceQuery(itemLabel(item));
    setTargetId("");
    setTargetQuery("");
    clearPreviewState();
  }

  function selectTarget(item: Item): void {
    setTargetId(item.item_id);
    setTargetQuery(itemLabel(item));
    clearPreviewState();
  }

  async function loadPreview(): Promise<void> {
    if (!mode || !sourceItem || !targetItem || sourceOver) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.getItemConversionPreview({
        source_item_id: sourceItem.item_id,
        target_item_id: targetItem.item_id,
        quantity,
        requested_mode: mode,
      });
      setPreview(next);
      setReady(false);
    } catch (err) {
      setPreview(null);
      setReady(false);
      setError(err instanceof Error ? err.message : "품목 전환 차이 확인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function execute(): Promise<void> {
    if (!mode || !sourceItem || !targetItem || !preview || !canGoExecute) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.executeItemConversion({
        source_item_id: sourceItem.item_id,
        target_item_id: targetItem.item_id,
        quantity,
        requested_mode: mode,
        memo: memo.trim() || null,
      });
      onComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "전환 실패");
    } finally {
      setBusy(false);
    }
  }

  function handleBackToWorkType(): void {
    if (window.history.state?.wicm) {
      window.history.back();
      return;
    }
    onBack?.();
  }

  function handleStepClick(step: ConversionStepId): void {
    if (step === 1) {
      resetToModeSelection();
      return;
    }
    if (step === 2 && preview) {
      clearPreviewState();
      return;
    }
    if (step === 3 && ready) {
      setReady(false);
    }
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col gap-3"
      data-testid="item-conversion-work"
    >
      <ItemConversionStepChrome
        mode={mode}
        preview={preview}
        ready={ready}
        onBack={handleBackToWorkType}
        onStepClick={handleStepClick}
      />

      {loading ? (
        <div className="icf flex flex-1 items-center justify-center rounded-[22px] border text-sm font-bold">
          품목 정보를 불러오는 중입니다.
        </div>
      ) : !mode ? (
        <ModeSelection onSelect={selectMode} />
      ) : currentStep === 2 ? (
        <SelectionStep
          mode={mode}
          sourceItem={sourceItem}
          targetItem={targetItem}
          sourceQuery={sourceQuery}
          targetQuery={targetQuery}
          sourceCandidates={filteredSources}
          targetCandidates={filteredTargets}
          quantity={quantity}
          sourceOver={sourceOver}
          busy={busy}
          canNext={canPreview}
          error={error}
          onSourceQuery={(value) => {
            setSourceQuery(value);
            if (sourceItem && value !== itemLabel(sourceItem)) {
              setSourceId("");
              setTargetId("");
              setTargetQuery("");
              clearPreviewState();
            }
          }}
          onTargetQuery={(value) => {
            setTargetQuery(value);
            if (targetItem && value !== itemLabel(targetItem)) {
              setTargetId("");
              clearPreviewState();
            }
          }}
          onSourceSelect={selectSource}
          onTargetSelect={selectTarget}
          onQuantity={(value) => {
            setQuantity(positiveInt(value));
            clearPreviewState();
          }}
          onNext={() => void loadPreview()}
        />
      ) : currentStep === 3 && mode && preview ? (
        <ReviewStep
          mode={mode}
          preview={preview}
          memo={memo}
          memoRequired={memoRequired}
          busy={busy}
          error={error}
          canNext={canGoExecute}
          onMemo={setMemo}
          onBack={() => clearPreviewState()}
          onNext={() => setReady(true)}
        />
      ) : mode && preview ? (
        <ExecuteStep
          mode={mode}
          preview={preview}
          memo={memo}
          busy={busy}
          error={error}
          onBack={() => setReady(false)}
          onExecute={() => void execute()}
        />
      ) : null}
    </section>
  );
}

function ItemConversionStepChrome({
  mode,
  preview,
  ready,
  onBack,
  onStepClick,
}: {
  mode: ItemConversionMode | null;
  preview: ItemConversionPreview | null;
  ready: boolean;
  onBack?: () => void;
  onStepClick: (step: ConversionStepId) => void;
}) {
  const currentStep = conversionStep(mode, preview, ready);
  const conversionNav = CONVERSION_STEPS.map((step) => {
    const state: ConversionStepState =
      step.id < currentStep ? "done" : step.id === currentStep ? "active" : "locked";
    const summary =
      step.id === 1 && mode
        ? conversionModeLabel(mode)
        : step.id === 3 && preview
        ? `${preview.lines.length}개 차이`
        : step.id === 4 && ready
        ? "최종 확인"
        : "";
    return { ...step, state, summary };
  });

  return (
    <nav className="iwp ic-conversion-progress" data-testid="item-conversion-step-nav" aria-label="품목 전환 단계">
      <button
        type="button"
        className="iwpb done"
        data-testid="item-conversion-step-nav-item"
        data-state="done"
        onClick={onBack}
        disabled={!onBack}
      >
        <span className="iwpl">작업 유형 선택</span>
        <span className="iwps">품목 전환</span>
      </button>
      {conversionNav.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`iwpb ${item.state === "active" ? "a" : item.state}`}
          data-testid="item-conversion-step-nav-item"
          data-state={item.state}
          disabled={item.state === "locked" || item.state === "active"}
          onClick={() => onStepClick(item.id)}
        >
          <span className="iwpl">{item.title}</span>
          {item.summary && <span className="iwps">{item.summary}</span>}
        </button>
      ))}
    </nav>
  );
}

function ModeSelection({ onSelect }: { onSelect: (mode: ItemConversionMode) => void }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
      <button
        type="button"
        className="icmc"
        onClick={() => onSelect("SPEC")}
      >
        <div className="ic-blue-text text-3xl font-black">사양 전환</div>
        <div className="icm mt-auto text-base font-bold">
          표시 사양만 전환
        </div>
      </button>
      <button
        type="button"
        className="icmc"
        onClick={() => onSelect("BOM")}
      >
        <div className="ic-yellow-text text-3xl font-black">구성 전환</div>
        <div className="icm mt-auto text-base font-bold">
          BOM 차이 반영
        </div>
      </button>
    </div>
  );
}

function SelectionStep({
  mode,
  sourceItem,
  targetItem,
  sourceQuery,
  targetQuery,
  sourceCandidates,
  targetCandidates,
  quantity,
  sourceOver,
  busy,
  canNext,
  error,
  onSourceQuery,
  onTargetQuery,
  onSourceSelect,
  onTargetSelect,
  onQuantity,
  onNext,
}: {
  mode: ItemConversionMode;
  sourceItem: Item | null;
  targetItem: Item | null;
  sourceQuery: string;
  targetQuery: string;
  sourceCandidates: Item[];
  targetCandidates: Item[];
  quantity: number;
  sourceOver: boolean;
  busy: boolean;
  canNext: boolean;
  error: string | null;
  onSourceQuery: (value: string) => void;
  onTargetQuery: (value: string) => void;
  onSourceSelect: (item: Item) => void;
  onTargetSelect: (item: Item) => void;
  onQuantity: (value: string | number) => void;
  onNext: () => void;
}) {
  const selectionHint = sourceOver
    ? "소스 재고 초과 수량입니다."
    : sourceItem && targetItem
      ? "선택 완료 · 차이를 확인합니다."
      : "소스·대상·수량을 선택하세요.";
  const selectionHintClass = sourceOver ? "ic-red" : "icm";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <CandidatePanel
          kind="source"
          title="소스 품목"
          query={sourceQuery}
          selected={sourceItem}
          candidates={sourceCandidates}
          placeholder="품명 · 품목 코드 검색"
          onQuery={onSourceQuery}
          onSelect={onSourceSelect}
        />
        <CandidatePanel
          kind="target"
          title="대상 품목"
          query={targetQuery}
          selected={targetItem}
          candidates={targetCandidates}
          placeholder={sourceItem ? "품명 · 품목 코드 검색" : "소스 품목을 먼저 선택"}
          disabled={!sourceItem}
          emptyText={sourceItem ? "대상 품목이 없습니다." : "소스 먼저 선택"}
          onQuery={onTargetQuery}
          onSelect={onTargetSelect}
        />
      </div>
      <div className="grid shrink-0 gap-2 lg:grid-cols-[120px_minmax(0,1fr)_140px]">
        <label className="grid gap-1.5">
          <span className="icm text-xs font-black">전환 수량</span>
          <input
            data-testid="item-conversion-quantity"
            type="number"
            min={1}
            value={quantity}
            onChange={(event) => onQuantity(event.target.value)}
            className="ici"
          />
        </label>
        <div className="icf flex min-h-12 items-center rounded-[14px] border px-4 text-sm font-bold">
          <span className={selectionHintClass}>{selectionHint}</span>
        </div>
        <button
          type="button"
          className={canNext ? buttonPrimary : buttonSecondary}
          disabled={!canNext}
          onClick={onNext}
        >
          {busy ? "확인 중" : "다음 단계로"}
        </button>
      </div>
      {error && <ErrorNotice message={error} />}
    </div>
  );
}

function CandidatePanel({
  kind,
  title,
  query,
  selected,
  candidates,
  placeholder,
  disabled = false,
  emptyText = "검색 결과가 없습니다.",
  onQuery,
  onSelect,
}: {
  kind: PickerKind;
  title: string;
  query: string;
  selected: Item | null;
  candidates: Item[];
  placeholder: string;
  disabled?: boolean;
  emptyText?: string;
  onQuery: (value: string) => void;
  onSelect: (item: Item) => void;
}) {
  return (
    <section className="icf flex min-h-0 flex-col gap-3 rounded-[18px] border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="ict text-base font-black">{title}</div>
        </div>
      </div>
      <label className="icf flex min-h-12 items-center gap-2 rounded-[14px] border px-3">
        <input
          data-testid={`item-conversion-${kind}-search`}
          value={query}
          disabled={disabled}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={placeholder}
          className="ict h-full min-w-0 flex-1 bg-transparent text-sm font-bold outline-none disabled:cursor-not-allowed"
        />
      </label>
      <div className="icpnl sg min-h-0 flex-1 overflow-y-auto rounded-[14px] border p-2">
        {disabled || candidates.length === 0 ? (
          <div className="icm flex h-full min-h-[180px] items-center justify-center text-sm font-bold">
            {emptyText}
          </div>
        ) : (
          <div className="grid gap-2">
            {candidates.map((item) => {
              const active = selected?.item_id === item.item_id;
              return (
                <button
                  key={item.item_id}
                  type="button"
                  data-testid={`item-conversion-${kind}-option-${item.item_id}`}
                  onClick={() => onSelect(item)}
                  className={`ico${active ? " ico-active" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black">{item.item_name}</span>
                    <span className="icm mt-0.5 block truncate text-xs font-bold">
                      {item.mes_code ?? "-"} · {formatQty(itemStock(item), item.unit)} · {item.bom_completed_at ? "BOM" : "확인 필요"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function ReviewStep({
  mode,
  preview,
  memo,
  memoRequired,
  busy,
  error,
  canNext,
  onMemo,
  onBack,
  onNext,
}: {
  mode: ItemConversionMode;
  preview: ItemConversionPreview;
  memo: string;
  memoRequired: boolean;
  busy: boolean;
  error: string | null;
  canNext: boolean;
  onMemo: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="item-conversion-preview">
      <PreviewSummary preview={preview} mode={mode} />
      <PreviewDifferencePanels preview={preview} />
      <div className="grid shrink-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="grid gap-1.5">
          <span className="icm text-xs font-black">
            메모 {memoRequired ? "(필수)" : "(선택)"}
          </span>
          <input
            data-testid="item-conversion-memo"
            value={memo}
            onChange={(event) => onMemo(event.target.value)}
            placeholder={memoRequired ? "구성 전환 사유를 입력하세요" : "선택 입력"}
            className="ici"
          />
        </label>
        <button type="button" className={buttonSecondary} onClick={onBack}>
          소스·대상 다시 선택
        </button>
        <button
          type="button"
          className={canNext ? buttonPrimary : buttonSecondary}
          disabled={!canNext || busy}
          onClick={onNext}
        >
          실행 단계로
        </button>
      </div>
      {!preview.executable && preview.blocking_reason && <ErrorNotice message={preview.blocking_reason} />}
      {error && <ErrorNotice message={error} />}
    </div>
  );
}

function ExecuteStep({
  mode,
  preview,
  memo,
  busy,
  error,
  onBack,
  onExecute,
}: {
  mode: ItemConversionMode;
  preview: ItemConversionPreview;
  memo: string;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onExecute: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="item-conversion-execute-step">
      <div className="icf rounded-[20px] border p-5">
        <div className="ict text-xl font-black">최종 실행</div>
        <div className="ict mt-3 grid gap-2 text-sm font-bold">
          <div>{preview.source_item_name} -{formatQty(preview.quantity)}</div>
          <div>{preview.target_item_name} +{formatQty(preview.quantity)}</div>
          <div>{conversionModeLabel(mode)} · 구성품 차이 {preview.lines.length}건</div>
          <div>메모 {memo.trim() || "-"}</div>
        </div>
      </div>
      <div className="mt-auto flex justify-end gap-2">
        <button type="button" className={buttonSecondary} onClick={onBack}>
          차이 다시 보기
        </button>
        <button
          type="button"
          className={buttonPrimary}
          data-testid="item-conversion-confirm-button"
          disabled={busy}
          onClick={onExecute}
        >
          {busy ? "실행중" : "전환 실행"}
        </button>
      </div>
      {error && <ErrorNotice message={error} />}
    </div>
  );
}

function PreviewSummary({ preview, mode }: { preview: ItemConversionPreview; mode: ItemConversionMode }) {
  const status = preview.executable ? "실행 가능" : "확인 필요";

  return (
    <div className="icf shrink-0 rounded-[18px] border p-4">
      <div className="min-w-0">
        <div className="icm text-xs font-black">
          {conversionModeLabel(mode)} · {preview.lines.length}개 차이 · {status}
        </div>
        <div className="ict mt-1 truncate text-xl font-black">
          {preview.source_item_name} → {preview.target_item_name}
        </div>
        <div className="icm mt-1 text-sm font-bold">
          {preview.source_mes_code ?? "-"} → {preview.target_mes_code ?? "-"} · {formatQty(preview.quantity)}
        </div>
      </div>
    </div>
  );
}

function PreviewDifferencePanels({ preview }: { preview: ItemConversionPreview }) {
  if (preview.lines.length === 0) {
    return (
      <div className="icm flex min-h-0 flex-1 items-center justify-center rounded-[18px] border text-sm font-bold">
        변경되는 구성품이 없습니다. 소스 품목 차감과 대상 품목 입고만 처리됩니다.
      </div>
    );
  }

  const consumeLines = preview.lines.filter((line) => line.line_kind === "consume" || line.total_delta > 0);
  const recoverLines = preview.lines.filter((line) => !consumeLines.includes(line));

  return (
    <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-2">
      <DifferencePanel
        title="소스 BOM에서 빠지는 구성"
        description="소스 품목에서 빠지는 구성품은 회수 입고로 돌아옵니다."
        emptyText="회수할 구성품 없음"
        lines={recoverLines}
        kind="recover"
      />
      <DifferencePanel
        title="대상 BOM 때문에 필요한 구성"
        description="대상 품목에 더 필요한 구성품은 추가 차감됩니다."
        emptyText="추가 차감할 구성품 없음"
        lines={consumeLines}
        kind="consume"
      />
    </div>
  );
}

function DifferencePanel({
  title,
  description,
  emptyText,
  lines,
  kind,
}: {
  title: string;
  description: string;
  emptyText: string;
  lines: ItemConversionPreview["lines"];
  kind: "consume" | "recover";
}) {
  return (
    <section className="icf flex min-h-0 flex-col rounded-[18px] border p-4">
      <div className="shrink-0">
        <div className="ict text-lg font-black">{title}</div>
        <div className="icm mt-1 text-xs font-bold">{description}</div>
      </div>
      <div className="sg mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {lines.length === 0 ? (
          <div className="icm flex h-full min-h-[180px] items-center justify-center rounded-[14px] border text-sm font-bold">
            {emptyText}
          </div>
        ) : (
          <div className="grid gap-2">
            {lines.map((line) => (
              <div
                key={`${line.item_id}-${line.line_kind}`}
                className="icf flex min-h-14 items-center justify-between gap-3 rounded-[14px] border px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="ict line-clamp-2 text-sm font-black">
                    {line.item_name}
                  </div>
                  <div className="icm mt-0.5 text-xs font-bold">
                    {line.mes_code ?? "-"} · {line.department ?? "창고"}
                  </div>
                </div>
                <span className={kind === "consume" ? "ic-delta ic-delta-consume" : "ic-delta ic-delta-return"}>
                  {kind === "consume" ? "추가 차감 -" : "회수 입고 +"}
                  {formatQty(Math.abs(line.total_delta), line.unit)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="ic-error">
      <span>{message}</span>
    </div>
  );
}

export function ItemConversionCompleteView({ result, onNew, onHistory, onWarehouse }: CompleteProps) {
  return (
    <section
      className="ic-card flex h-full min-h-0 flex-col rounded-[24px] p-6"
      data-testid="item-conversion-complete"
    >
      <div className="icf rounded-[22px] border p-6">
        <div className="ict text-2xl font-black">
          품목 전환 완료
        </div>
        <div className="ict mt-3 text-base font-bold leading-relaxed">
          {result
            ? `${result.source_item_name} → ${result.target_item_name} · ${formatQty(result.quantity)}`
            : "전환 결과 없음"}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap justify-end gap-2 pt-5">
        <button type="button" className={buttonPrimary} onClick={onNew}>
          새 품목 전환
        </button>
        <button type="button" className={buttonSecondary} onClick={onHistory}>
          입출고 내역
        </button>
        <button type="button" className={buttonSecondary} onClick={onWarehouse}>
          입출고로 돌아가기
        </button>
      </div>
    </section>
  );
}
