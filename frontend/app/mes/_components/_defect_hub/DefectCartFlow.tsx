"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Building2, Copy, Trash2, Warehouse, Wrench } from "lucide-react";
import { LEGACY_COLORS, MES_DEPARTMENT_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { Department } from "@/lib/api/types/shared";
import type { Item, ProductModel } from "../_warehouse_v2/types";
import { DefectItemPicker } from "./DefectItemPicker";
import { ReasonFormFields } from "./ReasonFormFields";
import { ConfirmModal } from "@/lib/ui";
import { DisassembleTree, toServerDecision, validateDecisionTree, type ChildDecision } from "./DisassembleTree";

const PRODUCTION_LINES = ["튜브", "고압", "진공", "튜닝", "조립", "출하"] as const;

type SourceKind = "warehouse" | "production";
type DirectAction = "scrap" | "rework";
type FlowStep = 1 | 2 | 3;

export type DefectCartMode = "add" | "scrap";

interface CartLine {
  key: string;
  item: Item;
  qty: string;
  category: string;
  memo: string;
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
  defaultSource?: SourceKind;
  onDone: () => void;
  onCancel: () => void;
}

function isReworkCandidate(item: Item): boolean {
  return item.has_bom === true;
}

function validQty(value: string): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

export function DefectCartFlow({
  mode,
  items,
  productModels,
  currentEmployee,
  defaultSource,
  onDone,
  onCancel,
}: Props) {
  const [directAction, setDirectAction] = useState<DirectAction | null>(mode === "add" ? "scrap" : null);
  const [source, setSource] = useState<SourceKind>(defaultSource ?? "production");
  const [dept, setDept] = useState<string>(
    PRODUCTION_LINES.includes(currentEmployee.department as (typeof PRODUCTION_LINES)[number])
      ? currentEmployee.department
      : PRODUCTION_LINES[0],
  );
  const [step, setStep] = useState<FlowStep>(1);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<LineFailure[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    window.history.replaceState({ ...(window.history.state ?? {}), defect: "cart", mode, step: 1 }, "");
    function onPop(e: PopStateEvent) {
      const s = e.state as { defect?: string; step?: number } | null;
      if (s?.defect !== "cart") {
        setStep(1);
        setLines([]);
        return;
      }
      if (s.step === 3) {
        setStep(3);
        return;
      }
      if (s.step === 2) {
        setStep(2);
        return;
      }
      setStep(1);
      setLines([]);
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
  const reworkLineReady = Boolean(selectedReworkLine && validQty(selectedReworkLine.qty) && selectedReworkLine.category.trim() !== "");

  function newLine(item: Item): CartLine {
    return { key: `${item.item_id}-${Date.now()}`, item, qty: "1", category: "", memo: "", decisions: [] };
  }

  function addItem(item: Item) {
    setLines((prev) => {
      if (prev.some((l) => l.item.item_id === item.item_id)) return prev;
      return isRework ? [newLine(item)] : [...prev, newLine(item)];
    });
    setFailures([]);
  }

  function updateLine(key: string, patch: Partial<Omit<CartLine, "key" | "item">>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function removeItemById(item: Item) {
    setLines((prev) => prev.filter((l) => l.item.item_id !== item.item_id));
  }

  function copyReasonDown(index: number) {
    setLines((prev) => {
      const src = prev[index];
      if (!src) return prev;
      return prev.map((l, i) => i > index ? { ...l, category: src.category, memo: src.memo } : l);
    });
  }

  const allValid =
    directAction !== null &&
    lines.length > 0 &&
    lines.every((l) => {
      if (!validQty(l.qty)) return false;
      if (!isRework) return true;
      return l.category.trim() !== "" && l.decisions.length > 0 && validateDecisionTree(l.decisions);
    });

  async function submitLine(line: CartLine): Promise<void> {
    const qty = Number(line.qty);
    if (mode === "add") {
      await defectsApi.quarantine({
        item_id: line.item.item_id,
        qty,
        source,
        source_dept: source === "production" ? dept : undefined,
        target_dept: source === "warehouse" ? "창고" : dept,
        reason_category: line.category || null,
        reason_memo: line.memo,
        actor_employee_id: currentEmployee.employee_id,
      });
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
      lines: [
        {
          item_id: line.item.item_id,
          quantity: qty,
          from_bucket: source === "warehouse" ? "warehouse" : "production",
          from_department: source === "warehouse" ? null : (dept as Department),
          to_bucket: "none",
        },
      ],
    });
  }

  async function handleSubmit() {
    if (!allValid || busy) return;
    setBusy(true);
    setFailures([]);
    const results = await Promise.allSettled(lines.map((l) => submitLine(l)));
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
      onDone();
      return;
    }
    setLines((prev) => prev.filter((l) => failedKeys.has(l.key)));
    setFailures(nextFailures);
    setStep(2);
  }

  function pushStep(nextStep: FlowStep) {
    window.history.pushState({ defect: "cart", mode, step: nextStep }, "");
    setStep(nextStep);
  }

  function goBack() {
    if (step > 1) {
      window.history.back();
      return;
    }
    if (isDirect && directAction !== null) {
      setDirectAction(null);
      setLines([]);
      setFailures([]);
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
            className="flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-sm font-bold transition-colors hover:brightness-110"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2 }}
          >
            <ArrowLeft className="h-4 w-4" />
            이전
          </button>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>바로 처리</h2>
            <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              ① 작업 선택 → ② 출처·부서 선택 → ③ 품목 선택
            </div>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
          <ActionCard
            icon={Trash2}
            title="폐기"
            desc="정상 재고를 격리 없이 바로 폐기합니다. 여러 품목을 한 번에 담을 수 있습니다."
            tone={LEGACY_COLORS.red}
            onClick={() => setDirectAction("scrap")}
          />
          <ActionCard
            icon={Wrench}
            title="재작업"
            desc="BOM 있는 품목을 한 개 선택해 하위 품목을 정상·격리·폐기로 나눕니다."
            tone={LEGACY_COLORS.yellow}
            onClick={() => {
              setSource("production");
              setDirectAction("rework");
            }}
          />
        </div>
      </div>
    );
  }

  const stepIndicator = (
    <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
      {isDirect && <><span style={{ color: LEGACY_COLORS.muted2 }}>① 작업 선택</span><span style={{ color: LEGACY_COLORS.muted }}>→</span></>}
      <span style={{ color: step === 1 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}>
        {isDirect ? "②" : "①"} 출처·부서 선택
      </span>
      <span style={{ color: LEGACY_COLORS.muted }}>→</span>
      <span style={{ color: step === 2 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}>
        {isDirect ? "③" : "②"} 품목 선택
      </span>
      {isRework && <><span style={{ color: LEGACY_COLORS.muted }}>→</span><span style={{ color: step === 3 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}>④ BOM 확인</span></>}
    </div>
  );
  const lockedMetaLabel = source === "warehouse" ? "진입 위치" : "진입 부서";
  const lockedMetaValue = source === "warehouse" ? "창고" : dept;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={busy}
          className="flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-sm font-bold transition-colors hover:brightness-110 disabled:opacity-50"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2 }}
        >
          <ArrowLeft className="h-4 w-4" />
          {step === 1 && !(isDirect && directAction !== null) ? "취소" : "이전"}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>{title}</h2>
            {step >= 2 && (
              <span className="inline-flex cursor-default select-none items-center rounded-full border px-2.5 py-1 text-xs font-bold" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                {lockedMetaLabel} · {lockedMetaValue}
              </span>
            )}
          </div>
          {stepIndicator}
        </div>
      </div>

      {step === 1 && (
        <div key="step1" className="animate-view-fade flex min-h-0 flex-1 flex-col gap-3">
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
            <div className="flex min-h-0 flex-col gap-2">
              <div className="text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>출처</div>
              <div className={`grid min-h-0 flex-1 gap-3 ${isRework ? "grid-rows-1" : "grid-rows-2"}`}>
                {(isRework ? (["production"] as SourceKind[]) : (["production", "warehouse"] as SourceKind[])).map((s) => {
                  const active = source === s;
                  const Icon = s === "warehouse" ? Warehouse : Building2;
                  const label = s === "warehouse" ? "창고 재고" : "부서 재고";
                  const desc = s === "warehouse" ? "창고 보관 중인 정상 재고에서 처리합니다" : "생산 부서에서 사용 중인 재고에서 처리합니다";
                  return (
                    <button key={s} type="button" onClick={() => setSource(s)} className="flex h-full flex-col justify-between rounded-[22px] border p-7 text-left transition-all hover:brightness-110 active:scale-[0.99]" style={{ background: active ? tint(LEGACY_COLORS.red, 7) : LEGACY_COLORS.s2, borderColor: active ? LEGACY_COLORS.red : LEGACY_COLORS.border, borderWidth: active ? 2 : 1 }}>
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

            <div className="flex min-h-0 flex-col gap-2">
              <div className="text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
                {source === "warehouse" ? "처리 위치" : mode === "add" ? "출처·격리 부서" : "출처 부서"}
              </div>
              {source === "warehouse" ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-[22px] border-2" style={{ background: tint(LEGACY_COLORS.blue, 7), borderColor: LEGACY_COLORS.blue }}>
                  <Warehouse className="h-16 w-16" style={{ color: LEGACY_COLORS.blue }} />
                  <span className="text-4xl font-black" style={{ color: LEGACY_COLORS.blue }}>창고</span>
                  <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>창고 정상 재고에서 처리합니다</span>
                </div>
              ) : (
                <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-3">
                  {PRODUCTION_LINES.map((d) => {
                    const active = dept === d;
                    const deptColor = MES_DEPARTMENT_COLORS[d] ?? LEGACY_COLORS.muted2;
                    return (
                      <button key={d} type="button" onClick={() => setDept(d)} className="h-full rounded-[18px] border text-3xl font-black transition-all hover:brightness-110 active:scale-[0.99]" style={{ background: active ? tint(deptColor, 14) : LEGACY_COLORS.s2, borderColor: active ? deptColor : LEGACY_COLORS.border, borderWidth: active ? 2 : 1, color: active ? deptColor : LEGACY_COLORS.muted2 }}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 justify-end">
            <button type="button" onClick={() => pushStep(2)} className="flex items-center gap-1 rounded-[14px] px-6 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99]" style={{ background: LEGACY_COLORS.red }}>
              다음 →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div key="step2" className="animate-view-fade flex min-h-0 flex-1 flex-col gap-3">
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1.3fr_1fr]">
            <div className="min-h-0">
              <DefectItemPicker
                items={pickerItems}
                productModels={productModels}
                targetDepartment={source === "warehouse" ? "창고" : dept}
                lockedDepartment={source === "warehouse" ? "창고" : dept}
                selectedIds={selectedIds}
                onAdd={addItem}
                onRemove={removeItemById}
              />
            </div>

            <div className="flex min-h-0 flex-col overflow-y-auto rounded-[16px] border" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
              <div className="sticky top-0 z-10 px-4 py-2 text-xs font-black uppercase tracking-[1.5px]" style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2, borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                {isRework ? "재작업 품목" : `장바구니 ${lines.length}건`}
              </div>
              {lines.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm font-bold" style={{ color: LEGACY_COLORS.muted }}>
                  왼쪽에서 품목을 추가하세요.
                </div>
              ) : (
                <div className="flex flex-col gap-3 p-3">
                  {lines.map((line, idx) => {
                    const fail = failures.find((f) => f.key === line.key);
                    return (
                      <div key={line.key} className="flex flex-col gap-2 rounded-[12px] border px-3 py-2" style={{ background: LEGACY_COLORS.s1, borderColor: fail ? tint(LEGACY_COLORS.red, 30) : LEGACY_COLORS.border }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{line.item.mes_code ?? "(코드 없음)"}</div>
                            <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{line.item.item_name}</div>
                          </div>
                          <button type="button" onClick={() => removeLine(line.key)} className="no-btn-inset flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:brightness-110" style={{ color: LEGACY_COLORS.red, background: tint(LEGACY_COLORS.red, 10) }} aria-label="삭제">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>수량</span>
                          <input type="number" min={0} step="1" value={line.qty} onChange={(e) => updateLine(line.key, { qty: e.target.value, decisions: [] })} placeholder="예: 3" className="w-16 rounded-[8px] border px-2 py-1 text-center text-sm font-bold outline-none" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
                          {idx < lines.length - 1 && (line.category || line.memo) && !isRework && (
                            <button type="button" onClick={() => copyReasonDown(idx)} className="ml-auto flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: LEGACY_COLORS.blue }}>
                              <Copy className="h-3 w-3" />
                              위 사유 복사
                            </button>
                          )}
                        </div>

                        <ReasonFormFields category={line.category} memo={line.memo} onCategoryChange={(c) => updateLine(line.key, { category: c })} onMemoChange={(m) => updateLine(line.key, { memo: m })} required={isRework} />

                        {isRework && (
                          <div className="rounded-[10px] px-3 py-2 text-xs font-bold" style={{ background: tint(LEGACY_COLORS.yellow, 10), color: LEGACY_COLORS.muted2 }}>
                            다음 단계에서 BOM 하위 품목을 정상·격리·폐기로 크게 확인합니다.
                          </div>
                        )}

                        {fail && <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>실패: {fail.message}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
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
              <button type="button" onClick={() => pushStep(3)} disabled={!reworkLineReady || busy} className="rounded-[14px] px-6 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50" style={{ background: LEGACY_COLORS.red }}>
                BOM 확인 →
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmOpen(true)} disabled={!allValid || busy} className="rounded-[14px] px-6 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50" style={{ background: LEGACY_COLORS.red }}>
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
              parentDept={source === "warehouse" ? "창고" : dept}
              decisions={selectedReworkLine.decisions}
              onChange={(decisions) => updateLine(selectedReworkLine.key, { decisions })}
            />
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 pt-1">
            <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              격리·폐기를 입력하면 정상 수량이 자동으로 줄어듭니다.
            </span>
            <button type="button" onClick={() => setConfirmOpen(true)} disabled={!allValid || busy} className="rounded-[14px] px-6 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50" style={{ background: LEGACY_COLORS.red }}>
              {busy ? "처리 중..." : `${submitLabel} (${lines.length}건) →`}
            </button>
          </div>
        </div>
      )}

      <ConfirmModal open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); void handleSubmit(); }} tone={isScrap || isRework ? "danger" : "normal"} title={isRework ? "즉시 재작업 확인" : isScrap ? "즉시 폐기 확인" : "불량 격리 확인"} confirmLabel={submitLabel} busy={busy} busyLabel="처리 중...">
        <p className="mb-2 text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
          {isRework
            ? "선택한 품목을 즉시 재작업하고 하위 품목을 정상·격리·폐기로 나눕니다."
            : isScrap
              ? `${lines.length}건을 즉시 폐기합니다. 재고에서 차감되며 되돌릴 수 없습니다.`
              : `${lines.length}건을 격리합니다.`}
        </p>
      </ConfirmModal>
    </div>
  );
}

function ActionCard({ icon: Icon, title, desc, tone, onClick }: { icon: LucideIcon; title: string; desc: string; tone: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-full min-h-0 flex-col justify-between gap-6 rounded-[22px] border p-10 text-left transition-all hover:brightness-110 active:scale-[0.99]" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, borderWidth: 1, color: LEGACY_COLORS.text }}>
      <div className="flex items-center gap-5">
        <Icon className="h-10 w-10 shrink-0" style={{ color: tone }} />
        <span className="text-4xl font-black leading-tight" style={{ color: tone }}>{title}</span>
      </div>
      <span className="text-xl font-bold leading-tight" style={{ color: LEGACY_COLORS.muted2 }}>{desc}</span>
    </button>
  );
}
