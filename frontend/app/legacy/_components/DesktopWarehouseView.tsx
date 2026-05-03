"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Item, type ShipPackage, type StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
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
import { draftToFormState } from "./_warehouse_helpers/requestMapping";
import { useWarehouseSubmit } from "./_warehouse_helpers/useWarehouseSubmit";
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

  // ─── 단일 통합 제출: useWarehouseSubmit hook (Round-15 #1) ───
  const submit = useWarehouseSubmit({
    selectedEmployee,
    workType, rawDirection, warehouseDirection, deptDirection, selectedDept, defectiveSource,
    selectedEntries, selectedPackage, referenceNo, notes,
    currentDraftId, effectiveLabel, requiresApproval, globalSearch,
    setItems, setError, setSubmitting, setLastResult, setResultModal,
    setCurrentDraftId, setAutoSaveStatus, setReferenceNo, setNotes,
    setSelectedItems, setStep2Confirmed, setForcedStep, setPanelRefreshNonce,
    autoSaveTimerRef,
    onStatusChange, onSubmitSuccess,
  });

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
