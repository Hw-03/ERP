"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type Item,
  type ItemConversionMode,
  type ItemConversionPreview,
  type ItemConversionResult,
} from "@/lib/api";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";

interface WorkProps {
  items: Item[];
  loading?: boolean;
  requesterEmployeeId: string;
  historyStep?: ConversionStepId;
  onHistoryStepChange?: (step: ConversionStepId) => void;
  onHistoryStepBack?: (step: ConversionStepId) => void;
  onBack?: () => void;
  onComplete: (result: ItemConversionResult) => void;
}

type ConversionStepId = 1 | 2 | 3;
type ConversionStepState = "done" | "active" | "locked";
type PickerKind = "source" | "target";

const ALLOWED_PROCESS_TYPES = ["PA", "AF", "AA"];
const CONVERSION_STEPS: Array<{ id: ConversionStepId; title: string }> = [
  { id: 1, title: "기존·대상 선택" },
  { id: 2, title: "차이 확인" },
  { id: 3, title: "실행" },
];

const buttonPrimary = "icb icb-primary";
const buttonSecondary = "icb icb-secondary";
const MISSING_REQUESTER_ERROR = "로그인 작업자 정보를 확인할 수 없습니다. 다시 로그인해 주세요.";

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
  return "자동 판정";
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

export function ItemConversionWorkView({
  items,
  loading = false,
  requesterEmployeeId,
  historyStep,
  onHistoryStepChange,
  onHistoryStepBack,
  onBack,
  onComplete,
}: WorkProps) {
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [memo, setMemo] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [targetQuery, setTargetQuery] = useState("");
  const [pendingCandidatePosition, setPendingCandidatePosition] = useState<PickerKind | null>(null);
  const [preview, setPreview] = useState<ItemConversionPreview | null>(null);
  const [localStep, setLocalStep] = useState<ConversionStepId>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executeConfirmOpen, setExecuteConfirmOpen] = useState(false);

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
  const currentStep = historyStep
    ? historyStep === 1 || preview
      ? historyStep
      : 1
    : localStep;
  const sourceOver = sourceItem ? quantity > itemStock(sourceItem) : false;
  const canPreview = Boolean(sourceItem && targetItem && !sourceOver && quantity >= 1);
  const resolvedMode = preview?.resolved_mode ?? null;
  const memoRequired = resolvedMode === "BOM";
  const memoReady = !memoRequired || memo.trim().length > 0;
  const canGoExecute = Boolean(preview?.executable && memoReady);
  const normalizedRequesterEmployeeId = requesterEmployeeId.trim();
  const requesterReady = normalizedRequesterEmployeeId.length > 0;
  const requesterError = requesterReady ? null : MISSING_REQUESTER_ERROR;

  const clearPreviewState = useCallback((): void => {
    setPreview(null);
    setError(null);
  }, []);

  function moveForward(step: ConversionStepId): void {
    setLocalStep(step);
    onHistoryStepChange?.(step);
  }

  function selectSource(item: Item, shouldPosition: boolean): void {
    setSourceId(item.item_id);
    setSourceQuery("");
    setTargetId("");
    setTargetQuery("");
    setPendingCandidatePosition(shouldPosition ? "source" : null);
    clearPreviewState();
  }

  function selectTarget(item: Item, shouldPosition: boolean): void {
    setTargetId(item.item_id);
    setTargetQuery("");
    setPendingCandidatePosition(shouldPosition ? "target" : null);
    clearPreviewState();
  }

  async function loadPreview(): Promise<void> {
    if (!sourceItem || !targetItem || sourceOver) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.getItemConversionPreview({
        source_item_id: sourceItem.item_id,
        target_item_id: targetItem.item_id,
        quantity,
        requester_employee_id: normalizedRequesterEmployeeId,
      });
      setPreview(next);
      moveForward(2);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "품목 전환 차이 확인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function execute(): Promise<void> {
    if (!sourceItem || !targetItem || !preview || !canGoExecute) return;
    if (!requesterReady) {
      setExecuteConfirmOpen(false);
      setError(MISSING_REQUESTER_ERROR);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.executeItemConversion({
        source_item_id: sourceItem.item_id,
        target_item_id: targetItem.item_id,
        quantity,
        memo: memo.trim() || null,
        requester_employee_id: normalizedRequesterEmployeeId,
      });
      setExecuteConfirmOpen(false);
      onComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "전환 실행에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function handleStepClick(step: ConversionStepId): void {
    if (step >= currentStep) return;
    if (onHistoryStepBack) {
      onHistoryStepBack(step);
      return;
    }
    setLocalStep(step);
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col gap-3"
      data-testid="item-conversion-work"
    >
      <ItemConversionStepChrome
        sourceItem={sourceItem}
        targetItem={targetItem}
        preview={preview}
        currentStep={currentStep}
        onBack={onBack}
        onStepClick={handleStepClick}
      />

      {loading ? (
        <div className="icf flex flex-1 items-center justify-center rounded-[22px] border text-sm font-bold">
          품목 정보를 불러오는 중입니다.
        </div>
      ) : currentStep === 1 ? (
        <SelectionStep
          sourceItem={sourceItem}
          targetItem={targetItem}
          sourceQuery={sourceQuery}
          targetQuery={targetQuery}
          sourceCandidates={filteredSources}
          targetCandidates={filteredTargets}
          pendingCandidatePosition={pendingCandidatePosition}
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
          onCandidatePositioned={() => setPendingCandidatePosition(null)}
          onQuantity={(value) => {
            setQuantity(positiveInt(value));
            clearPreviewState();
          }}
          onNext={() => void loadPreview()}
        />
      ) : currentStep === 2 && preview ? (
        <ReviewStep
          preview={preview}
          memo={memo}
          memoRequired={memoRequired}
          busy={busy}
          error={error}
          canNext={canGoExecute}
          onMemo={setMemo}
          onNext={() => moveForward(3)}
        />
      ) : preview ? (
        <ExecuteStep
          preview={preview}
          memo={memo}
          busy={busy}
          error={error ?? requesterError}
          canExecute={requesterReady}
          onExecute={() => setExecuteConfirmOpen(true)}
        />
      ) : null}
      <ConfirmModal
        open={executeConfirmOpen}
        title="품목 전환을 실행할까요?"
        tone="normal"
        cautionMessage="기존 품목 재고가 차감되고 대상 품목 재고가 즉시 입고됩니다."
        confirmLabel="전환 실행"
        busy={busy}
        busyLabel="실행 중"
        onClose={() => setExecuteConfirmOpen(false)}
        onConfirm={() => void execute()}
      >
        {sourceItem && targetItem && (
          <div className="grid gap-2 text-sm font-bold">
            <div>기존 품목: {sourceItem.item_name} · {formatQty(quantity, sourceItem.unit)}</div>
            <div>대상 품목: {targetItem.item_name} · {formatQty(quantity, targetItem.unit)}</div>
          </div>
        )}
      </ConfirmModal>
    </section>
  );
}

