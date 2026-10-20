"use client";
import { useDesktopWorkGuard } from "../DesktopTabHome";

import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, Trash2 } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { Item, ProductModel } from "../_warehouse_v2/types";
import { itemDepartment } from "../_warehouse_v2/itemPickerShared";
import { DefectItemPicker } from "./DefectItemPicker";
import { ReasonFormFields } from "./ReasonFormFields";
import { ConfirmModal } from "@/lib/ui";
import { DisassembleTree, toServerDecision, validateDecisionTree, type ChildDecision } from "./DisassembleTree";
import { QuantityInput } from "../common/QuantityInput";
import { DefectManagementCategoryControl } from "./DefectManagementCategoryControl";
import type { DefectManagementCategory } from "@/lib/api/types/defects";
import { makeClientRequestId } from "@/lib/uuid";
import { queryKeys } from "@/lib/queries/keys";
import { defectCartLineErrors, defectSourceStock, OTHER_REASON_MEMO_REQUIRED_MESSAGE } from "./defectCartValidation";
import { DefectQuantitySummary } from "./DefectQuantitySummary";
import { formatQty } from "@/lib/mes/format";
import { MAX_QUARANTINE_LINES, groupDefectCartLines, insertDefectCartLine, defectCartGroupErrors } from "./defectCartGroups";
import quarantineConfirmStyles from "./DefectQuarantineConfirm.module.css";
import { DefectFlowStepper } from "./DefectFlowStepper";

type SourceKind = "warehouse" | "production";
type DirectAction = "scrap" | "rework";
type FlowStep = 2 | 3 | 4;

type CartHistoryState = { defect?: string; mode?: DefectCartMode; step?: number; directAction?: DirectAction | null; source?: SourceKind; workChoiceDepth?: number } | null;

export type DefectCartMode = "add" | "scrap";

interface CartLine {
  key: string;
  item: Item;
  qty: string;
  category: string;
  categoryId: string | null;
  memo: string;
  managementCategory: DefectManagementCategory;
  decisions: ChildDecision[];
  parentNormalQty?: number;
}

interface LineFailure {
  key: string;
  itemName: string;
  message: string;
}

interface Props {
  mode: DefectCartMode;
  initialAction?: DirectAction;
  initialSource?: SourceKind;
  items: Item[];
  productModels: ProductModel[];
  currentEmployee: { employee_id: string; name: string; department: string };
  onDone: (directAction: DirectAction | null) => void;
  /** 새로고침으로 화면 단계가 바뀌어도 목표 화면까지의 실제 이력 거리를 전달한다. */
  onCancel: (historyDepth: number) => void;
  itemPickerFullscreen?: boolean;
  onItemPickerFullscreenChange?: (fullscreen: boolean) => void;
}

/** 오래된 이력은 원래 단계에서 거리를 추정하고 이후에는 저장된 실제 거리를 유지한다. */
function workChoiceHistoryDepth(state: CartHistoryState): number {
  const storedDepth = state?.workChoiceDepth;
  return typeof storedDepth === "number" && Number.isInteger(storedDepth) && storedDepth > 0
    ? storedDepth
    : state?.step === 4 ? 3 : state?.step === 3 ? 2 : 1;
}

function isReworkCandidate(item: Item): boolean {
  return item.has_bom === true;
}

function managementCategoryLabel(category: DefectManagementCategory): string {
  return category === "B_GRADE" ? "B급" : category === "OBSOLETE" ? "구형" : "불량";
}

