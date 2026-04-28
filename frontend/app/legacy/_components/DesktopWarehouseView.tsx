"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Item, type ShipPackage } from "@/lib/api";
import { LEGACY_COLORS, formatNumber, normalizeDepartment } from "./legacyUi";
import { ConfirmModal, ResultModal } from "./common";
import { CAUTION_WORK_TYPES, type WorkType } from "./_warehouse_steps";
import { useWarehouseFilters } from "./_warehouse_hooks/useWarehouseFilters";
import { useWarehouseWizardState } from "./_warehouse_hooks/useWarehouseWizardState";
import { useWarehouseCompletionFeedback } from "./_warehouse_hooks/useWarehouseCompletionFeedback";
import { useWarehouseData } from "./_warehouse_hooks/useWarehouseData";
import { useWarehouseScroll } from "./_warehouse_hooks/useWarehouseScroll";
import { WarehouseHeader } from "./_warehouse_sections/WarehouseHeader";
import { WarehouseStickySummary } from "./_warehouse_sections/WarehouseStickySummary";
import { WarehouseCompletionOverlay } from "./_warehouse_sections/WarehouseCompletionOverlay";
import { WarehouseStepLayout } from "./_warehouse_sections/WarehouseStepLayout";
import { WarehouseConfirmContent } from "./_warehouse_modals/WarehouseConfirmContent";
import { MyRequestsPanel } from "./_warehouse_sections/MyRequestsPanel";
import { WarehouseQueuePanel } from "./_warehouse_sections/WarehouseQueuePanel";
import {
  buildStockRequestPayload,
  inputRequiresApproval,
} from "./_warehouse_helpers/requestMapping";
import { readCurrentOperator } from "./login/useCurrentOperator";

type SectionTab = "compose" | "mine" | "queue";

