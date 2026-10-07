"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { Building2, Copy, Trash2, Warehouse, Wrench } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { Item, ProductModel } from "../../_warehouse_v2/types";
import { QuantityStepper } from "../../_warehouse_v2/QuantityStepper";
import quantityCartStyles from "../warehouse/MobileIoQuantityCart.module.css";
import { itemDepartment } from "../../_warehouse_v2/itemPickerShared";
import type { DefectCartMode } from "../../_defect_hub/DefectCartFlow";
import { DefectItemPicker } from "../../_defect_hub/DefectItemPicker";
import { ReasonFormFields } from "../../_defect_hub/ReasonFormFields";
import {
  toServerDecision,
  validateDecisionTree,
  type ChildDecision,
} from "../../_defect_hub/DisassembleTree";
import { ConfirmModal } from "@/lib/ui";
import { makeClientRequestId } from "@/lib/uuid";
import type { DefectManagementCategory } from "@/lib/api/types/defects";
import { DefectManagementCategoryControl } from "../../_defect_hub/DefectManagementCategoryControl";
import { defectCartLineErrors, defectSourceStock } from "../../_defect_hub/defectCartValidation";
import { queryKeys } from "@/lib/queries/keys";
import { TYPO } from "../tokens";
import panelStyles from "./mobileWarehousePanels.module.css";
import presentation from "../mobilePresentation.module.css";
import { MobileDefectStepHeader } from "./MobileDefectStepHeader";
import { MobileReworkWorkspace } from "../rework/MobileReworkWorkspace";
import type { MobileReworkMemory } from "../rework/useMobileReworkWorkspace";
import {
  PrimaryActionButton,
  StickyFooter,
} from "../primitives";

type SourceKind = "warehouse" | "production";
type DirectAction = "scrap" | "rework";
type FlowStep = 1 | 2 | 3 | 4;
type CartHistoryState = { defect?: string; mode?: DefectCartMode; step?: number; directAction?: DirectAction | null; source?: SourceKind } | null;

interface CartLine {
  key: string;
  item: Item;
  qty: number;
  category: string;
  categoryId: string | null;
  memo: string;
  managementCategory: DefectManagementCategory;
  decisions: ChildDecision[];
}

interface LineFailure {
  key: string;
  itemName: string;
  message: string;
}

function hasKnownBom(item: Item): boolean {
  return item.has_bom === true;
}

function titleFor(mode: DefectCartMode, directAction: DirectAction | null): string {
  if (mode === "add") return "불량 격리";
  if (directAction === "rework") return "바로 재작업";
  if (directAction === "scrap") return "바로 폐기";
  return "바로 처리";
}

function submitLabelFor(mode: DefectCartMode, directAction: DirectAction | null): string {
  if (mode === "add") return "격리하기";
  if (directAction === "rework") return "즉시 재작업";
  return "즉시 폐기";
}

function managementCategoryLabel(category: DefectManagementCategory): string {
  return category === "B_GRADE" ? "B급" : category === "OBSOLETE" ? "구형" : "불량";
}

/**
 * 불량 격리 / 바로 처리 — 모바일 전용 다품목 흐름.
 *
 * 데스크톱 DefectCartFlow 와 같은 업무 모델을 393px 세로 레이아웃으로 옮긴다.
 * 통합 선택에서 작업·출처를 받으면 품목 단계부터 시작한다.
 * 폐기는 다품목, 재작업은 단일 BOM 품목으로 처리한다.
 */