function ItemConversionStepChrome({
  sourceItem,
  targetItem,
  preview,
  currentStep,
  onBack,
  onStepClick,
}: {
  sourceItem: Item | null;
  targetItem: Item | null;
  preview: ItemConversionPreview | null;
  currentStep: ConversionStepId;
  onBack?: () => void;
  onStepClick: (step: ConversionStepId) => void;
}) {
  const conversionNav = CONVERSION_STEPS.map((step) => {
    const state: ConversionStepState =
      step.id < currentStep ? "done" : step.id === currentStep ? "active" : "locked";
    const summary =
      step.id === 1 && sourceItem && targetItem
        ? `기존 ${sourceItem.mes_code ?? sourceItem.item_name} · 대상 ${targetItem.mes_code ?? targetItem.item_name}`
        : step.id === 2 && preview
        ? `${preview.resolved_mode} · ${preview.lines.length}개 차이`
        : step.id === 3 && currentStep === 3
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

function SelectionStep({
  sourceItem,
  targetItem,
  sourceQuery,
  targetQuery,
  sourceCandidates,
  targetCandidates,
  pendingCandidatePosition,
  quantity,
  sourceOver,
  busy,
  canNext,
  error,
  onSourceQuery,
  onTargetQuery,
  onSourceSelect,
  onTargetSelect,
  onCandidatePositioned,
  onQuantity,
  onNext,
}: {
  sourceItem: Item | null;
  targetItem: Item | null;
  sourceQuery: string;
  targetQuery: string;
  sourceCandidates: Item[];
  targetCandidates: Item[];
  pendingCandidatePosition: PickerKind | null;
  quantity: number;
  sourceOver: boolean;
  busy: boolean;
  canNext: boolean;
  error: string | null;
  onSourceQuery: (value: string) => void;
  onTargetQuery: (value: string) => void;
  onSourceSelect: (item: Item, shouldPosition: boolean) => void;
  onTargetSelect: (item: Item, shouldPosition: boolean) => void;
  onCandidatePositioned: () => void;
  onQuantity: (value: string | number) => void;
  onNext: () => void;
}) {
  const selectionHint = sourceOver
    ? "기존 품목 재고가 부족합니다"
    : !sourceItem
      ? "기존 품목을 선택하세요"
      : !targetItem
        ? "대상 품목을 선택하세요"
        : quantity < 1
          ? "전환 수량을 확인하세요"
          : "차이 확인으로 이동할 수 있습니다";
  const selectionHintClass = sourceOver ? "ic-red" : "icm";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <CandidatePanel
          kind="source"
          title="기존 품목"
          query={sourceQuery}
          selected={sourceItem}
          candidates={sourceCandidates}
          placeholder="품명 · 품목 코드 검색"
          repositionSelected={pendingCandidatePosition === "source"}
          onSelectedPositioned={onCandidatePositioned}
          onQuery={onSourceQuery}
          onSelect={onSourceSelect}
        />
        <CandidatePanel
          kind="target"
          title="대상 품목"
          query={targetQuery}
          selected={targetItem}
          candidates={targetCandidates}
          placeholder={sourceItem ? "품명 · 품목 코드 검색" : "기존 품목을 먼저 선택"}
          disabled={!sourceItem}
          emptyText={sourceItem ? "대상 후보가 없습니다." : "기존 품목을 선택하세요"}
          repositionSelected={pendingCandidatePosition === "target"}
          onSelectedPositioned={onCandidatePositioned}
          onQuery={onTargetQuery}
          onSelect={onTargetSelect}
        />
      </div>
      <div className="grid shrink-0 gap-2 lg:grid-cols-[minmax(0,1fr)_220px_150px]">
        <div className="icf flex min-h-12 items-center rounded-[14px] border px-4 text-sm font-bold">
          <span data-testid="item-conversion-selection-hint" className={selectionHintClass}>{selectionHint}</span>
        </div>
        <label className="icf flex min-h-12 items-center gap-3 rounded-[14px] border px-4">
          <span className="icm shrink-0 text-xs font-black">전환 수량</span>
          <input
            data-testid="item-conversion-quantity"
            type="number"
            min={1}
            value={quantity}
            onChange={(event) => onQuantity(event.target.value)}
            className="ict h-full min-w-0 flex-1 bg-transparent text-base font-black outline-none focus-visible:ring-2"
          />
        </label>
        <button
          type="button"
          data-testid="item-conversion-next-button"
          className={canNext ? buttonPrimary : buttonSecondary}
          disabled={!canNext || busy}
          onClick={onNext}
        >
          {busy ? "확인 중" : "다음"}
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
  repositionSelected,
  onSelectedPositioned,
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
  repositionSelected: boolean;
  onSelectedPositioned: () => void;
  onQuery: (value: string) => void;
  onSelect: (item: Item, shouldPosition: boolean) => void;
}) {
  const candidateListRef = useRef<HTMLDivElement>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!repositionSelected || !candidateListRef.current || !selectedRowRef.current) return;

    const rows = Array.from(selectedRowRef.current.parentElement?.children ?? []) as HTMLElement[];
    const fourthRowOffset = rows[3]?.offsetTop ?? 0;
    candidateListRef.current.scrollTop = Math.max(0, selectedRowRef.current.offsetTop - fourthRowOffset);
    onSelectedPositioned();
  }, [onSelectedPositioned, repositionSelected, selected?.item_id]);

  if (disabled) {
    return (
      <section className="icf flex min-h-0 flex-col gap-3 rounded-[18px] border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="ict text-base font-black">{title}</div>
          </div>
        </div>
        <div data-testid={`item-conversion-${kind}-guide`} className="icpnl flex min-h-[160px] flex-1 items-center justify-center rounded-[14px] border px-5 py-4 text-center text-sm font-bold">
          {emptyText}
        </div>
      </section>
    );
  }

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
      <div
        ref={candidateListRef}
        data-testid={`item-conversion-${kind}-candidate-list`}
        className="icpnl sg min-h-0 flex-1 overflow-y-auto rounded-[14px] border p-2"
      >
        {disabled || candidates.length === 0 ? (
          <div className="icm flex h-full min-h-[180px] items-center justify-center text-sm font-bold">
            {emptyText}
          </div>
        ) : (
          <div className="grid gap-2">
            {candidates.map((item) => {
              const isSelected = selected?.item_id === item.item_id;
              return (
                <button
                  key={item.item_id}
                  type="button"
                  data-testid={`item-conversion-${kind}-option-${item.item_id}`}
                  aria-pressed={isSelected}
                  ref={isSelected ? selectedRowRef : null}
                  onClick={() => onSelect(item, query.trim().length > 0)}
                  className={isSelected ? "ico ico-active" : "ico"}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black">{item.item_name}</span>
                    <span className="icm mt-0.5 block truncate text-xs font-bold">
                      {item.mes_code ?? "-"} · {formatQty(itemStock(item), item.unit)} · {item.bom_completed_at ? "BOM" : "확인 필요"}
                    </span>
                  </span>
                  {isSelected && <span className="ic-selected-mark">선택됨</span>}
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
  preview,
  memo,
  memoRequired,
  busy,
  error,
  canNext,
  onMemo,
  onNext,
}: {
  preview: ItemConversionPreview;
  memo: string;
  memoRequired: boolean;
  busy: boolean;
  error: string | null;
  canNext: boolean;
  onMemo: (value: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="item-conversion-preview">
      <PreviewSummary preview={preview} />
      <PreviewDifferencePanels preview={preview} />
      <div className="grid shrink-0 gap-3 lg:grid-cols-[minmax(0,1fr)_150px]">
        <label data-testid="item-conversion-memo-field" className="icf flex min-h-12 items-center gap-3 rounded-[14px] border px-4">
          <span className="icm shrink-0 text-sm font-black">
            메모 {memoRequired ? "(필수)" : "(선택)"}
          </span>
          <input
            data-testid="item-conversion-memo"
            value={memo}
            onChange={(event) => onMemo(event.target.value)}
            placeholder={memoRequired ? "사유 입력" : "선택 입력"}
            className="ict min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
          />
        </label>
        <button
          type="button"
          data-testid="item-conversion-execute-next-button"
          className={canNext ? buttonPrimary : buttonSecondary}
          disabled={!canNext || busy}
          onClick={onNext}
        >
          다음
        </button>
      </div>
      {!preview.executable && preview.blocking_reason && <ErrorNotice message={preview.blocking_reason} />}
      {error && <ErrorNotice message={error} />}
    </div>
  );
}

function ExecuteStep({
  preview,
  memo,
  busy,
  error,
  canExecute,
  onExecute,
}: {
  preview: ItemConversionPreview;
  memo: string;
  busy: boolean;
  error: string | null;
  canExecute: boolean;
  onExecute: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="item-conversion-execute-step">
      <PreviewDifferencePanels preview={preview} showItemContext />
      {error && <ErrorNotice message={error} />}
      <FinalExecutionBar
        preview={preview}
        memo={memo}
        busy={busy}
        canExecute={canExecute}
        onExecute={onExecute}
      />
    </div>
  );
}

function FinalExecutionBar({
  preview,
  memo,
  busy,
  canExecute,
  onExecute,
}: {
  preview: ItemConversionPreview;
  memo: string;
  busy: boolean;
  canExecute: boolean;
  onExecute: () => void;
}) {
  return (
    <div data-testid="item-conversion-final-confirmation" className="ic-execution-bar mt-auto shrink-0">
      <div className="ic-execution-memo">
        <span className="icm text-sm font-black">메모</span>
        <div className="ic-execution-memo-value">{memo.trim() || "-"}</div>
      </div>
      <button
        type="button"
        className={buttonPrimary}
        data-testid="item-conversion-confirm-button"
        disabled={busy || !canExecute}
        onClick={onExecute}
      >
        {busy ? "실행 중" : "전환 실행"}
      </button>
    </div>
  );
}

function PreviewSummary({ preview }: { preview: ItemConversionPreview }) {
  const status = preview.executable ? "실행 가능" : "확인 필요";

  return (
    <div className="icf shrink-0 rounded-[18px] border p-4">
      <div className="min-w-0">
        <div className="icm flex flex-wrap items-center gap-2 text-xs font-black">
          <span data-testid="item-conversion-mode-badge" className="rounded-full px-3 py-1 ic-blue-text">
            {preview.resolved_mode} · {conversionModeLabel(preview.resolved_mode)}
          </span>
          <span>{preview.lines.length}개 차이 · {status}</span>
        </div>
        <div className="mt-2 grid gap-2 text-sm font-bold lg:grid-cols-2">
          <div className="min-w-0">
            <div className="icm text-xs">기존 품목</div>
            <div className="ict truncate text-base font-black">{preview.source_item_name}</div>
            <div className="icm text-xs">{preview.source_mes_code ?? "-"}</div>
          </div>
          <div className="min-w-0">
            <div className="icm text-xs">대상 품목</div>
            <div className="ict truncate text-base font-black">{preview.target_item_name}</div>
            <div className="icm text-xs">{preview.target_mes_code ?? "-"}</div>
          </div>
        </div>
        <div className="icm mt-2 text-sm font-bold">전환 수량 · {formatQty(preview.quantity)}</div>
      </div>
    </div>
  );
}

function PreviewDifferencePanels({
  preview,
  showItemContext = false,
}: {
  preview: ItemConversionPreview;
  showItemContext?: boolean;
}) {
  if (preview.lines.length === 0) {
    return (
      <div className="icm flex min-h-0 flex-1 items-center justify-center rounded-[18px] border text-sm font-bold">
        변경되는 구성품이 없습니다. 기존 품목 차감과 대상 품목 입고만 처리합니다.
      </div>
    );
  }

  const consumeLines = preview.lines.filter((line) => line.line_kind === "consume" || line.total_delta > 0);
  const recoverLines = preview.lines.filter((line) => !consumeLines.includes(line));

  return (
    <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-2">
      <DifferencePanel
        title="기존 BOM에서 빠지는 구성"
        description="회수 입고"
        emptyText="회수할 구성품 없음"
        lines={recoverLines}
        kind="recover"
        context={showItemContext ? {
          label: "기존 품목",
          value: `${preview.source_item_name} · ${formatQty(preview.quantity)}`,
        } : undefined}
      />
      <DifferencePanel
        title="대상 BOM 때문에 필요한 구성"
        description="추가 차감"
        emptyText="추가 차감할 구성품 없음"
        lines={consumeLines}
        kind="consume"
        context={showItemContext ? {
          label: "대상 품목",
          value: `${preview.target_item_name} · ${formatQty(preview.quantity)}`,
        } : undefined}
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
  context,
}: {
  title: string;
  description: string;
  emptyText: string;
  lines: ItemConversionPreview["lines"];
  kind: "consume" | "recover";
  context?: { label: string; value: string };
}) {
  return (
    <section className="icf flex min-h-0 flex-col rounded-[18px] border p-4">
      <div className="shrink-0">
        {context ? (
          <>
            <div className="icm text-xs font-black">{context.label}</div>
            <div className="ict mt-1 line-clamp-2 text-lg font-black">{context.value}</div>
          </>
        ) : (
          <>
            <div className="ict text-lg font-black">{title}</div>
            <div className="icm mt-1 text-xs font-bold">{description}</div>
          </>
        )}
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