export function DesktopWarehouseView({
  globalSearch,
  onStatusChange,
  preselectedItem,
  onSubmitSuccess,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  preselectedItem?: Item | null;
  onSubmitSuccess?: () => void;
}) {
  // ─── 데이터 (hook) ───
  const { employees, items, packages, productModels, loadFailure, setItems } = useWarehouseData({
    globalSearch,
    onStatusChange,
  });

  // ─── 로그인 작업자 자동 진입 ───
  const operator = typeof window !== "undefined" ? readCurrentOperator() : null;

  // ─── 선택 ───
  const [employeeId, setEmployeeId] = useState<string>(operator?.employee_id ?? "");
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());
  const [selectedPackage, setSelectedPackage] = useState<ShipPackage | null>(null);

  // ─── 섹션 탭 (요청 작성 / 내 요청 / 창고 승인함) ───
  const [sectionTab, setSectionTab] = useState<SectionTab>("compose");
  const [panelRefreshNonce, setPanelRefreshNonce] = useState(0);
  const canSeeQueue =
    (operator?.warehouse_role ?? "none") === "primary" ||
    (operator?.warehouse_role ?? "none") === "deputy";

  // 로그인된 직원 정보가 employees 로드 후에도 같은 ID이도록 보장
  useEffect(() => {
    if (operator && employeeId === "") setEmployeeId(operator.employee_id);
  }, [operator, employeeId]);

  // ─── 메모 ───
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");

  // ─── 실행/UI ───
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ count: number; label: string } | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const [employeeExpanded, setEmployeeExpanded] = useState(false);

  // ─── 모달 ───
  const [showConfirm, setShowConfirm] = useState(false);
  const [resultModal, setResultModal] = useState<
    | {
        kind: "fail" | "partial";
        successCount: number;
        failures: { name: string; reason: string }[];
      }
    | null
  >(null);

  // ─── preselectedItem 처리 ───
  useEffect(() => {
    if (preselectedItem) {
      setSelectedItems(new Map([[preselectedItem.item_id, 1]]));
      setPendingScrollId(preselectedItem.item_id);
    }
  }, [preselectedItem]);

  // ─── selection-derived ───
  const selectedEntries = useMemo(
    () =>
      Array.from(selectedItems.entries())
        .map(([id, qty]) => ({ item: items.find((i) => i.item_id === id)!, quantity: qty }))
        .filter((e) => e.item != null),
    [selectedItems, items],
  );

  const selectedEmployee = employees.find((e) => e.employee_id === employeeId) ?? null;
  const step1Done = !!selectedEmployee;
  const hasSelectedPackage = !!selectedPackage;
  const hasSelectedItems = selectedEntries.length > 0;

  // ─── wizard state (hook) ───
  const wizard = useWarehouseWizardState({ step1Done, hasSelectedPackage, hasSelectedItems });
  const {
    workType, rawDirection, warehouseDirection, deptDirection, selectedDept, defectiveSource,
    forcedStep, setWorkType, setForcedStep, setStep2Confirmed, step2Done, step2State,
    showStep3, showStep4, showStep5, resetWizardConfig,
  } = wizard;

  // ─── scroll (hook) ───
  const refs = useWarehouseScroll({ step1Done, step2Done, forcedStep, lastResult });

  // ─── workType-derived ───
  const isOutbound =
    workType === "raw-io"
      ? rawDirection === "out"
      : workType === "warehouse-io"
        ? warehouseDirection === "wh-to-dept"
        : workType === "dept-io"
          ? deptDirection === "out"
          : true;

  const effectiveLabel =
    workType === "raw-io"
      ? `원자재 ${rawDirection === "in" ? "입고" : "출고"}`
      : workType === "warehouse-io"
        ? warehouseDirection === "wh-to-dept"
          ? `창고→${selectedDept} 이동`
          : `${selectedDept}→창고 복귀`
        : workType === "dept-io"
          ? `${selectedDept} ${deptDirection === "in" ? "입고" : "출고"}`
          : workType === "defective-register"
            ? `불량 등록 (${defectiveSource === "warehouse" ? "창고" : selectedDept} → ${selectedDept} 격리)`
            : workType === "supplier-return"
              ? `공급업체 반품 (${selectedDept} 불량)`
              : "패키지 출고";

  const shortLabel = effectiveLabel.replace(/\s*\(.*\)\s*$/, "");
  const totalQty = Array.from(selectedItems.values()).reduce((sum, q) => sum + q, 0);
  const quantityInvalid =
    workType !== "package-out" && selectedEntries.some((e) => e.quantity <= 0);
  const canExecute =
    !!selectedEmployee
    && (workType === "package-out" ? !!selectedPackage : selectedEntries.length > 0)
    && !quantityInvalid;
  const accent = isOutbound ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
  const isCaution = CAUTION_WORK_TYPES.includes(workType);

  // ─── filters (hook) ───
  const filter = useWarehouseFilters({
    items, packages, selectedItems, globalSearch, isPackageMode: workType === "package-out",
  });

  // ─── completion feedback (hook) ───
  const { completionFlyout, completionPhase } = useWarehouseCompletionFeedback({
    lastResult,
    workType,
    rawDirection,
    warehouseDirection,
    deptDirection,
  });

  // ─── parent-owned wrapped setters (cross-cutting) ───
  function changeWorkType(wt: WorkType) {
    if (wt === workType) return;
    setWorkType(wt);
    setSelectedItems(new Map());
    setSelectedPackage(null);
    setStep2Confirmed(false);
    setError(null);
  }

  function selectEmployee(id: string) {
    setEmployeeId(id);
    setForcedStep(null);
  }

  // ─── 승인 필요 여부 (UI 라벨/메시지 분기용) ───
  const requiresApproval = inputRequiresApproval({
    workType,
    rawDirection,
    warehouseDirection,
    deptDirection,
    defectiveSource,
  });

  // ─── 단일 통합 제출: /api/stock-requests 한 번 호출 ───
  async function submit() {
    if (!selectedEmployee) return setError("담당 직원을 먼저 선택해 주세요.");
    if (workType === "package-out" && !selectedPackage) return setError("출고할 패키지를 선택해 주세요.");
    if (workType !== "package-out" && selectedEntries.length === 0) return setError("품목을 먼저 선택해 주세요.");
    if (workType !== "package-out" && selectedEntries.some((e) => e.quantity <= 0))
      return setError("모든 선택 품목의 수량은 1 이상이어야 합니다.");

    try {
      setSubmitting(true);
      setError(null);

      const payload = buildStockRequestPayload({
        workType,
        rawDirection,
        warehouseDirection,
        deptDirection,
        selectedDept,
        defectiveSource,
        entries: selectedEntries,
        selectedPackage,
        requesterEmployeeId: selectedEmployee.employee_id,
        referenceNo,
        notes,
      });

      try {
        await api.createStockRequest(payload);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "요청 처리를 완료하지 못했습니다.";
        setResultModal({ kind: "fail", successCount: 0, failures: [{ name: "요청 제출", reason }] });
        return;
      }

      // 승인 불필요(즉시 처리) 흐름은 재고가 즉시 반영됨 → items 갱신.
      // 승인 필요(점유) 흐름은 pending_quantity 만 변하므로 마찬가지로 갱신.
      try {
        const refreshed = await api.getItems({ limit: 2000, search: globalSearch.trim() || undefined });
        setItems(refreshed);
      } catch {
        /* 무시: 후속 작업 우선 */
      }

      const doneCount = workType !== "package-out" ? selectedEntries.length : 1;
      setReferenceNo("");
      setNotes("");
      setSelectedItems(new Map());
      setStep2Confirmed(false);
      setForcedStep(null);
      setLastResult({ count: doneCount, label: effectiveLabel });
      const finishedMessage = requiresApproval
        ? `${effectiveLabel} — 창고 승인 요청을 제출했습니다.`
        : `${effectiveLabel} ${workType !== "package-out" ? selectedEntries.length + "건 " : ""}처리를 완료했습니다.`;
      onStatusChange(finishedMessage);
      setPanelRefreshNonce((n) => n + 1);
      onSubmitSuccess?.();
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "처리를 완료하지 못했습니다.";
      setResultModal({ kind: "fail", successCount: 0, failures: [{ name: "실행", reason: message }] });
      onStatusChange(message);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── helpers ───
  const stockShortage =
    workType !== "package-out"
    && isOutbound
    && selectedEntries.some((e) => Number(e.item.quantity) - e.quantity < 0);

  const blockerText = !selectedEmployee
    ? "담당자를 선택하세요"
    : workType === "package-out" && !selectedPackage
      ? "출고할 패키지를 선택하세요"
      : workType !== "package-out" && selectedEntries.length === 0
        ? "품목을 선택하세요"
        : quantityInvalid
          ? "수량을 확인하세요"
          : stockShortage
            ? "출고 후 재고가 음수입니다 — 수량을 다시 확인하세요"
            : null;

  function toggleSelectItem(itemId: string) {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.set(itemId, 1);
      return next;
    });
  }
  function setItemQty(itemId: string, qty: number) {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      next.set(itemId, qty);
      return next;
    });
  }
  function removeItem(itemId: string) {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      next.delete(itemId);
      return next;
    });
  }

  // ─── summaries (for collapsed cards) ───
  const step1Summary = selectedEmployee
    ? `${selectedEmployee.name} · ${normalizeDepartment(selectedEmployee.department)}`
    : "";
  const step2Summary = effectiveLabel;
  const step2Accent = isCaution ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
  const itemsSummary = workType === "package-out"
    ? selectedPackage?.name ?? ""
    : selectedEntries.length > 0
      ? `${selectedEntries.length}건 · 총 ${formatNumber(totalQty)}`
      : "";
  const stickySummary: { n: number; title: string; text: string } | null =
    showStep4 || showStep5
      ? itemsSummary
        ? { n: 3, title: "품목", text: itemsSummary }
        : null
      : showStep3
        ? { n: 2, title: "작업 유형", text: step2Summary }
        : step1Done && step2State !== "complete"
          ? { n: 1, title: "담당자", text: step1Summary }
          : null;

  // ─── post-success reset effect ───
  const prevLastResultRef = useRef<{ count: number; label: string } | null>(null);

  function resetAfterSuccess() {
    resetWizardConfig();
    setSelectedItems(new Map());
    setSelectedPackage(null);
    setNotes("");
    setReferenceNo("");
  }

  useEffect(() => {
    if (lastResult && lastResult !== prevLastResultRef.current) {
      resetAfterSuccess();
      onStatusChange(`방금 완료 · ${lastResult.label} · ${lastResult.count}건`);
    }
    prevLastResultRef.current = lastResult;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResult]);

  // ESC 닫기는 ConfirmModal 내부에서 busy 잠금과 함께 처리

  // ─── 섹션 탭 헤더 ───
  function renderSectionTabs() {
    const tabs: { id: SectionTab; label: string }[] = [
      { id: "compose", label: "요청 작성" },
      { id: "mine", label: "내 요청" },
    ];
    if (canSeeQueue) tabs.push({ id: "queue", label: "창고 승인함" });
    return (
      <div className="flex items-center gap-2">
        {tabs.map((t) => {
          const active = sectionTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSectionTab(t.id)}
              className="rounded-full border px-4 py-1.5 text-sm font-bold transition"
              style={{
                background: active ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
                color: active ? "white" : LEGACY_COLORS.text,
                borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    );
  }

  // ─── render ───
  return (
    <div className="flex h-full min-h-0 flex-1 justify-center overflow-y-auto pr-4" ref={refs.scrollRootRef}>
      <WarehouseCompletionOverlay flyout={completionFlyout} phase={completionPhase} />

      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-6 pb-10 pt-4">
        <WarehouseHeader loadFailure={loadFailure} />
        {renderSectionTabs()}

        {sectionTab === "mine" && (
          <MyRequestsPanel
            employeeId={employeeId || operator?.employee_id || null}
            refreshNonce={panelRefreshNonce}
            onChanged={() => {
              setPanelRefreshNonce((n) => n + 1);
              onSubmitSuccess?.();
            }}
          />
        )}

        {sectionTab === "queue" && canSeeQueue && operator && (
          <WarehouseQueuePanel
            approverEmployeeId={operator.employee_id}
            refreshNonce={panelRefreshNonce}
            onChanged={async () => {
              setPanelRefreshNonce((n) => n + 1);
              try {
                const refreshed = await api.getItems({ limit: 2000, search: globalSearch.trim() || undefined });
                setItems(refreshed);
              } catch {
                /* 무시 */
              }
              onSubmitSuccess?.();
            }}
          />
        )}

        {sectionTab !== "compose" ? null : (
          <>
        <WarehouseStickySummary summary={stickySummary} />

        <WarehouseStepLayout
          wizard={wizard}
          filter={filter}
          refs={refs}
          step1Done={step1Done}
          step1Summary={step1Summary}
          employees={employees}
          employeeId={employeeId}
          onSelectEmployee={selectEmployee}
          employeeExpanded={employeeExpanded}
          setEmployeeExpanded={setEmployeeExpanded}
          onEditStep1={() => setForcedStep(1)}
          step2Summary={step2Summary}
          step2Accent={step2Accent}
          onChangeWorkType={changeWorkType}
          onEditStep2={() => setForcedStep(2)}
          itemsSummary={itemsSummary}
          selectedItems={selectedItems}
          selectedPackage={selectedPackage}
          onToggleItem={toggleSelectItem}
          onSelectPackage={setSelectedPackage}
          productModels={productModels}
          pendingScrollId={pendingScrollId}
          onScrolled={() => setPendingScrollId(null)}
          accent={accent}
          selectedEntries={selectedEntries}
          isOutbound={isOutbound}
          onQuantityChange={setItemQty}
          onRemoveItem={removeItem}
          onClearPackage={() => setSelectedPackage(null)}
          notes={notes}
          setNotes={setNotes}
          totalQty={totalQty}
          shortLabel={shortLabel}
          canExecute={canExecute}
          isCaution={isCaution}
          blockerText={blockerText}
          submitting={submitting}
          onSubmit={() => setShowConfirm(true)}
        />

        {error && (
          <div
            className="rounded-[14px] border px-4 py-3 text-sm"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`,
              color: LEGACY_COLORS.red,
            }}
          >
            {error}
          </div>
        )}
          </>
        )}
      </div>

      <ResultModal
        open={!!resultModal}
        kind={resultModal?.kind ?? "fail"}
        successCount={resultModal?.successCount ?? 0}
        failures={resultModal?.failures ?? []}
        onClose={() => setResultModal(null)}
        primaryAction={
          resultModal?.kind === "partial"
            ? {
                label: "실패 항목만 재시도",
                tone: "warning",
                onClick: () => {
                  setResultModal(null);
                  setShowConfirm(true);
                },
              }
            : resultModal?.kind === "fail"
              ? {
                  label: "재시도",
                  tone: "danger",
                  onClick: () => {
                    setResultModal(null);
                    setShowConfirm(true);
                  },
                }
              : undefined
        }
      />

      <ConfirmModal
        open={showConfirm}
        title={requiresApproval ? "창고 승인 요청 — 최종 확인" : "즉시 처리 — 최종 확인"}
        tone={isCaution ? "danger" : "normal"}
        cautionMessage={
          isCaution
            ? "되돌릴 수 없는 작업입니다. 내용을 다시 한 번 확인하세요."
            : requiresApproval
              ? "제출 후 창고 담당자(정/부)의 승인 전까지 실제 재고는 변경되지 않습니다."
              : undefined
        }
        onClose={() => setShowConfirm(false)}
        onConfirm={async () => {
          await submit();
          setShowConfirm(false);
        }}
        busy={submitting}
        busyLabel="처리 중..."
        confirmLabel={requiresApproval ? "요청 제출" : "즉시 처리"}
        confirmAccent={accent}
      >
        <WarehouseConfirmContent
          selectedEmployee={selectedEmployee}
          effectiveLabel={effectiveLabel}
          workType={workType}
          selectedEntries={selectedEntries}
          selectedPackage={selectedPackage}
          totalQty={totalQty}
          notes={notes}
        />
      </ConfirmModal>
    </div>
  );
}
