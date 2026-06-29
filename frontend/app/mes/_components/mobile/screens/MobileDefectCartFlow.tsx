"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Copy, Trash2, Warehouse, Wrench } from "lucide-react";
import { LEGACY_COLORS, MES_DEPARTMENT_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { Department } from "@/lib/api/types/shared";
import type { Item, ProductModel } from "../../_warehouse_v2/types";
import type { DefectCartMode } from "../../_defect_hub/DefectCartFlow";
import { DefectItemPicker } from "../../_defect_hub/DefectItemPicker";
import { ReasonFormFields } from "../../_defect_hub/ReasonFormFields";
import {
  DisassembleTree,
  toServerDecision,
  validateDecisionTree,
  type ChildDecision,
} from "../../_defect_hub/DisassembleTree";
import { ConfirmModal } from "@/lib/ui";
import { makeClientRequestId } from "@/lib/uuid";
import { TYPO } from "../tokens";
import {
  IconButton,
  PrimaryActionButton,
  SectionCard,
  SegmentedControl,
  StickyFooter,
  Stepper,
} from "../primitives";

const PRODUCTION_LINES = ["튜브", "고압", "진공", "튜닝", "조립", "출하"] as const;

type SourceKind = "warehouse" | "production";
type DirectAction = "scrap" | "rework";
type FlowStep = 1 | 2 | 3;

interface CartLine {
  key: string;
  item: Item;
  qty: number;
  category: string;
  memo: string;
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

/**
 * 불량 격리 / 바로 처리 — 모바일 전용 다품목 흐름.
 *
 * 데스크톱 DefectCartFlow 와 같은 업무 모델을 393px 세로 레이아웃으로 옮긴다.
 * 바로 처리는 먼저 폐기/재작업을 고르고, 폐기는 다품목, 재작업은 단일 품목으로 처리한다.
 */
export function MobileDefectCartFlow({
  mode,
  items,
  productModels,
  currentEmployee,
  defaultSource,
  onDone,
  onCancel,
}: {
  mode: DefectCartMode;
  items: Item[];
  productModels: ProductModel[];
  currentEmployee: { employee_id: string; name: string; department: string };
  defaultSource?: SourceKind;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [directAction, setDirectAction] = useState<DirectAction | null>(mode === "add" ? "scrap" : null);
  const isProductionDept = PRODUCTION_LINES.includes(
    currentEmployee.department as (typeof PRODUCTION_LINES)[number],
  );

  const [source, setSource] = useState<SourceKind>(defaultSource ?? "production");
  const [dept, setDept] = useState<string>(isProductionDept ? currentEmployee.department : PRODUCTION_LINES[0]);
  const [step, setStep] = useState<FlowStep>(1);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [requestIds, setRequestIds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<LineFailure[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isDirect = mode === "scrap";
  const isRework = isDirect && directAction === "rework";
  const isScrap = isDirect && directAction === "scrap";
  const title = titleFor(mode, directAction);
  const submitLabel = submitLabelFor(mode, directAction);
  const pickerItems = isRework ? items.filter(hasKnownBom) : items;
  const selectedIds = useMemo(() => new Set(lines.map((l) => l.item.item_id)), [lines]);
  const selectedReworkLine = isRework ? lines[0] : null;
  const reworkLineReady = Boolean(
    selectedReworkLine && Number.isFinite(selectedReworkLine.qty) && selectedReworkLine.qty > 0 && selectedReworkLine.category.trim() !== "",
  );
  useEffect(() => {
    if (isRework && source !== "production") setSource("production");
  }, [isRework, source]);

  const lockedMetaLabel = source === "warehouse" ? "진입 위치" : "진입 부서";
  const lockedMetaValue = source === "warehouse" ? "창고" : dept;

  function newLine(item: Item): CartLine {
    return { key: `${item.item_id}-${Date.now()}`, item, qty: 1, category: "", memo: "", decisions: [] };
  }

  function addItem(item: Item) {
    setLines((prev) => {
      if (prev.some((l) => l.item.item_id === item.item_id)) return prev;
      const line = newLine(item);
      setRequestIds((ids) => ({ ...ids, [line.key]: makeClientRequestId() }));
      return isRework ? [line] : [...prev, line];
    });
  }

  function updateLine(key: string, patch: Partial<Omit<CartLine, "key" | "item">>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
    setRequestIds((ids) => {
      const next = { ...ids };
      delete next[key];
      return next;
    });
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
      return prev.filter((l) => l.item.item_id !== item.item_id);
    });
  }

  function copyReasonDown(index: number) {
    setLines((prev) => {
      const src = prev[index];
      if (!src) return prev;
      return prev.map((l, i) => (i > index ? { ...l, category: src.category, memo: src.memo } : l));
    });
  }

  function goBack() {
    if (step === 2) {
      setStep(1);
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

  const allValid =
    directAction !== null &&
    lines.length > 0 &&
    lines.every((l) => {
      if (!Number.isFinite(l.qty) || l.qty <= 0) return false;
      if (!isRework) return true;
      return l.category.trim() !== "" && l.decisions.length > 0 && validateDecisionTree(l.decisions);
    });

  async function submitLine(line: CartLine, requestId: string): Promise<void> {
    if (mode === "add") {
      await defectsApi.quarantine({
        item_id: line.item.item_id,
        qty: line.qty,
        source,
        source_dept: source === "production" ? dept : undefined,
        target_dept: source === "warehouse" ? "창고" : dept,
        reason_category: line.category || null,
        reason_memo: line.memo,
        actor_employee_id: currentEmployee.employee_id,
        client_request_id: requestId,
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
      client_request_id: requestId,
      lines: [
        {
          item_id: line.item.item_id,
          quantity: line.qty,
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
      onDone();
      return;
    }
    setLines((prev) => prev.filter((l) => failedKeys.has(l.key)));
    setFailures(nextFailures);
  }

  if (isDirect && directAction === null) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 pb-3">
          <div className="flex items-center gap-2">
            <IconButton icon={ArrowLeft} label="이전" size="md" onClick={onCancel} />
            <div className="min-w-0">
              <h2 className={clsx(TYPO.headline, "font-black")} style={{ color: LEGACY_COLORS.text }}>
                바로 처리
              </h2>
              <div className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
                폐기 또는 재작업을 먼저 선택하세요.
              </div>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          <div className="flex min-h-full flex-col gap-3">
            <MobileActionCard
              icon={Trash2}
              title="폐기"
              desc="정상 재고를 격리 없이 바로 폐기합니다. 여러 품목을 한 번에 담을 수 있습니다."
              tone={LEGACY_COLORS.red}
              onClick={() => setDirectAction("scrap")}
            />
            <MobileActionCard
              icon={Wrench}
              title="재작업"
              desc="BOM 있는 품목 한 개를 하위 품목 정상·격리·폐기로 나눠 처리합니다."
              tone={LEGACY_COLORS.yellow}
              onClick={() => {
                setSource("production");
                setDirectAction("rework");
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  const header = (
    <div className="flex items-center gap-2">
      <IconButton icon={ArrowLeft} label={step === 1 && !(isDirect && directAction !== null) ? "취소" : "이전"} size="md" onClick={goBack} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <h2 className={clsx(TYPO.headline, "font-black")} style={{ color: LEGACY_COLORS.text }}>
            {title}
          </h2>
          {step >= 2 && (
            <span
              className={clsx(TYPO.caption, "rounded-full border px-2 py-0.5 font-bold")}
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
            >
              {lockedMetaLabel} · {lockedMetaValue}
            </span>
          )}
        </div>
        <div className={clsx(TYPO.caption, "flex flex-wrap items-center gap-1.5 font-bold")}>
          {isDirect && (
            <>
              <span style={{ color: LEGACY_COLORS.muted2 }}>① 작업 선택</span>
              <span style={{ color: LEGACY_COLORS.muted }}>→</span>
            </>
          )}
          <span style={{ color: step === 1 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}>
            {isDirect ? "②" : "①"} 출처·부서
          </span>
          <span style={{ color: LEGACY_COLORS.muted }}>→</span>
          <span style={{ color: step === 2 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}>
            {isDirect ? "③" : "②"} 품목 선택
          </span>
          {isRework && (
            <>
              <span style={{ color: LEGACY_COLORS.muted }}>→</span>
              <span style={{ color: step === 3 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}>④ BOM 확인</span>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (step === 1) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 pb-3">{header}</div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col gap-4 pb-3">
            <div className="flex flex-1 flex-col gap-2">
              <span className={clsx(TYPO.caption, "font-black uppercase tracking-[1px]")} style={{ color: LEGACY_COLORS.muted2 }}>
                출처
              </span>
              <SegmentedControl
                tabs={isRework
                  ? [{ id: "production", label: "부서 재고" }]
                  : [
                    { id: "production", label: "부서 재고" },
                    { id: "warehouse", label: "창고 재고" },
                  ]}
                active={source}
                onChange={(s) => setSource(s as SourceKind)}
                size="lg"
                className="flex-1"
              />
              <span className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.muted }}>
                {source === "warehouse"
                  ? "창고 보관 중인 정상 재고에서 처리합니다."
                  : "생산 부서에서 사용 중인 재고에서 처리합니다."}
              </span>
            </div>

            {source === "warehouse" ? (
              <SectionCard padding="md">
                <div className="flex items-center gap-3">
                  <Warehouse className="h-7 w-7 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                  <div className="min-w-0">
                    <div className={clsx(TYPO.title, "font-black")} style={{ color: LEGACY_COLORS.blue }}>
                      창고
                    </div>
                    <div className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
                      {mode === "add" ? "창고 불량 보관 구역으로 이동됩니다." : "창고 정상 재고에서 처리합니다."}
                    </div>
                  </div>
                </div>
              </SectionCard>
            ) : (
              <div className="flex flex-1 flex-col gap-2">
                <span className={clsx(TYPO.caption, "font-black uppercase tracking-[1px]")} style={{ color: LEGACY_COLORS.muted2 }}>
                  {mode === "add" ? "출처·격리 부서" : "출처 부서"}
                </span>
                <div className="grid flex-1 auto-rows-fr grid-cols-3 gap-2">
                  {PRODUCTION_LINES.map((d) => {
                    const active = dept === d;
                    const c = MES_DEPARTMENT_COLORS[d] ?? LEGACY_COLORS.muted2;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDept(d)}
                        className={clsx(
                          "min-h-[64px] rounded-[14px] border font-black transition-[transform] active:scale-[0.98]",
                          TYPO.title,
                        )}
                        style={{
                          background: active ? tint(c, 14) : LEGACY_COLORS.s2,
                          borderColor: active ? c : LEGACY_COLORS.border,
                          borderWidth: active ? 2 : 1,
                          color: active ? c : LEGACY_COLORS.muted2,
                        }}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        <StickyFooter flat compact>
          <PrimaryActionButton label="다음 →" intent="primary" onClick={() => setStep(2)} />
        </StickyFooter>
      </div>
    );
  }

  if (step === 3 && isRework && selectedReworkLine) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 pb-3">{header}</div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-3 pb-3">
            <SectionCard padding="md">
              <div className="flex flex-col gap-1">
                <div className={clsx(TYPO.caption, "font-black")} style={{ color: LEGACY_COLORS.muted2 }}>품목</div>
                <div className={clsx(TYPO.body, "font-black")} style={{ color: LEGACY_COLORS.text }}>
                  {selectedReworkLine.item.mes_code} {selectedReworkLine.item.item_name}
                </div>
                <div className="flex items-center gap-4 pt-2">
                  <span className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
                    처리 수량 <b style={{ color: LEGACY_COLORS.blue }}>{selectedReworkLine.qty}</b>
                  </span>
                  <span className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
                    사유 <b style={{ color: LEGACY_COLORS.text }}>{selectedReworkLine.category}</b>
                  </span>
                </div>
              </div>
            </SectionCard>
            <SectionCard title="BOM 재작업 트리" padding="sm">
              <DisassembleTree
                parentItemId={selectedReworkLine.item.item_id}
                parentItemName={selectedReworkLine.item.item_name}
                parentMesCode={selectedReworkLine.item.mes_code ?? ""}
                parentQty={selectedReworkLine.qty}
                parentDept={source === "warehouse" ? "창고" : dept}
                decisions={selectedReworkLine.decisions}
                onChange={(decisions) => updateLine(selectedReworkLine.key, { decisions })}
              />
            </SectionCard>
          </div>
        </div>
        <StickyFooter flat compact>
          <div className={clsx(TYPO.caption, "mb-2 text-center font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
            격리·폐기를 입력하면 정상 수량이 자동으로 줄어듭니다.
          </div>
          <PrimaryActionButton
            label={busy ? "처리 중..." : `${submitLabel} (${lines.length}건)`}
            intent="danger"
            disabled={!allValid || busy}
            onClick={() => setConfirmOpen(true)}
          />
        </StickyFooter>
        <ConfirmModal
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
          <p className={clsx(TYPO.body, "font-bold")} style={{ color: LEGACY_COLORS.text }}>
            선택한 품목을 즉시 재작업하고 하위 품목을 정상·격리·폐기로 나눕니다.
          </p>
        </ConfirmModal>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 pb-3">{header}</div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 pb-3">
          <DefectItemPicker
            items={pickerItems}
            productModels={productModels}
            targetDepartment={source === "warehouse" ? "창고" : dept}
            lockedDepartment={source === "warehouse" ? "창고" : dept}
            selectedIds={selectedIds}
            onAdd={addItem}
            onRemove={removeItemById}
          />

          <SectionCard title={isRework ? "재작업 품목" : `장바구니 ${lines.length}건`} padding={lines.length === 0 ? "md" : "sm"}>
            {lines.length === 0 ? (
              <div className={clsx(TYPO.body, "py-2 text-center font-bold")} style={{ color: LEGACY_COLORS.muted }}>
                위에서 품목을 추가하세요.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {lines.map((line, idx) => {
                  const fail = failures.find((f) => f.key === line.key);
                  return (
                    <div
                      key={line.key}
                      className="flex flex-col gap-2 rounded-[14px] border p-3"
                      style={{ background: LEGACY_COLORS.s1, borderColor: fail ? tint(LEGACY_COLORS.red, 30) : LEGACY_COLORS.border }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
                            {line.item.mes_code ?? "(코드 없음)"}
                          </div>
                          <div className={clsx(TYPO.body, "truncate font-black")} style={{ color: LEGACY_COLORS.text }}>
                            {line.item.item_name}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          aria-label="삭제"
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                          style={{ color: LEGACY_COLORS.red, background: tint(LEGACY_COLORS.red, 10) }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className={clsx(TYPO.caption, "font-black")} style={{ color: LEGACY_COLORS.muted2 }}>
                          수량
                        </span>
                        <Stepper
                          value={line.qty}
                          onChange={(n) => updateLine(line.key, { qty: n, decisions: [] })}
                          min={1}
                          danger={isScrap || isRework}
                        />
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
                        category={line.category}
                        memo={line.memo}
                        onCategoryChange={(c) => updateLine(line.key, { category: c })}
                        onMemoChange={(m) => updateLine(line.key, { memo: m })}
                        required={isRework}
                      />

                      {isRework && (
                        <div className={clsx(TYPO.caption, "rounded-[10px] px-3 py-2 font-bold")} style={{ background: tint(LEGACY_COLORS.yellow, 10), color: LEGACY_COLORS.muted2 }}>
                          다음 단계에서 BOM 하위 품목을 정상·격리·폐기로 크게 확인합니다.
                        </div>
                      )}

                      {fail && (
                        <div className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.red }}>
                          실패: {fail.message}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <StickyFooter flat compact>
        {failures.length > 0 ? (
          <div className={clsx(TYPO.caption, "mb-2 text-center font-bold")} style={{ color: LEGACY_COLORS.red }}>
            {failures.length}건 실패 — 남은 줄을 확인 후 다시 제출하세요.
          </div>
        ) : (
          <div className={clsx(TYPO.caption, "mb-2 text-center font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
            {isRework ? "정상·격리·폐기 합계가 처리 수량과 같아야 합니다." : "줄마다 수량·사유를 확인하세요."}
          </div>
        )}
        <PrimaryActionButton
          label={isRework ? "BOM 확인 →" : busy ? "처리 중..." : `${submitLabel} (${lines.length}건)`}
          intent={isScrap || isRework ? "danger" : "primary"}
          disabled={isRework ? !reworkLineReady || busy : !allValid || busy}
          onClick={() => {
            if (isRework) setStep(3);
            else setConfirmOpen(true);
          }}
        />
      </StickyFooter>

      <ConfirmModal
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
        <p className={clsx(TYPO.body, "font-bold")} style={{ color: LEGACY_COLORS.text }}>
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

function MobileActionCard({ icon: Icon, title, desc, tone, onClick }: { icon: LucideIcon; title: string; desc: string; tone: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[156px] flex-1 flex-col justify-between gap-4 rounded-[20px] border p-5 text-left transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, borderWidth: 1, color: LEGACY_COLORS.text }}
    >
      <div className="flex items-center gap-3">
        <Icon className="h-8 w-8 shrink-0" style={{ color: tone }} />
        <span className={clsx(TYPO.headline, "font-black")} style={{ color: tone }}>
          {title}
        </span>
      </div>
      <span className={clsx(TYPO.body, "font-bold leading-relaxed")} style={{ color: LEGACY_COLORS.muted2 }}>
        {desc}
      </span>
    </button>
  );
}
