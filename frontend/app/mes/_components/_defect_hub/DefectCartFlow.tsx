"use client";
import { useDesktopWorkGuard } from "../DesktopTabHome";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Building2, ChevronRight, Copy, Trash2, Warehouse, Wrench } from "lucide-react";
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
import { defectCartLineErrors } from "./defectCartValidation";

type SourceKind = "warehouse" | "production";
type DirectAction = "scrap" | "rework";
type FlowStep = 1 | 2 | 3;

type CartHistoryState = { defect?: string; mode?: DefectCartMode; step?: number; directAction?: DirectAction | null; source?: SourceKind } | null;

export type DefectCartMode = "add" | "scrap";

interface CartLine {
  key: string;
  item: Item;
  qty: string;
  category: string;
  memo: string;
  managementCategory: DefectManagementCategory;
  decisions: ChildDecision[];
}

interface LineFailure {
  key: string;
  itemName: string;
  message: string;
}

interface Props {
  mode: DefectCartMode;
  items: Item[];
  productModels: ProductModel[];
  currentEmployee: { employee_id: string; name: string; department: string };
  onDone: (directAction: DirectAction | null) => void;
  onCancel: () => void;
}

function isReworkCandidate(item: Item): boolean {
  return item.has_bom === true;
}

function managementCategoryLabel(category: DefectManagementCategory): string {
  return category === "B_GRADE" ? "B급" : category === "OBSOLETE" ? "구형" : "불량";
}