export function DefectCartFlow({
  mode,
  initialAction = "scrap",
  initialSource = "production",
  items,
  productModels,
  currentEmployee,
  onDone,
  onCancel,
  itemPickerFullscreen = false,
  onItemPickerFullscreenChange,
}: Props): JSX.Element {
  const queryClient = useQueryClient();
  const [directAction, setDirectAction] = useState<DirectAction>(mode === "add" ? "scrap" : initialAction);
  const [source, setSource] = useState<SourceKind>(initialAction === "rework" ? "production" : initialSource);
  const [step, setStep] = useState<FlowStep>(2);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [requestIds, setRequestIds] = useState<Record<string, string>>({});
  const [batchRequestId, setBatchRequestId] = useState(() => makeClientRequestId());
  const submissionIdRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<LineFailure[]>([]);
  const [batchError, setBatchError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<0 | 1 | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const quantityRefs = useRef(new Map<string, HTMLInputElement>());
  const pendingFocusRef = useRef<{ key?: string; itemId?: string } | null>(null);
  useDesktopWorkGuard("defect-cart", lines.length > 0, busy);

  useEffect(() => {
    function restore(state: CartHistoryState, restoreInputs: boolean): void {
      const validCart = state?.defect === "cart" && state.mode === mode;
      const nextAction = mode === "add" ? "scrap" : validCart && (state.directAction === "rework" || state.directAction === "scrap") ? state.directAction : initialAction;
      const nextSource = nextAction === "rework" ? "production" : validCart && (state.source === "warehouse" || state.source === "production") ? state.source : initialSource;
      const nextStep: FlowStep = restoreInputs && state?.step === 4 && nextAction === "rework" ? 4 : restoreInputs && state?.step === 3 ? 3 : 2;
      const workChoiceDepth = workChoiceHistoryDepth(state);
      setDirectAction(nextAction);
      setSource(nextSource);
      setStep(nextStep);
      if (!validCart || state?.step !== nextStep || state?.directAction !== nextAction || state?.source !== nextSource || state?.workChoiceDepth !== workChoiceDepth) {
        window.history.replaceState({ ...(window.history.state ?? {}), defect: "cart", mode, step: nextStep, directAction: nextAction, source: nextSource, workChoiceDepth }, "");
      }
    }

    setLines([]);
    setBatchError("");
    submissionIdRef.current = null;
    restore(window.history.state as CartHistoryState, false);
    function onPop(e: PopStateEvent): void {
      const s = e.state as CartHistoryState;
      if (s?.defect !== "cart" || s.mode !== mode) {
        return;
      }
      setConfirmOpen(false);
      setLeaveTarget(null);
      restore(s, true);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [mode, initialAction, initialSource]);

  useEffect(() => { headingRef.current?.focus(); }, [step]);
  useEffect(() => {
    if (step !== 2) onItemPickerFullscreenChange?.(false);
  }, [step, onItemPickerFullscreenChange]);
  useEffect(() => () => onItemPickerFullscreenChange?.(false), [onItemPickerFullscreenChange]);
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    if (pending.key) {
      const input = quantityRefs.current.get(pending.key);
      input?.focus();
      input?.select();
    } else {
      Array.from(document.querySelectorAll<HTMLButtonElement>("[data-defect-picker-button]"))
        .find((button) => button.dataset.defectPickerButton === pending.itemId)?.focus();
    }
  }, [lines]);

  const isDirect = mode === "scrap";
  const isRework = isDirect && directAction === "rework";
  const isScrap = isDirect && directAction === "scrap";
  useEffect(() => {
    if (isRework && source !== "production") setSource("production");
  }, [isRework, source]);

  const title = mode === "add" ? "불량 격리" : directAction === "rework" ? "즉시 재작업" : directAction === "scrap" ? "즉시 폐기" : "즉시 처리";
  const submitLabel = mode === "add" ? "격리하기" : isRework ? "즉시 재작업" : "즉시 폐기";
  const pickerItems = isRework ? items.filter(isReworkCandidate) : items;
  const selectedIds = useMemo(() => new Set(lines.map((l) => l.item.item_id)), [lines]);
  const groups = useMemo(() => groupDefectCartLines(lines), [lines]);
  const groupErrors = useMemo(() => defectCartGroupErrors(groups, source), [groups, source]);
  const atLineLimit = mode === "add" && lines.length >= MAX_QUARANTINE_LINES;
  const reworkLineReady = Boolean(
    isRework && lines.length > 0 && groupErrors.size === 0
      && lines.every((line) => defectCartLineErrors({ ...line, source }).length === 0),
  );

  function newLine(item: Item): CartLine {
    return { key: makeClientRequestId(), item, qty: "1", category: "", categoryId: null, memo: "", managementCategory: "DEFECT", decisions: [] };
  }

  /** 기존 사유를 유지하고 새 사유만 빈 값으로 추가한다. */
  function addReason(item: Item): void {
    if (busy || atLineLimit) return;
    if (source === "production" && itemDepartment(item) === null) return;
    const line = newLine(item);
    setRequestIds((ids) => ({ ...ids, [line.key]: makeClientRequestId() }));
    setBatchRequestId(makeClientRequestId());
    pendingFocusRef.current = { key: line.key };
    setLines((prev) => isRework && !prev.some((entry) => entry.item.item_id === item.item_id) ? [line] : insertDefectCartLine(prev, line));
    setFailures([]);
    setBatchError("");
  }

  function addItem(item: Item): void {
    if (selectedIds.has(item.item_id) || defectSourceStock(item, source).available <= 0) return;
    addReason(item);
  }

  function updateLine(key: string, patch: Partial<Omit<CartLine, "key" | "item">>): void {
    if (busy) return;
    setBatchError("");
    setBatchRequestId(makeClientRequestId());
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string): void {
    if (busy) return;
    setBatchError("");
    const removed = lines.find((line) => line.key === key);
    if (removed) {
      const siblings = lines.filter((line) => line.item.item_id === removed.item.item_id);
      const index = siblings.findIndex((line) => line.key === key);
      const adjacent = siblings[index + 1] ?? siblings[index - 1];
      pendingFocusRef.current = adjacent ? { key: adjacent.key } : { itemId: removed.item.item_id };
    }
    setLines((prev) => prev.filter((l) => l.key !== key));
    setRequestIds((ids) => {
      const next = { ...ids };
      delete next[key];
      return next;
    });
    setBatchRequestId(makeClientRequestId());
  }

  function removeItemById(item: Item): void {
    if (busy) return;
    setBatchError("");
    const removedKeys = new Set(lines.filter((line) => line.item.item_id === item.item_id).map((line) => line.key));
    setRequestIds((ids) => {
      const next = { ...ids };
      removedKeys.forEach((key) => { delete next[key]; });
      return next;
    });
    setBatchRequestId(makeClientRequestId());
    setLines((prev) => prev.filter((line) => line.item.item_id !== item.item_id));
  }

  function copyReasonDown(index: number): void {
    if (busy) return;
    setBatchRequestId(makeClientRequestId());
    setLines((prev) => {
      const src = prev[index];
      if (!src) return prev;
      return prev.map((l, i) => i > index ? { ...l, category: src.category, categoryId: src.categoryId, memo: src.memo } : l);
    });
  }

  const lineErrorsByKey = useMemo(
    () => new Map(lines.map((line) => [line.key, defectCartLineErrors({ ...line, source })])),
    [lines, source],
  );

  const allValid =
    directAction !== null &&
    lines.length > 0 &&
    groupErrors.size === 0 &&
    (mode !== "add" || lines.length <= MAX_QUARANTINE_LINES) &&
    lines.every((l) => {
      if ((lineErrorsByKey.get(l.key)?.length ?? 0) > 0) return false;
      if (!isRework) return true;
      return l.decisions.length > 0 && validateDecisionTree(l.decisions);
    });

  function quarantinePayload(line: CartLine, requestId: string) {
    const qty = Number(line.qty);
    const productionDepartment = itemDepartment(line.item);
    if (source === "production" && !productionDepartment) throw new Error("품목 담당 부서를 확인할 수 없습니다.");
    return {
      item_id: line.item.item_id,
      qty,
      source,
      ...(source === "production" ? { source_dept: productionDepartment!, target_dept: productionDepartment! } : { target_dept: "창고" }),
      reason_category: line.category || null,
      reason_category_id: line.categoryId,
      submission_id: submissionIdRef.current ?? batchRequestId,
      reason_memo: line.memo || null,
      actor_employee_id: currentEmployee.employee_id,
      client_request_id: requestId,
      management_category: line.managementCategory,
    };
  }

  async function submitLine(line: CartLine, requestId: string): Promise<void> {
    const qty = Number(line.qty);
    const productionDepartment = itemDepartment(line.item);
    if (source === "production" && !productionDepartment) throw new Error("품목 담당 부서를 확인할 수 없습니다.");
    if (mode === "add") {
      await defectsApi.quarantine(quarantinePayload(line, requestId));
      return;
    }

    await stockRequestsApi.createStockRequest({
      requester_employee_id: currentEmployee.employee_id,
      request_type: isRework ? "rework_normal" : "scrap_normal",
      reason_category: line.category || null,
      reason_category_id: line.categoryId,
      submission_id: submissionIdRef.current ?? batchRequestId,
      reason_memo: line.memo || null,
      notes: isRework
        ? JSON.stringify({ child_decisions: line.decisions.map(toServerDecision) })
        : line.memo || null,
      client_request_id: requestId,
      lines: [
        {
          item_id: line.item.item_id,
          quantity: qty,
          from_bucket: source === "warehouse" ? "warehouse" : "production",
          ...(source === "production" ? { from_department: productionDepartment! } : {}),
          to_bucket: "none",
        },
      ],
    });
  }

  async function handleSubmit() {
    if (!allValid || busy) return;
    submissionIdRef.current ??= batchRequestId;
    setBusy(true);
    setFailures([]);
    setBatchError("");
    if (mode === "add" && lines.length > 1) {
      try {
        await defectsApi.quarantineBulk({
          actor_employee_id: currentEmployee.employee_id,
          client_request_id: batchRequestId,
          submission_id: submissionIdRef.current,
          lines: lines.map((line) => {
            const { actor_employee_id: _actorEmployeeId, client_request_id: _clientRequestId, ...payload } = quarantinePayload(
              line,
              requestIds[line.key] ?? makeClientRequestId(),
            );
            return payload;
          }),
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
        setBusy(false);
        onDone(directAction);
      } catch (error) {
        const message = error instanceof Error ? error.message : "처리 실패";
        setBatchError(message);
        setBusy(false);
      }
      return;
    }

    const results = await Promise.allSettled(
      lines.map((line) => submitLine(line, requestIds[line.key] ?? makeClientRequestId())),
    );
    const nextFailures: LineFailure[] = [];
    const failedKeys = new Set<string>();
    results.forEach((res, i) => {
      if (res.status === "rejected") {
        const line = lines[i];
        failedKeys.add(line.key);
        nextFailures.push({
          key: line.key,
          itemName: line.item.item_name,
          message: res.reason instanceof Error ? res.reason.message : "처리 실패",
        });
      }
    });
    setBusy(false);
    if (nextFailures.length === 0) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
      onDone(directAction);
      return;
    }
    if (mode === "add") {
      setBatchError(nextFailures[0].message);
      return;
    }
    setLines((prev) => prev.filter((l) => failedKeys.has(l.key)));
    setFailures(nextFailures);
    const currentHistory = window.history.state as CartHistoryState;
    if (currentHistory?.defect === "cart" && currentHistory.mode === mode && currentHistory.step === 4) window.history.back();
  }

  function pushStep(nextStep: FlowStep, nextAction: DirectAction = directAction, nextSource: SourceKind = source): void {
    if (busy || nextStep !== step + 1 || (nextStep === 3 ? lines.length === 0 : !isRework || !reworkLineReady)) return;
    const workChoiceDepth = workChoiceHistoryDepth(window.history.state as CartHistoryState) + 1;
    window.history.pushState({ defect: "cart", mode, step: nextStep, directAction: nextAction, source: nextSource, workChoiceDepth }, "");
    setStep(nextStep);
  }

  /** 메뉴는 작업 선택보다 한 칸 앞이므로 새로고침 후에도 저장된 이력 거리에 한 칸을 더한다. */
  function leaveCart(target: 0 | 1): void {
    onCancel(workChoiceHistoryDepth(window.history.state as CartHistoryState) + (target === 0 ? 1 : 0));
  }

  function goToStep(target: 0 | 1 | 2 | 3): void {
    if (busy) return;
    if (target === 2 || target === 3) {
      if (target < step) window.history.go(target - step);
      return;
    }
    if (lines.length > 0) {
      setLeaveTarget(target);
      return;
    }
    leaveCart(target);
  }

  return (
    <div className={`flex h-full min-h-0 flex-col ${step === 2 ? "gap-2" : "gap-3"} overflow-hidden`}>
      <h2 ref={headingRef} tabIndex={-1} className="sr-only">{title}</h2>
      {!(step === 2 && itemPickerFullscreen) && <DefectFlowStepper action={mode === "add" ? "add" : directAction} source={source} currentStep={step} busy={busy} onMenuSelect={() => goToStep(0)} onStepSelect={goToStep} />}

      {step === 2 && (
        <div key="step2" className="animate-desktop-navigation-enter flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div data-testid="defect-step2-grid" className="flex min-h-0 flex-1">
            <div data-testid="defect-picker-pane" className="h-full min-h-0 min-w-0 flex-1">
              <DefectItemPicker
                items={pickerItems}
                productModels={productModels}
                source={source}
                selectedIds={selectedIds}
                onAdd={addItem}
                onRemove={removeItemById}
                disabled={busy}
                addingDisabled={atLineLimit}
                fullscreen={itemPickerFullscreen}
                onFullscreenChange={onItemPickerFullscreenChange}
              />
            </div>
          </div>
          <button type="button" onClick={() => pushStep(3)} disabled={groups.length === 0 || busy}
            className="flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-[14px] px-6 py-3 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50" style={{ background: LEGACY_COLORS.blue }}>
            <span aria-hidden="true">선택 {groups.length}품목</span><span>수량·처리 정보 →</span>
          </button>
        </div>
      )}

      {step === 3 && (
        <div key="step3" className="animate-desktop-navigation-enter flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <fieldset disabled={busy} data-testid="defect-cart-panel" className="m-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-[16px] border p-0" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
                {batchError && <p role="alert" className="px-3 pt-3 text-sm font-bold" style={{ color: LEGACY_COLORS.red }}>{batchError}</p>}
                {lines.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm font-bold" style={{ color: LEGACY_COLORS.muted }}>
                    선택한 품목이 없습니다. 품목 선택 단계에서 추가하세요.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 p-3">
                  {mode === "add" ? groups.map((group) => (
                    <div key={group.item.item_id} data-testid="defect-quarantine-item-group" data-item-id={group.item.item_id}
                      className="flex flex-col overflow-hidden rounded-[12px] border" style={{ background: LEGACY_COLORS.s1, borderColor: groupErrors.has(group.item.item_id) ? tint(LEGACY_COLORS.red, 30) : LEGACY_COLORS.border }}>
                      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                        <div className="min-w-0 flex-1 basis-[240px]">
                          <div className="break-words text-2xl font-black leading-snug" style={{ color: LEGACY_COLORS.text }}>{group.item.item_name}</div>
                          <div className="mt-1 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{group.item.mes_code ?? "(코드 없음)"} · {source === "warehouse" ? "창고" : itemDepartment(group.item) ?? "부서 미지정"}</div>
                        </div>
                        <DefectQuantitySummary availableLabel={source === "warehouse" ? "창고 가용 재고" : "부서 가용 재고"}
                          available={defectSourceStock(group.item, source).available} total={group.totalQuantity} count={group.lines.length} unit={group.item.unit || "EA"} />
                      </div>
                      {groupErrors.has(group.item.item_id) && <p className="px-3 pb-2 text-sm font-bold" style={{ color: LEGACY_COLORS.red }}>{groupErrors.get(group.item.item_id)}</p>}
                      {group.lines.map((line, index) => {
                        const validationErrors = lineErrorsByKey.get(line.key) ?? [];
                        return <fieldset key={line.key} disabled={busy} data-testid="defect-quarantine-reason-line" role="group" aria-label={`${group.item.item_name} 사유 ${index + 1}`}
                          className="flex min-w-0 flex-col gap-3 border-0 border-t border-solid px-3 py-3" style={{ borderTopColor: LEGACY_COLORS.border }}>
                          <ReasonFormFields employeeId={currentEmployee.employee_id} category={line.category} categoryId={line.categoryId} memo={line.memo}
                            categoryPlaceholder="사유 카테고리를 선택하세요."
                            onCategoryChange={(name, id) => updateLine(line.key, { category: name, categoryId: id ?? null })} onMemoChange={(memo) => updateLine(line.key, { memo })} required
                            quarantineControls={{
                              quantity: <div className="flex min-w-0 flex-col gap-1">
                                <label className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }} htmlFor={`defect-qty-${line.key}`}>수량</label>
                                <QuantityInput id={`defect-qty-${line.key}`} aria-label="수량" ref={(element) => { if (element) quantityRefs.current.set(line.key, element); else quantityRefs.current.delete(line.key); }}
                                  min={0} step="1" value={line.qty} onChange={(event) => updateLine(line.key, { qty: event.target.value, decisions: [], parentNormalQty: undefined })} placeholder="예: 3"
                                  className="h-11 min-h-11 w-20 rounded-[10px] border px-2 text-sm font-bold outline-none focus-visible:ring-2" />
                              </div>,
                              management: <DefectManagementCategoryControl fullWidth value={line.managementCategory} onChange={(managementCategory) => updateLine(line.key, { managementCategory })} />,
                              add: index === group.lines.length - 1 ? <button type="button" disabled={busy || atLineLimit} onClick={() => addReason(group.item)}
                                className="standard-hover flex min-h-11 items-center justify-center gap-1 rounded-[10px] border px-1 text-xs font-bold outline-none focus-visible:ring-2 disabled:opacity-50" style={{ color: LEGACY_COLORS.blue, borderColor: LEGACY_COLORS.blue, background: tint(LEGACY_COLORS.blue, 8) }}><Plus className="h-4 w-4 shrink-0" />다른 사유 추가</button> : undefined,
                              remove: <button type="button" disabled={busy} onClick={() => removeLine(line.key)} aria-label={`${group.item.item_name} 사유 ${index + 1} 삭제`}
                                className="standard-hover no-btn-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] disabled:opacity-50" style={{ color: LEGACY_COLORS.red, background: tint(LEGACY_COLORS.red, 10) }}><Trash2 className="h-4 w-4" /></button>,
                            }} />
                          {validationErrors.filter((message) => message !== "사유 카테고리를 선택하세요." && message !== OTHER_REASON_MEMO_REQUIRED_MESSAGE).map((message) => <div key={message} className="text-sm font-bold" style={{ color: LEGACY_COLORS.red }}>{message}</div>)}
                        </fieldset>;
                      })}
                    </div>
                  )) : lines.map((line, idx) => {
                    const fail = failures.find((f) => f.key === line.key);
                    const validationErrors = lineErrorsByKey.get(line.key) ?? [];
                    const reasonIndex = lines.slice(0, idx).filter((entry) => entry.item.item_id === line.item.item_id).length;
                    const lastReason = lines[idx + 1]?.item.item_id !== line.item.item_id;
                    const group = groups.find((entry) => entry.item.item_id === line.item.item_id)!;
                    return (
                      <div key={line.key} className="flex flex-col gap-2 rounded-[12px] border px-3 py-2" style={{ background: LEGACY_COLORS.s1, borderColor: fail || validationErrors.length > 0 ? tint(LEGACY_COLORS.red, 30) : LEGACY_COLORS.border }}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0 flex-1 basis-[240px]">
                            <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{line.item.mes_code ?? "(코드 없음)"}</div>
                            <div className="break-words text-2xl font-black" style={{ color: LEGACY_COLORS.text }}>{line.item.item_name}</div>
                            <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>부서 · {source === "warehouse" ? "창고" : itemDepartment(line.item) ?? "부서 미지정"}</div>
                          </div>
                          {reasonIndex === 0 && <DefectQuantitySummary availableLabel={source === "warehouse" ? "창고 가용 재고" : "부서 가용 재고"}
                            available={defectSourceStock(line.item, source).available} total={group.totalQuantity} count={group.lines.length} unit={line.item.unit || "EA"} />}
                        </div>

                        <ReasonFormFields employeeId={currentEmployee.employee_id} category={line.category} categoryId={line.categoryId} memo={line.memo} onCategoryChange={(name, id) => updateLine(line.key, { category: name, categoryId: id ?? null })} onMemoChange={(m) => updateLine(line.key, { memo: m })} categoryPlaceholder="사유 카테고리를 선택하세요." required
                          quarantineControls={{
                            quantity: <div className="flex min-w-0 flex-col gap-1">
                              <label htmlFor={`defect-qty-${line.key}`} className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>수량</label>
                              <QuantityInput id={`defect-qty-${line.key}`} aria-label="수량" ref={(element) => { if (element) quantityRefs.current.set(line.key, element); else quantityRefs.current.delete(line.key); }} min={0} step="1" value={line.qty} onChange={(e) => updateLine(line.key, { qty: e.target.value, decisions: [], parentNormalQty: undefined })} placeholder="예: 3" className="h-11 min-h-11 w-20 rounded-[10px] border px-2 text-sm font-bold" />
                            </div>,
                            add: lastReason ? <button type="button" disabled={busy} onClick={() => addReason(line.item)}
                              className="standard-hover flex min-h-11 items-center justify-center gap-1 rounded-[10px] border px-1 text-xs font-bold outline-none focus-visible:ring-2 disabled:opacity-50" style={{ color: LEGACY_COLORS.blue, borderColor: LEGACY_COLORS.blue, background: tint(LEGACY_COLORS.blue, 8) }}><Plus className="h-4 w-4 shrink-0" />다른 사유 추가</button> : undefined,
                            remove: <button type="button" disabled={busy} onClick={() => removeLine(line.key)} aria-label={`${line.item.item_name} 사유 ${reasonIndex + 1} 삭제`}
                              className="standard-hover no-btn-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] transition-colors disabled:opacity-50" style={{ color: LEGACY_COLORS.red, background: tint(LEGACY_COLORS.red, 10) }}><Trash2 className="h-4 w-4" /></button>,
                          }} />
                          {idx < lines.length - 1 && (line.category || line.memo) && !isRework && (
                            <button type="button" onClick={() => copyReasonDown(idx)} className="ml-auto flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: LEGACY_COLORS.blue }}>
                              <Copy className="h-3 w-3" />
                              위 사유 복사
                            </button>
                          )}

                        {fail && <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>실패: {fail.message}</div>}
                        {lastReason && groupErrors.has(line.item.item_id) && <div className="text-sm font-bold" style={{ color: LEGACY_COLORS.red }}>{groupErrors.get(line.item.item_id)}</div>}
                        {validationErrors.filter((message) => message !== "사유 카테고리를 선택하세요." && message !== OTHER_REASON_MEMO_REQUIRED_MESSAGE).map((message) => (
                          <div key={message} className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>{message}</div>
                        ))}
                      </div>
                    );
                  })}
                  </div>
                )}
              </fieldset>

          <div className="flex shrink-0 items-center justify-between gap-2 pt-1">
            {atLineLimit ? (
              <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>한 번에 사유 {MAX_QUARANTINE_LINES}건까지 등록할 수 있습니다.</span>
            ) : failures.length > 0 ? (
              <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>{failures.length}건 실패 — 남은 줄을 확인 후 다시 제출하세요.</span>
            ) : null}
            {isRework ? (
              <button type="button" onClick={() => pushStep(4)} disabled={!reworkLineReady || busy} className="ml-auto min-h-11 flex-1 rounded-[14px] px-6 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50" style={{ background: LEGACY_COLORS.blue }}>
                BOM 확인 →
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmOpen(true)} disabled={!allValid || busy} className="ml-auto min-h-11 flex-1 rounded-[14px] px-6 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50" style={{ background: LEGACY_COLORS.redSolid }}>
                {busy ? "처리 중..." : `${submitLabel} (${lines.length}건) →`}
              </button>
            )}
          </div>
        </div>
      )}

      {step === 4 && isRework && lines.length > 0 && (
        <div key="step4" className="animate-desktop-navigation-enter flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {groups.map((group) => <div key={group.item.item_id} className="flex shrink-0 flex-wrap items-center gap-3 rounded-[16px] border px-5 py-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
            <div className="min-w-0 flex-1 basis-[240px]">
              <div className="break-words text-2xl font-black" style={{ color: LEGACY_COLORS.text }}>{group.item.item_name}</div>
              <div className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{group.item.mes_code}</div>
            </div>
            <DefectQuantitySummary availableLabel="부서 가용 재고" available={defectSourceStock(group.item, source).available} total={group.totalQuantity} count={group.lines.length} unit={group.item.unit || "EA"} />
          </div>)}
          {lines.map((line, index) => <section key={line.key} className={`flex min-w-0 flex-col gap-3 ${lines.length === 1 ? "min-h-0 flex-1" : "shrink-0"}`}>
          <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-stretch rounded-[16px] border px-5 py-4" style={{ background: tint(LEGACY_COLORS.blue, 8), borderColor: tint(LEGACY_COLORS.blue, 35) }}>
            <div className="min-w-0">
              <div className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>품목</div>
              <div className="truncate text-base font-black" style={{ color: LEGACY_COLORS.text }}>
                {line.item.mes_code} {line.item.item_name}
              </div>
            </div>
            <div className="mx-6 w-px" style={{ background: tint(LEGACY_COLORS.blue, 35) }} />
            <div className="flex items-center gap-8">
              <div>
                <div className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>처리 수량</div>
                <div className="text-2xl font-black" style={{ color: LEGACY_COLORS.blue }}>{line.qty}</div>
              </div>
              <div>
                <div className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>사유 {index + 1}</div>
                <div className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{line.category}</div>
                {line.memo && <div className="mt-1 break-words text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{line.memo}</div>}
              </div>
            </div>
          </div>

          <fieldset disabled={busy} aria-label={`${line.item.item_name} 사유 ${index + 1} BOM`} className="m-0 flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto rounded-[16px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <div className="text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>BOM 재작업 트리</div>
            <DisassembleTree
              parentItemId={line.item.item_id}
              parentItemName={line.item.item_name}
              parentMesCode={line.item.mes_code ?? ""}
              parentQty={Number(line.qty) || 0}
              parentNormalQty={line.parentNormalQty ?? (Number(line.qty) || 0)}
              onParentNormalQtyChange={(parentNormalQty) => updateLine(line.key, { parentNormalQty })}
              parentDept={source === "warehouse" ? "창고" : itemDepartment(line.item) ?? "부서 미지정"}
              decisions={line.decisions}
              onChange={(decisions) => updateLine(line.key, { decisions })}
            />
          </fieldset>
          </section>)}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 pt-1">
            <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              격리·폐기를 입력하면 정상 수량이 자동으로 줄어듭니다.
            </span>
            <button type="button" onClick={() => setConfirmOpen(true)} disabled={!allValid || busy} className="rounded-[14px] px-6 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50" style={{ background: LEGACY_COLORS.redSolid }}>
              {busy ? "처리 중..." : `${submitLabel} (${lines.length}건) →`}
            </button>
          </div>
        </div>
      )}

      <ConfirmModal open={leaveTarget !== null} onClose={() => setLeaveTarget(null)} onConfirm={() => { if (busy || leaveTarget === null) return; const target = leaveTarget; setLeaveTarget(null); leaveCart(target); }} title={leaveTarget === 0 ? "불량 메뉴로 돌아갈까요?" : "작업 선택으로 돌아갈까요?"} confirmLabel="나가기" tone="danger">
        담은 품목과 입력 내용이 사라집니다.
      </ConfirmModal>
      <ConfirmModal open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); void handleSubmit(); }} tone={isScrap || isRework ? "danger" : "normal"} title={isRework ? "즉시 재작업 확인" : isScrap ? "즉시 폐기 확인" : "불량 격리 확인"} confirmLabel={submitLabel} busy={busy} busyLabel="처리 중..." wide={mode === "add"} className={mode === "add" ? quarantineConfirmStyles.modal : undefined}>
        {isRework && (
          <p className="mb-3 text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
            선택한 품목을 즉시 재작업하고 하위 품목을 정상·격리·폐기로 나눕니다.
          </p>
        )}
        {mode === "add" ? (
          <div className={`sg flex flex-col gap-3 overflow-y-auto pr-1 ${quarantineConfirmStyles.content}`}>
            {groups.map((group) => (
              <div
                key={group.item.item_id}
                data-testid="defect-confirm-item-group"
                className={`shrink-0 rounded-[14px] border px-4 py-3 ${quarantineConfirmStyles.itemGroup}`}
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="break-words text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{group.item.item_name}</div>
                    <div className="mt-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{group.item.mes_code ?? "코드 없음"} · {source === "warehouse" ? "창고" : itemDepartment(group.item) ?? "부서 미지정"}</div>
                  </div>
                  <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.blue }}>총 {group.totalQuantity ?? "—"} {group.item.unit || "EA"} · {group.lines.length}건</span>
                </div>
                <table className={quarantineConfirmStyles.table} aria-label={`${group.item.item_name} 격리 사유`}>
                  <colgroup>
                    <col className={quarantineConfirmStyles.quantityColumn} />
                    <col className={quarantineConfirmStyles.categoryColumn} />
                    <col className={quarantineConfirmStyles.managementColumn} />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">수량</th>
                      <th scope="col">사유 카테고리</th>
                      <th scope="col">보관 분류</th>
                      <th scope="col">메모</th>
                    </tr>
                  </thead>
                  {group.lines.map((line, index) => <tbody key={line.key} data-testid="defect-confirm-line" role="group" aria-label={`${group.item.item_name} 사유 ${index + 1}`}>
                    <tr>
                      <td data-label="수량" className="font-bold">{line.qty} {line.item.unit || "EA"}</td>
                      <td data-label="사유 카테고리">{line.category}</td>
                      <td data-label="보관 분류" className="font-bold" style={{ color: LEGACY_COLORS.red }}>{managementCategoryLabel(line.managementCategory)}</td>
                      <td data-label="메모" className={quarantineConfirmStyles.memo}>{line.memo || <span aria-label="메모 없음">—</span>}</td>
                    </tr>
                  </tbody>)}
                </table>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {lines.map((line) => (
              <div
                key={line.key}
                data-testid="defect-confirm-line"
                className="rounded-[14px] border px-4 py-3"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              >
                <div className="truncate text-base font-black" style={{ color: LEGACY_COLORS.text }}>
                  {line.item.item_name}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  <span>수량 {line.qty}</span>
                  <span aria-hidden="true">·</span>
                  <span>{source === "warehouse" ? "창고" : itemDepartment(line.item) ?? "부서 미지정"}</span>
                </div>
                <div className="mt-2 break-words text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>{line.category}</div>
                {line.memo && <div className="mt-1 whitespace-pre-wrap break-words text-sm" style={{ color: LEGACY_COLORS.muted2 }}>{line.memo}</div>}
              </div>
            ))}
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}