export function MobileDefectCartFlow({
  itemsLoading = false,
  itemsLoadError = null,
  itemsHasData = true,
  onRetryItems,
  mode,
  initialAction,
  initialSource,
  items,
  productModels,
  currentEmployee,
  onDone,
  onCancel,
}: {
  itemsLoading?: boolean;
  itemsLoadError?: string | null;
  itemsHasData?: boolean;
  onRetryItems?: () => void;
  mode: DefectCartMode;
  initialAction?: DirectAction;
  initialSource?: SourceKind;
  items: Item[];
  productModels: ProductModel[];
  currentEmployee: { employee_id: string; name: string; department: string };
  onDone: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [directAction, setDirectAction] = useState<DirectAction | null>(mode === "add" ? "scrap" : initialAction ?? null);
  const [source, setSource] = useState<SourceKind>(initialAction === "rework" ? "production" : initialSource ?? "production");
  const [step, setStep] = useState<FlowStep>(initialAction ? 2 : 1);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [requestIds, setRequestIds] = useState<Record<string, string>>({});
  const [batchRequestId, setBatchRequestId] = useState(() => makeClientRequestId());
  const submissionIdRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<LineFailure[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const reworkSessionRef = useRef<MobileReworkMemory | null>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [step]);

  useEffect(() => {
    function restore(state: CartHistoryState, preserveStep = false): void {
      const validCart = state?.defect === "cart" && state.mode === mode;
      if (initialAction) {
        const nextAction = mode === "add" ? "scrap" : validCart && (state.directAction === "scrap" || state.directAction === "rework") ? state.directAction : initialAction;
        const nextSource = nextAction === "rework" ? "production" : validCart && (state.source === "warehouse" || state.source === "production") ? state.source : initialSource ?? "production";
        setDirectAction(nextAction);
        setSource(nextSource);
        const nextStep = preserveStep && validCart && (state.step === 3 || state.step === 4 && nextAction === "rework") ? state.step : 2;
        setStep(nextStep);
        if (!validCart || state?.step !== nextStep || state.directAction !== nextAction || state.source !== nextSource) {
          window.history.replaceState({ ...(window.history.state ?? {}), defect: "cart", mode, step: nextStep, directAction: nextAction, source: nextSource }, "");
        }
        return;
      }
      const invalidAction = mode === "add"
        ? state?.directAction !== undefined && state.directAction !== "scrap"
        : state?.directAction === "rework" && state.step !== 2 && state.step !== 3 && state.step !== 4;
      const nextAction = invalidAction ? (mode === "add" ? "scrap" : null) : mode === "add" ? "scrap" : state?.directAction ?? null;
      const nextSource = invalidAction ? "production" : state?.source === "warehouse" ? "warehouse" : "production";
      const nextStep: FlowStep = preserveStep && !invalidAction && (state?.step === 3 || state?.step === 4 && nextAction === "rework")
        ? state.step
        : mode === "add"
        ? state?.step !== 1 && validCart && !invalidAction ? 2 : 1
        : nextAction === "rework"
          ? 2
          : nextAction === "scrap" && state?.step !== 1 && validCart ? 2 : 1;
      setDirectAction(nextAction);
      setSource(nextSource);
      setStep(nextStep);
      if (!validCart || invalidAction || state?.step !== nextStep || state?.directAction !== nextAction || state?.source !== nextSource) {
        window.history.replaceState({ ...(window.history.state ?? {}), defect: "cart", mode, step: nextStep, directAction: nextAction, source: nextSource }, "");
      }
    }

    restore(window.history.state as CartHistoryState);
    function onPop(e: PopStateEvent) {
      setConfirmOpen(false);
      const state = e.state as CartHistoryState;
      if (state?.defect !== "cart" || state.mode !== mode) {
        setStep(1);
        setLines([]);
        submissionIdRef.current = null;
        setDirectAction(mode === "add" ? "scrap" : null);
        setSource("production");
        return;
      }
      restore(state, true);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [mode, initialAction, initialSource]);

  const isDirect = mode === "scrap";
  const isRework = isDirect && directAction === "rework";
  const isScrap = isDirect && directAction === "scrap";
  const title = titleFor(mode, directAction);
  const submitLabel = submitLabelFor(mode, directAction);
  const pickerItems = isRework ? items.filter(hasKnownBom) : items;
  const selectedIds = useMemo(() => new Set(lines.map((l) => l.item.item_id)), [lines]);
  const selectedReworkLine = isRework ? lines[0] : null;
  const reworkLineReady = Boolean(
    selectedReworkLine
      && defectCartLineErrors({ ...selectedReworkLine, qty: String(selectedReworkLine.qty), source }).length === 0,
  );

  function newLine(item: Item): CartLine {
    return { key: `${item.item_id}-${Date.now()}`, item, qty: 1, category: "", categoryId: null, memo: "", managementCategory: "DEFECT", decisions: [] };
  }

  function addItem(item: Item) {
    if (source === "production" && itemDepartment(item) === null) return;
    setLines((prev) => {
      if (prev.some((l) => l.item.item_id === item.item_id)) return prev;
      const line = newLine(item);
      setRequestIds((ids) => ({ ...ids, [line.key]: makeClientRequestId() }));
      setBatchRequestId(makeClientRequestId());
      return isRework ? [line] : [...prev, line];
    });
  }

  function updateLine(key: string, patch: Partial<Omit<CartLine, "key" | "item">>) {
    setBatchRequestId(makeClientRequestId());
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
    setRequestIds((ids) => {
      const next = { ...ids };
      delete next[key];
      return next;
    });
    setBatchRequestId(makeClientRequestId());
  }

  function removeItemById(item: Item) {
    setLines((prev) => {
      const target = prev.find((l) => l.item.item_id === item.item_id);
      if (target) {
        setRequestIds((ids) => {
          const next = { ...ids };
          delete next[target.key];
          return next;
        });
      }
      setBatchRequestId(makeClientRequestId());
      return prev.filter((l) => l.item.item_id !== item.item_id);
    });
  }

  function copyReasonDown(index: number) {
    setLines((prev) => {
      const src = prev[index];
      if (!src) return prev;
      return prev.map((l, i) => (i > index ? { ...l, category: src.category, categoryId: src.categoryId, memo: src.memo } : l));
    });
  }

  function goBack() {
    if (step > 1) {
      window.history.back();
      return;
    }
    if (isDirect && directAction !== null) {
      window.history.back();
      return;
    }
    onCancel();
  }

  function pushStep(nextStep: FlowStep, nextAction = directAction, nextSource = source) {
    window.history.pushState({ defect: "cart", mode, step: nextStep, directAction: nextAction, source: nextSource }, "");
    setStep(nextStep);
  }

  function selectSource(nextSource: SourceKind) {
    window.history.replaceState({ ...(window.history.state ?? {}), defect: "cart", mode, step: 1, directAction, source: nextSource }, "");
    setSource(nextSource);
    if (nextSource !== source) setLines([]);
  }

  const lineErrorsByKey = useMemo(
    () => new Map(lines.map((line) => [
      line.key,
      defectCartLineErrors({ ...line, qty: String(line.qty), source }),
    ])),
    [lines, source],
  );

  const allValid =
    directAction !== null &&
    lines.length > 0 &&
    lines.every((l) => {
      if ((lineErrorsByKey.get(l.key)?.length ?? 0) > 0) return false;
      if (!isRework) return true;
      return l.decisions.length > 0 && validateDecisionTree(l.decisions);
    });

  function quarantinePayload(line: CartLine, requestId: string) {
    const productionDepartment = itemDepartment(line.item);
    if (source === "production" && !productionDepartment) throw new Error("품목 담당 부서를 확인할 수 없습니다.");
    return {
      item_id: line.item.item_id,
      qty: line.qty,
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
          quantity: line.qty,
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
        onDone();
      } catch (error) {
        const message = error instanceof Error ? error.message : "처리 실패";
        setFailures(lines.map((line) => ({ key: line.key, itemName: line.item.item_name, message })));
        setBusy(false);
      }
      return;
    }
    const results = await Promise.allSettled(
      lines.map((l) => submitLine(l, requestIds[l.key] ?? makeClientRequestId())),
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
      onDone();
      return;
    }
    setLines((prev) => prev.filter((l) => failedKeys.has(l.key)));
    setFailures(nextFailures);
  }

  if (isDirect && directAction === null) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 pb-3"><MobileDefectStepHeader title="작업 선택" context="바로 처리" steps={["작업 선택", "출처 선택", "품목 선택", "수량 조정"]} current={0} onBack={onCancel} /></div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col gap-2">
            <MobileActionCard
              icon={Trash2}
              title="폐기"
              tone={LEGACY_COLORS.red}
              onClick={() => {
                window.history.pushState({ defect: "cart", mode, step: 1, directAction: "scrap", source }, "");
                setDirectAction("scrap");
              }}
            />
            <MobileActionCard
              icon={Wrench}
              title="재작업"
              tone={LEGACY_COLORS.yellow}
            onClick={() => {
              setSource("production");
              setDirectAction("rework");
              pushStep(2, "rework", "production");
            }}
            />
          </div>
        </div>
      </div>
    );
  }

  const steps = isRework ? ["작업 선택", "품목 선택", "수량 조정", "BOM 확인"] : ["작업 선택", "출처 선택", "품목 선택", "수량 조정"];
  const current = isRework ? step - 1 : step;
  const header = <MobileDefectStepHeader title={steps[current]} context={title} steps={steps} current={current} onBack={goBack} backLabel={step === 1 && !isDirect ? "취소" : "이전"} />;

  if (step === 1) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 pb-3">{header}</div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col gap-2">
            <MobileSourceCard
              icon={Building2}
              title="부서 재고"
              active={source === "production"}
              onClick={() => selectSource("production")}
            />
            <MobileSourceCard
              icon={Warehouse}
              title="창고 재고"
              active={source === "warehouse"}
              onClick={() => selectSource("warehouse")}
            />
          </div>
        </div>
        <StickyFooter flat compact embedded className="!px-0">
          <PrimaryActionButton label="다음 →" intent="primary" onClick={() => pushStep(2)} />
        </StickyFooter>
      </div>
    );
  }

  if (step === 4 && isRework && selectedReworkLine) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <MobileReworkWorkspace
          sessionId={selectedReworkLine.key}
          parentItemId={selectedReworkLine.item.item_id}
          parentItemName={selectedReworkLine.item.item_name}
          parentMesCode={selectedReworkLine.item.mes_code ?? ""}
          parentQty={selectedReworkLine.qty}
          parentUnit={selectedReworkLine.item.unit ?? "EA"}
          reason={[selectedReworkLine.category, selectedReworkLine.memo].filter(Boolean).join(" · ")}
          decisions={selectedReworkLine.decisions}
          onChange={(decisions) => updateLine(selectedReworkLine.key, { decisions })}
          sessionRef={reworkSessionRef}
          context={title}
          steps={steps}
          current={current}
          onBack={goBack}
          onConfirm={() => setConfirmOpen(true)}
          busy={busy}
          canSubmit={allValid}
          error={failures.find((failure) => failure.key === selectedReworkLine.key)?.message}
        />
        <ConfirmModal
          className={panelStyles.touchScope}
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            void handleSubmit();
          }}
          tone="danger"
          title="즉시 재작업 확인"
          confirmLabel={submitLabel}
          busy={busy}
          busyLabel="처리 중..."
        >
          <p className={clsx(TYPO.body, "mb-3 font-bold")} style={{ color: LEGACY_COLORS.text }}>
            선택한 품목을 즉시 재작업하고 하위 품목을 정상·격리·폐기로 나눕니다.
          </p>
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {lines.map((line) => (
              <div
                key={line.key}
                data-testid="mobile-defect-confirm-line"
                className="rounded-[14px] border px-3 py-2.5"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              >
                <div className={clsx(TYPO.body, "[overflow-wrap:anywhere] font-semibold")} style={{ color: LEGACY_COLORS.text }}>
                  {line.item.item_name}
                </div>
                <div className={clsx(TYPO.caption, "mt-1 flex items-center gap-1.5 font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
                  <span>수량 {line.qty}</span>
                  <span aria-hidden="true">·</span>
                  <span>{source === "warehouse" ? "창고" : itemDepartment(line.item) ?? "부서 미지정"}</span>
                </div>
              </div>
            ))}
          </div>
        </ConfirmModal>
      </div>
    );
  }
  if (step === 2) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <div className="shrink-0 pb-2">{header}</div>
        <div ref={bodyRef} data-testid="mobile-defect-picker-pane" className="min-h-0 min-w-0 flex-1">
          <DefectItemPicker
            loading={itemsLoading}
            loadError={itemsLoadError}
            hasData={itemsHasData}
            onRetry={onRetryItems}
            mobilePresentation
            items={pickerItems}
            productModels={productModels}
            source={source}
            selectedIds={selectedIds}
            onAdd={addItem}
            onRemove={removeItemById}
          />
        </div>
        <StickyFooter flat compact embedded className="!px-0">
          <PrimaryActionButton label={`수량 조정 (${lines.length}건) →`} intent="primary" disabled={lines.length === 0 || busy} onClick={() => pushStep(3)} />
        </StickyFooter>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 pb-2">{header}</div>

      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <div
          data-testid="mobile-defect-cart-scroll"
          className="shrink-0"
        >
          {lines.length === 0 ? (
            <div className="rounded-[14px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              <p className={TYPO.body}>선택한 품목이 없습니다.</p>
              <button type="button" className="mt-2 font-bold" style={{ color: LEGACY_COLORS.blue }} onClick={goBack}>품목 선택으로 돌아가기</button>
            </div>
          ) : (
              <div className="flex flex-col gap-2">
                {lines.map((line, idx) => {
                  const fail = failures.find((f) => f.key === line.key);
                  const validationErrors = lineErrorsByKey.get(line.key) ?? [];
                  const stock = defectSourceStock(line.item, source);
                  return (
                    <div
                      key={line.key}
                      className={panelStyles.defectQuantityCard}
                    >
                      <div className={clsx(panelStyles.defectQuantityRow, quantityCartStyles.cart)}>
                        <div className={panelStyles.defectQuantityIdentity}>
                          <div className={clsx(TYPO.body, "[overflow-wrap:anywhere] font-bold")} style={{ color: LEGACY_COLORS.text }}>
                            {line.item.item_name}
                          </div>
                          <div className={clsx(TYPO.caption, "mt-1 flex flex-wrap items-center gap-x-2 font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
                            <span>{line.item.mes_code ?? "(코드 없음)"}</span>
                            <span>{stock.locationLabel}</span>
                          </div>
                        </div>
                        <div className={panelStyles.defectQuantityInput}>
                          <QuantityStepper value={line.qty} onChange={(n) => updateLine(line.key, { qty: n, decisions: [] })} min={1} disabled={busy} />
                        </div>
                        <div className={panelStyles.defectQuantityStock}>
                          <div><span>가능 재고</span><b style={{ color: stock.available > 0 ? LEGACY_COLORS.green : LEGACY_COLORS.yellow }}>{stock.available.toLocaleString()}</b></div>
                          <div><span>실행 후</span><b style={{ color: stock.available - line.qty < 0 ? LEGACY_COLORS.red : LEGACY_COLORS.green }}>{(stock.available - line.qty).toLocaleString()}</b></div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          aria-label="삭제"
                          className={clsx(panelStyles.defectQuantityDelete, "flex shrink-0 items-center justify-center rounded-[12px]")}
                          style={{ color: LEGACY_COLORS.red }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {idx < lines.length - 1 && (line.category || line.memo) && !isRework && (
                        <button
                          type="button"
                          onClick={() => copyReasonDown(idx)}
                          className={clsx(TYPO.caption, "flex items-center gap-1 self-end font-bold")}
                          style={{ color: LEGACY_COLORS.blue }}
                        >
                          <Copy className="h-3 w-3" /> 아래 줄에 사유 복사
                        </button>
                      )}

                      <ReasonFormFields
                        employeeId={currentEmployee.employee_id}
                        categoryId={line.categoryId}
                        mobilePresentation
                        category={line.category}
                        memo={line.memo}
                        onCategoryChange={(name, id) => updateLine(line.key, { category: name, categoryId: id ?? null })}
                        onMemoChange={(m) => updateLine(line.key, { memo: m })}
                        requireAny
                      />

                      {mode === "add" && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>관리 분류</span>
                          <DefectManagementCategoryControl
                            value={line.managementCategory}
                            onChange={(managementCategory) => updateLine(line.key, { managementCategory })}
                          />
                        </div>
                      )}

                      {fail && (
                        <div className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.red }}>
                          실패: {fail.message}
                        </div>
                      )}
                      {validationErrors.map((message) => (
                        <div key={message} className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.red }}>
                          {message}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
          )}
        </div>
      </div>

        {failures.length > 0 ? (
          <div className={clsx(TYPO.caption, "text-center font-bold")} style={{ color: LEGACY_COLORS.red }}>
            {failures.length}건 실패 — 남은 줄을 확인 후 다시 제출하세요.
          </div>
        ) : null}
      <StickyFooter flat compact embedded className="!px-0">
        <PrimaryActionButton
          label={isRework ? "BOM 확인 →" : busy ? "처리 중..." : `${submitLabel} (${lines.length}건)`}
          intent={isScrap || isRework ? "danger" : "primary"}
          disabled={isRework ? !reworkLineReady || busy : !allValid || busy}
          onClick={() => {
            if (isRework) pushStep(4);
            else setConfirmOpen(true);
          }}
        />
      </StickyFooter>

      <ConfirmModal
        className={panelStyles.touchScope}
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void handleSubmit();
        }}
        tone={isScrap || isRework ? "danger" : "normal"}
        title={isRework ? "즉시 재작업 확인" : isScrap ? "즉시 폐기 확인" : "불량 격리 확인"}
        confirmLabel={submitLabel}
        busy={busy}
        busyLabel="처리 중..."
      >
        {isRework && (
          <p className={clsx(TYPO.body, "mb-3 font-bold")} style={{ color: LEGACY_COLORS.text }}>
            선택한 품목을 즉시 재작업하고 하위 품목을 정상·격리·폐기로 나눕니다.
          </p>
        )}
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {lines.map((line) => (
            <div
              key={line.key}
              data-testid="mobile-defect-confirm-line"
              className="flex items-center justify-between gap-3 rounded-[14px] border px-3 py-2.5"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div className="min-w-0">
                <div className={clsx(TYPO.body, "[overflow-wrap:anywhere] font-semibold")} style={{ color: LEGACY_COLORS.text }}>
                  {line.item.item_name}
                </div>
                <div className={clsx(TYPO.caption, "mt-1 flex items-center gap-1.5 font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
                  <span>수량 {line.qty}</span>
                  <span aria-hidden="true">·</span>
                  <span>{source === "warehouse" ? "창고" : itemDepartment(line.item) ?? "부서 미지정"}</span>
                </div>
              </div>
              {mode === "add" && (
                <span className={clsx(TYPO.caption, "shrink-0 rounded-full px-2.5 py-1 font-black")} style={{ background: tint(LEGACY_COLORS.red, 10), color: LEGACY_COLORS.red }}>
                  {managementCategoryLabel(line.managementCategory)}
                </span>
              )}
            </div>
          ))}
        </div>
      </ConfirmModal>
    </div>
  );
}

function MobileActionCard({ icon: Icon, title, tone, onClick }: { icon: LucideIcon; title: string; tone: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[88px] flex-[1_0_88px] items-center gap-3 rounded-[20px] border px-4 py-3 text-left transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, borderWidth: 1, color: LEGACY_COLORS.text }}
    >
      <div className="flex items-center gap-3">
        <span className={presentation.choiceIcon} style={{ color: tone }} aria-hidden="true"><Icon /></span>
        <span className="text-xl font-bold" style={{ color: LEGACY_COLORS.text }}>
          {title}
        </span>
      </div>
    </button>
  );
}

function MobileSourceCard({
  icon: Icon,
  title,
  active,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="flex min-h-[88px] flex-[1_0_88px] items-center gap-3 rounded-[20px] border px-4 py-3 text-left transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
      style={{
        background: active ? tint(LEGACY_COLORS.red, 7) : LEGACY_COLORS.s2,
        borderColor: active ? LEGACY_COLORS.red : LEGACY_COLORS.border,
        borderWidth: active ? 2 : 1,
      }}
    >
      <div className="flex items-center gap-3">
        <span className={presentation.choiceIcon} style={{ color: active ? LEGACY_COLORS.red : LEGACY_COLORS.blue }} aria-hidden="true"><Icon /></span>
        <span className="text-xl font-bold" style={{ color: active ? LEGACY_COLORS.red : LEGACY_COLORS.text }}>
          {title}
        </span>
      </div>
    </button>
  );
}