export function DefectCartFlow({
  mode,
  items,
  productModels,
  currentEmployee,
  onDone,
  onCancel,
}: Props) {
  const queryClient = useQueryClient();
  const [directAction, setDirectAction] = useState<DirectAction | null>(mode === "add" ? "scrap" : null);
  const [source, setSource] = useState<SourceKind>("production");
  const [step, setStep] = useState<FlowStep>(1);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [requestIds, setRequestIds] = useState<Record<string, string>>({});
  const [batchRequestId, setBatchRequestId] = useState(() => makeClientRequestId());
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<LineFailure[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useDesktopWorkGuard("defect-cart", lines.length > 0, busy);

  useEffect(() => {
    function restore(state: CartHistoryState) {
      const validCart = state?.defect === "cart" && state.mode === mode;
      const invalidAction = mode === "add"
        ? state?.directAction !== undefined && state.directAction !== "scrap"
        : state?.directAction === "rework" && state.step !== 2 && state.step !== 3;
      const nextAction = invalidAction ? (mode === "add" ? "scrap" : null) : mode === "add" ? "scrap" : state?.directAction ?? null;
      const nextSource = invalidAction ? "production" : state?.source === "warehouse" ? "warehouse" : "production";
      const nextStep: FlowStep = mode === "add"
        ? state?.step === 2 && !invalidAction ? 2 : 1
        : nextAction === "rework"
          ? 2
          : nextAction === "scrap" && state?.step === 2 ? 2 : 1;
      setDirectAction(nextAction);
      setSource(nextSource);
      setStep(nextStep);
      if (nextStep === 1) setLines([]);
      if (!validCart || invalidAction || state?.step !== nextStep || state?.directAction !== nextAction || state?.source !== nextSource) {
        window.history.replaceState({ ...(window.history.state ?? {}), defect: "cart", mode, step: nextStep, directAction: nextAction, source: nextSource }, "");
      }
    }

    restore(window.history.state as CartHistoryState);
    function onPop(e: PopStateEvent) {
      const s = e.state as CartHistoryState;
      if (s?.defect !== "cart" || s.mode !== mode) {
        setStep(1);
        setLines([]);
        setDirectAction(mode === "add" ? "scrap" : null);
        setSource("production");
        return;
      }
      restore(s);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [mode]);

  const isDirect = mode === "scrap";
  const isRework = isDirect && directAction === "rework";
  const isScrap = isDirect && directAction === "scrap";
  useEffect(() => {
    if (isRework && source !== "production") setSource("production");
  }, [isRework, source]);

  const title = mode === "add" ? "불량 격리" : directAction === "rework" ? "바로 재작업" : directAction === "scrap" ? "바로 폐기" : "바로 처리";
  const submitLabel = mode === "add" ? "격리하기" : isRework ? "즉시 재작업" : "즉시 폐기";
  const pickerItems = isRework ? items.filter(isReworkCandidate) : items;
  const selectedIds = useMemo(() => new Set(lines.map((l) => l.item.item_id)), [lines]);
  const selectedReworkLine = isRework ? lines[0] : null;
  const reworkLineReady = Boolean(
    selectedReworkLine
      && defectCartLineErrors({ ...selectedReworkLine, source }).length === 0,
  );

  function newLine(item: Item): CartLine {
    return { key: `${item.item_id}-${Date.now()}`, item, qty: "1", category: "", memo: "", managementCategory: "DEFECT", decisions: [] };
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
    setFailures([]);
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
      const target = prev.find((line) => line.item.item_id === item.item_id);
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
      return prev.map((l, i) => i > index ? { ...l, category: src.category, memo: src.memo } : l);
    });
  }

  const lineErrorsByKey = useMemo(
    () => new Map(lines.map((line) => [line.key, defectCartLineErrors({ ...line, source })])),
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
    const qty = Number(line.qty);
    const productionDepartment = itemDepartment(line.item);
    if (source === "production" && !productionDepartment) throw new Error("품목 담당 부서를 확인할 수 없습니다.");
    return {
      item_id: line.item.item_id,
      qty,
      source,
      ...(source === "production" ? { source_dept: productionDepartment!, target_dept: productionDepartment! } : { target_dept: "창고" }),
      reason_category: line.category || null,
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
    setBusy(true);
    setFailures([]);
    if (mode === "add" && lines.length > 1) {
      try {
        await defectsApi.quarantineBulk({
          actor_employee_id: currentEmployee.employee_id,
          client_request_id: batchRequestId,
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
        setFailures(lines.map((line) => ({ key: line.key, itemName: line.item.item_name, message })));
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
    setLines((prev) => prev.filter((l) => failedKeys.has(l.key)));
    setFailures(nextFailures);
    setStep(2);
  }

  function pushStep(nextStep: FlowStep, nextAction = directAction, nextSource = source) {
    window.history.pushState({ defect: "cart", mode, step: nextStep, directAction: nextAction, source: nextSource }, "");
    setStep(nextStep);
  }

  function selectSource(nextSource: SourceKind) {
    window.history.replaceState({ ...(window.history.state ?? {}), defect: "cart", mode, step: 1, directAction, source: nextSource }, "");
    setSource(nextSource);
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

  if (isDirect && directAction === null) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="standard-hover flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-sm font-bold transition-colors"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2 }}
          >
            <ArrowLeft className="h-4 w-4" />
            이전
          </button>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>바로 처리</h2>
            <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              ① 작업 선택 → ② 출처 선택 → ③ 품목 선택
            </div>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
          <ActionCard
            icon={Trash2}
            title="폐기"
            desc="정상 재고를 격리 없이 바로 폐기합니다. 여러 품목을 한 번에 담을 수 있습니다."
            tone={LEGACY_COLORS.red}
            onClick={() => {
              window.history.pushState({ defect: "cart", mode, step: 1, directAction: "scrap", source }, "");
              setDirectAction("scrap");
            }}
          />
          <ActionCard
            icon={Wrench}
            title="재작업"
            desc="BOM 있는 품목을 한 개 선택해 하위 품목을 정상·격리·폐기로 나눕니다."
            tone={LEGACY_COLORS.yellow}
            onClick={() => {
              setSource("production");
              setDirectAction("rework");
              pushStep(2, "rework", "production");
            }}
          />
        </div>
      </div>
    );
  }

  const flowSteps = isRework
    ? [{ number: 1, label: "작업 선택", active: false }, { number: 2, label: "품목 선택", active: step === 2 }, { number: 3, label: "BOM 확인", active: step === 3 }]
    : [
      ...(isDirect ? [{ number: 1, label: "작업 선택", active: false }] : []),
      { number: isDirect ? 2 : 1, label: "출처 선택", active: step === 1 },
      { number: isDirect ? 3 : 2, label: "품목 선택", active: step === 2 },
    ];
  const stepIndicator = (
    <div data-testid="defect-flow-stepper" className="flex flex-wrap items-center justify-end gap-4 text-base font-black">
      {flowSteps.map((flowStep, idx) => {
        const active = flowStep.active;
        return (
          <div key={flowStep.label} className="flex items-center gap-2 whitespace-nowrap">
            {idx > 0 && <ChevronRight className="h-5 w-5" style={{ color: LEGACY_COLORS.muted }} />}
            <span className="inline-flex items-center gap-2" style={{ color: active ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}>
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm font-black"
                style={{
                  background: active ? tint(LEGACY_COLORS.red, 12) : LEGACY_COLORS.s2,
                  borderColor: active ? tint(LEGACY_COLORS.red, 42) : LEGACY_COLORS.border,
                  color: active ? LEGACY_COLORS.red : LEGACY_COLORS.muted2,
                }}
              >
                {flowStep.number}
              </span>
              {flowStep.label}
            </span>
          </div>
        );
      })}
    </div>
  );
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={busy}
          className="standard-hover flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-50"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2 }}
        >
          <ArrowLeft className="h-4 w-4" />
          {step === 1 && !(isDirect && directAction !== null) ? "취소" : "이전"}
        </button>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-8 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>{title}</h2>
          </div>
          <div className="min-w-[320px] flex-1">
            {stepIndicator}
          </div>
        </div>
      </div>

      {step === 1 && (
        <div key="step1" className="animate-view-fade flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>출처 선택</div>
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
                {(["production", "warehouse"] as SourceKind[]).map((s) => {
                  const active = source === s;
                  const Icon = s === "warehouse" ? Warehouse : Building2;
                  const label = s === "warehouse" ? "창고 재고" : "부서 재고";
                  const desc = s === "warehouse" ? "창고 보관 중인 정상 재고에서 처리합니다" : "생산 부서에서 사용 중인 재고에서 처리합니다";
                  return (
                    <button key={s} type="button" aria-pressed={active} onClick={() => selectSource(s)} className="standard-hover flex h-full flex-col justify-between rounded-[22px] border p-7 text-left transition-all active:scale-[0.99]" style={{ background: active ? tint(LEGACY_COLORS.red, 7) : LEGACY_COLORS.s2, borderColor: active ? LEGACY_COLORS.red : LEGACY_COLORS.border, borderWidth: active ? 2 : 1 }}>
                      <div className="flex items-center gap-4">
                        <Icon className="h-9 w-9 shrink-0" style={{ color: active ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }} />
                        <span className="text-3xl font-black" style={{ color: active ? LEGACY_COLORS.red : LEGACY_COLORS.text }}>{label}</span>
                      </div>
                      <span className="text-base font-bold" style={{ color: active ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}>{desc}</span>
                    </button>
                  );
                })}
            </div>
          </div>
          <div className="flex shrink-0 justify-end">
            <button type="button" onClick={() => pushStep(2)} className="flex items-center gap-1 rounded-[14px] px-6 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99]" style={{ background: LEGACY_COLORS.redSolid }}>
              다음 →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div key="step2" className="animate-view-fade flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div data-testid="defect-step2-grid" className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1.3fr_1fr]">
            <div data-testid="defect-picker-pane" className="h-full min-h-0">
              <DefectItemPicker
                items={pickerItems}
                productModels={productModels}
                source={source}
                selectedIds={selectedIds}
                onAdd={addItem}
                onRemove={removeItemById}
              />
            </div>

            <div data-testid="defect-cart-pane" className="flex h-full min-h-0 flex-col gap-3">
              <div data-testid="defect-side-toolbar" className="flex h-[50px] shrink-0 items-center px-4 text-sm font-black" style={{ color: LEGACY_COLORS.muted2 }}>
                {isRework ? "재작업 품목" : `장바구니 ${lines.length}건`}
              </div>
              <div data-testid="defect-cart-panel" className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[16px] border" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
                {lines.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm font-bold" style={{ color: LEGACY_COLORS.muted }}>
                    왼쪽에서 품목을 추가하세요.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 p-3">
                  {lines.map((line, idx) => {
                    const fail = failures.find((f) => f.key === line.key);
                    const validationErrors = lineErrorsByKey.get(line.key) ?? [];
                    return (
                      <div key={line.key} className="flex flex-col gap-2 rounded-[12px] border px-3 py-2" style={{ background: LEGACY_COLORS.s1, borderColor: fail || validationErrors.length > 0 ? tint(LEGACY_COLORS.red, 30) : LEGACY_COLORS.border }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{line.item.mes_code ?? "(코드 없음)"}</div>
                            <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{line.item.item_name}</div>
                            <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>자동 부서 · {source === "warehouse" ? "창고" : itemDepartment(line.item) ?? "부서 미지정"}</div>
                          </div>
                          <button type="button" onClick={() => removeLine(line.key)} className="standard-hover no-btn-inset flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors" style={{ color: LEGACY_COLORS.red, background: tint(LEGACY_COLORS.red, 10) }} aria-label="삭제">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>수량</span>
                          <QuantityInput min={0} step="1" value={line.qty} onChange={(e) => updateLine(line.key, { qty: e.target.value, decisions: [] })} placeholder="예: 3" className="w-16 rounded-[8px] border px-2 py-1 text-sm font-bold" />
                          {idx < lines.length - 1 && (line.category || line.memo) && !isRework && (
                            <button type="button" onClick={() => copyReasonDown(idx)} className="ml-auto flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: LEGACY_COLORS.blue }}>
                              <Copy className="h-3 w-3" />
                              위 사유 복사
                            </button>
                          )}
                        </div>

                        <ReasonFormFields category={line.category} memo={line.memo} onCategoryChange={(c) => updateLine(line.key, { category: c })} onMemoChange={(m) => updateLine(line.key, { memo: m })} requireAny />

                        {mode === "add" && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>관리 분류</span>
                            <DefectManagementCategoryControl
                              value={line.managementCategory}
                              onChange={(managementCategory) => updateLine(line.key, { managementCategory })}
                            />
                          </div>
                        )}

                        {isRework && (
                          <div className="rounded-[10px] px-3 py-2 text-xs font-bold" style={{ background: tint(LEGACY_COLORS.yellow, 10), color: LEGACY_COLORS.muted2 }}>
                            다음 단계에서 BOM 하위 품목을 정상·격리·폐기로 크게 확인합니다.
                          </div>
                        )}

                        {fail && <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>실패: {fail.message}</div>}
                        {validationErrors.map((message) => (
                          <div key={message} className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>{message}</div>
                        ))}
                      </div>
                    );
                  })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 pt-1">
            {failures.length > 0 ? (
              <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>{failures.length}건 실패 — 남은 줄을 확인 후 다시 제출하세요.</span>
            ) : (
              <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                {isRework ? "품목, 처리 수량, 사유를 확인한 뒤 BOM을 확인하세요." : "줄마다 수량·사유를 입력하세요."}
              </span>
            )}
            {isRework ? (
              <button type="button" onClick={() => pushStep(3)} disabled={!reworkLineReady || busy} className="rounded-[14px] px-6 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50" style={{ background: LEGACY_COLORS.redSolid }}>
                BOM 확인 →
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmOpen(true)} disabled={!allValid || busy} className="rounded-[14px] px-6 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50" style={{ background: LEGACY_COLORS.redSolid }}>
                {busy ? "처리 중..." : `${submitLabel} (${lines.length}건) →`}
              </button>
            )}
          </div>
        </div>
      )}

      {step === 3 && isRework && selectedReworkLine && (
        <div key="step3" className="animate-view-fade flex min-h-0 flex-1 flex-col gap-3">
          <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-stretch rounded-[16px] border px-5 py-4" style={{ background: tint(LEGACY_COLORS.blue, 8), borderColor: tint(LEGACY_COLORS.blue, 35) }}>
            <div className="min-w-0">
              <div className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>품목</div>
              <div className="truncate text-base font-black" style={{ color: LEGACY_COLORS.text }}>
                {selectedReworkLine.item.mes_code} {selectedReworkLine.item.item_name}
              </div>
            </div>
            <div className="mx-6 w-px" style={{ background: tint(LEGACY_COLORS.blue, 35) }} />
            <div className="flex items-center gap-8">
              <div>
                <div className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>처리 수량</div>
                <div className="text-2xl font-black" style={{ color: LEGACY_COLORS.blue }}>{selectedReworkLine.qty}</div>
              </div>
              <div>
                <div className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>사유</div>
                <div className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{selectedReworkLine.category}</div>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-[16px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <div className="text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>BOM 재작업 트리</div>
            <DisassembleTree
              parentItemId={selectedReworkLine.item.item_id}
              parentItemName={selectedReworkLine.item.item_name}
              parentMesCode={selectedReworkLine.item.mes_code ?? ""}
              parentQty={Number(selectedReworkLine.qty) || 0}
              parentDept={source === "warehouse" ? "창고" : itemDepartment(selectedReworkLine.item) ?? "부서 미지정"}
              decisions={selectedReworkLine.decisions}
              onChange={(decisions) => updateLine(selectedReworkLine.key, { decisions })}
            />
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

      <ConfirmModal open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); void handleSubmit(); }} tone={isScrap || isRework ? "danger" : "normal"} title={isRework ? "즉시 재작업 확인" : isScrap ? "즉시 폐기 확인" : "불량 격리 확인"} confirmLabel={submitLabel} busy={busy} busyLabel="처리 중..." wide={mode === "add"}>
        {isRework && (
          <p className="mb-3 text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
            선택한 품목을 즉시 재작업하고 하위 품목을 정상·격리·폐기로 나눕니다.
          </p>
        )}
        {mode === "add" ? (
          <div className="sg flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
            {lines.map((line) => (
              <div
                key={line.key}
                data-testid="defect-confirm-line"
                className="flex items-center justify-between gap-4 rounded-[14px] border px-4 py-3"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{line.item.item_name}</div>
                  <div className="mt-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{line.item.mes_code ?? "코드 없음"}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs font-black">
                  <span className="rounded-full px-3 py-1.5" style={{ background: tint(LEGACY_COLORS.blue, 12), color: LEGACY_COLORS.blue }}>
                    {line.qty} {line.item.unit || "EA"}
                  </span>
                  <span className="rounded-full px-3 py-1.5" style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.muted2 }}>
                    {source === "warehouse" ? "창고" : itemDepartment(line.item) ?? "부서 미지정"}
                  </span>
                  <span className="rounded-full px-3 py-1.5" style={{ background: tint(LEGACY_COLORS.red, 10), color: LEGACY_COLORS.red }}>
                    {managementCategoryLabel(line.managementCategory)}
                  </span>
                </div>
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
              </div>
            ))}
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}

function ActionCard({ icon: Icon, title, desc, tone, onClick }: { icon: LucideIcon; title: string; desc: string; tone: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="standard-hover flex h-full min-h-0 flex-col justify-between gap-6 rounded-[22px] border p-10 text-left transition-all active:scale-[0.99]" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, borderWidth: 1, color: LEGACY_COLORS.text }}>
      <div className="flex items-center gap-5">
        <Icon className="h-10 w-10 shrink-0" style={{ color: tone }} />
        <span className="text-4xl font-black leading-tight" style={{ color: tone }}>{title}</span>
      </div>
      <span className="text-xl font-bold leading-tight" style={{ color: LEGACY_COLORS.muted2 }}>{desc}</span>
    </button>
  );
}
