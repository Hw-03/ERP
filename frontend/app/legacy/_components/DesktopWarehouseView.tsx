"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Item, type ShipPackage, type StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "./legacyUi";
import { formatQty } from "@/lib/mes/format";
import { type WorkType } from "./_warehouse_steps";
import { canEnterIO } from "./_warehouse_steps";
import { useWarehouseFilters } from "./_warehouse_hooks/useWarehouseFilters";
import { useWarehouseWizardState } from "./_warehouse_hooks/useWarehouseWizardState";
import { useWarehouseCompletionFeedback } from "./_warehouse_hooks/useWarehouseCompletionFeedback";
import { useWarehouseData } from "./_warehouse_hooks/useWarehouseData";
import { useWarehouseScroll } from "./_warehouse_hooks/useWarehouseScroll";
import { useWarehouseDraft } from "./_warehouse_hooks/useWarehouseDraft";
import { useWarehouseDerivations } from "./_warehouse_hooks/useWarehouseDerivations";
import { WarehouseHeader } from "./_warehouse_sections/WarehouseHeader";
import { WarehouseCompletionOverlay } from "./_warehouse_sections/WarehouseCompletionOverlay";
import { WarehouseSectionTabs, type WarehouseSectionTab } from "./_warehouse_sections/WarehouseSectionTabs";
import { WarehouseAccessDenied } from "./_warehouse_sections/WarehouseAccessDenied";
import { WarehouseSubmissionModals } from "./_warehouse_modals/WarehouseSubmissionModals";
import { WarehouseDraftPanelTabs } from "./_warehouse_sections/WarehouseDraftPanelTabs";
import { WarehouseComposeSection } from "./_warehouse_sections/WarehouseComposeSection";
import {
  buildStockRequestPayload,
  draftToFormState,
} from "./_warehouse_helpers/requestMapping";
import { readCurrentOperator } from "./login/useCurrentOperator";

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

  // ─── 섹션 탭 (요청 작성 / 장바구니 / 내 요청 / 창고 승인함) ───
  const [sectionTab, setSectionTab] = useState<WarehouseSectionTab>("compose");
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

  // ─── 모달 ───
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingDeptChange, setPendingDeptChange] = useState<import("@/lib/api").Department | null>(null);
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
  const wizard = useWarehouseWizardState({
    step1Done,
    hasSelectedPackage,
    hasSelectedItems,
    initialDept: (operator?.department as import("@/lib/api").Department | undefined) ?? "조립",
  });
  const {
    workType, rawDirection, warehouseDirection, deptDirection, selectedDept, defectiveSource,
    setWorkType, setForcedStep, setStep2Confirmed,
    showStep3, showStep4, showStep5, resetWizardConfig,
  } = wizard;

  // ─── scroll (hook) ───
  const refs = useWarehouseScroll({
    step1Done,
    step2Done: wizard.step2Done,
    forcedStep: wizard.forcedStep,
    lastResult,
  });

  // ─── derivation (hook) ─── effectiveLabel / canExecute / accent / blockerText / requiresApproval / currentRequestType / availableWorkTypes
  const {
    isOutbound,
    isCaution,
    effectiveLabel,
    shortLabel,
    totalQty,
    quantityInvalid,
    canExecute,
    blockerText,
    accent,
    requiresApproval,
    currentRequestType,
    availableWorkTypes,
  } = useWarehouseDerivations({
    operator,
    selectedEmployee,
    selectedItems,
    selectedEntries,
    selectedPackage,
    workType,
    rawDirection,
    warehouseDirection,
    deptDirection,
    selectedDept,
    defectiveSource,
  });

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

  // ─── 장바구니 autosave / 복원 (Round-10A #4 에서 hook 으로 추출) ───
  const {
    currentDraftId,
    setCurrentDraftId,
    autoSaveStatus,
    setAutoSaveStatus,
    restoringRef,
    autoSaveTimerRef,
  } = useWarehouseDraft({
    operator,
    selectedEmployee,
    workType,
    rawDirection,
    warehouseDirection,
    deptDirection,
    selectedDept,
    defectiveSource,
    selectedItems,
    selectedPackage,
    notes,
    referenceNo,
    currentRequestType,
    sectionTab,
    selectedEntries,
    setSelectedItems,
    setSelectedPackage,
    setNotes,
    setReferenceNo,
  });

  // ─── parent-owned wrapped setters (cross-cutting) ───
  function changeWorkType(wt: WorkType) {
    if (wt === workType) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    restoringRef.current = true;
    setWorkType(wt);
    setSelectedItems(new Map());
    setSelectedPackage(null);
    setNotes("");
    setReferenceNo("");
    setCurrentDraftId(null);
    setAutoSaveStatus("idle");
    setStep2Confirmed(false);
    setError(null);
    setTimeout(() => { restoringRef.current = false; }, 0);
  }

  // ─── 장바구니 → "이어서 작성" 핸들러 ───
  const handleContinueDraft = useCallback(
    (draft: StockRequest) => {
      const restored = draftToFormState(draft);
      if (!restored) return;

      restoringRef.current = true;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }

      // wizard state 복원 — 작업유형/방향/부서.
      wizard.setWorkType(restored.workType);
      wizard.changeRawDir(restored.rawDirection);
      wizard.changeWarehouseDir(restored.warehouseDirection);
      wizard.changeDeptDir(restored.deptDirection);
      wizard.changeSelectedDept(restored.selectedDept);
      wizard.changeDefectiveSource(restored.defectiveSource);
      wizard.setStep2Confirmed(true);

      // 폼 데이터 복원 — Map 은 항상 new Map 으로 갱신해 변경 감지.
      setSelectedItems(new Map(restored.selectedItems));
      setNotes(restored.notes);
      setReferenceNo(restored.referenceNo);
      setCurrentDraftId(draft.request_id);
      setAutoSaveStatus("saved");

      setSectionTab("compose");
      setTimeout(() => {
        restoringRef.current = false;
      }, 0);
    },
    [wizard, autoSaveTimerRef, restoringRef, setAutoSaveStatus, setCurrentDraftId],
  );

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

      // 진행 중인 autosave 가 submit 직후의 빈 form 으로 덮어쓰는 일 방지.
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }

      try {
        if (currentDraftId) {
          // 기존 draft 가 있으면 submit 으로 전환.
          await api.submitStockRequestDraft(
            currentDraftId,
            selectedEmployee.employee_id,
          );
        } else {
          // draft 가 없는 경우(예: package-out 또는 막 진입) 안전망으로 직접 생성.
          await api.createStockRequest(payload);
        }
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
      // 제출 완료 — draft 추적 해제 (제출된 요청은 더 이상 DRAFT 가 아님).
      setCurrentDraftId(null);
      setAutoSaveStatus("idle");
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
  const step2Summary = effectiveLabel;
  const step2Accent = isCaution ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
  const itemsSummary = workType === "package-out"
    ? selectedPackage?.name ?? ""
    : selectedEntries.length > 0
      ? `${selectedEntries.length}건 · 총 ${formatQty(totalQty)}`
      : "";
  const stickySummary: { n: number; title: string; text: string } | null =
    showStep4 || showStep5
      ? itemsSummary
        ? { n: 2, title: "품목", text: itemsSummary }
        : null
      : showStep3
        ? { n: 1, title: "작업 유형", text: step2Summary }
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

  // ─── 진입 차단 (AS/연구/영업/기타 — 입출고 권한 없음) ───
  if (operator && !canEnterIO(operator)) {
    return <WarehouseAccessDenied department={operator.department ?? ""} />;
  }

  // ─── render ───
  return (
    <div className="flex h-full min-h-0 flex-1 justify-center overflow-y-auto pr-4" ref={refs.scrollRootRef}>
      <WarehouseCompletionOverlay flyout={completionFlyout} phase={completionPhase} />

      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-6 pb-10 pt-4">
        <WarehouseHeader loadFailure={loadFailure} />
        <WarehouseSectionTabs active={sectionTab} onChange={setSectionTab} showQueue={canSeeQueue} />

        <WarehouseDraftPanelTabs
          sectionTab={sectionTab}
          canSeeQueue={canSeeQueue}
          operatorEmployeeId={operator?.employee_id}
          employeeId={employeeId}
          refreshNonce={panelRefreshNonce}
          globalSearch={globalSearch}
          setItems={setItems}
          onContinueDraft={handleContinueDraft}
          bumpRefresh={() => setPanelRefreshNonce((n) => n + 1)}
          onSubmitSuccess={onSubmitSuccess}
          resetDraftTracking={() => {
            setCurrentDraftId(null);
            setAutoSaveStatus("idle");
          }}
        />

        {sectionTab === "compose" && (
          <WarehouseComposeSection
            autoSaveStatus={autoSaveStatus}
            stickySummary={stickySummary}
            error={error}
            wizard={wizard}
            setPendingDeptChange={setPendingDeptChange}
            filter={filter}
            availableWorkTypes={availableWorkTypes}
            refs={refs}
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
        )}
      </div>

      <WarehouseSubmissionModals
        resultModal={resultModal}
        onCloseResult={() => setResultModal(null)}
        onRetry={() => {
          setResultModal(null);
          setShowConfirm(true);
        }}
        showConfirm={showConfirm}
        onCloseConfirm={() => setShowConfirm(false)}
        onConfirmSubmit={async () => {
          await submit();
          setShowConfirm(false);
        }}
        submitting={submitting}
        requiresApproval={requiresApproval}
        isCaution={isCaution}
        accent={accent}
        selectedEmployee={selectedEmployee}
        effectiveLabel={effectiveLabel}
        workType={workType}
        selectedEntries={selectedEntries}
        selectedPackage={selectedPackage}
        totalQty={totalQty}
        notes={notes}
        pendingDeptChange={pendingDeptChange}
        onClosePendingDept={() => setPendingDeptChange(null)}
        onConfirmDeptChange={() => {
          if (pendingDeptChange) wizard.changeSelectedDept(pendingDeptChange);
          setPendingDeptChange(null);
        }}
      />
    </div>
  );
}
