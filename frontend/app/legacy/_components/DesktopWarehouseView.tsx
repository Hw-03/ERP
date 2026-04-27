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

  // ─── 선택 ───
  const [employeeId, setEmployeeId] = useState("");
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());
  const [selectedPackage, setSelectedPackage] = useState<ShipPackage | null>(null);

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

  // ─── api calls (preserved) ───
  async function dispatchSingleItem(item: Item, qty: number, producedBy: string) {
    const baseRef = referenceNo || undefined;
    const baseNotes = notes || undefined;
    if (workType === "raw-io") {
      const payload = { item_id: item.item_id, quantity: qty, reference_no: baseRef, produced_by: producedBy, notes: baseNotes };
      if (rawDirection === "out") await api.shipInventory(payload);
      else await api.receiveInventory(payload);
    } else if (workType === "warehouse-io") {
      const payload = { item_id: item.item_id, quantity: qty, department: selectedDept, reference_no: baseRef, produced_by: producedBy, notes: baseNotes };
      if (warehouseDirection === "wh-to-dept") await api.transferToProduction(payload);
      else await api.transferToWarehouse(payload);
    } else if (workType === "dept-io") {
      const payload = { item_id: item.item_id, quantity: qty, department: selectedDept, reference_no: baseRef, produced_by: producedBy, notes: baseNotes };
      if (deptDirection === "in") await api.transferToProduction(payload);
      else await api.transferToWarehouse(payload);
    } else if (workType === "defective-register") {
      await api.markDefective({
        item_id: item.item_id,
        quantity: qty,
        source: defectiveSource,
        source_department: defectiveSource === "production" ? selectedDept : undefined,
        target_department: selectedDept,
        reason: baseNotes,
        operator: producedBy,
      });
    } else if (workType === "supplier-return") {
      await api.returnToSupplier({ item_id: item.item_id, quantity: qty, from_department: selectedDept, reference_no: baseRef, notes: baseNotes, operator: producedBy });
    }
  }

  async function submit() {
    if (!selectedEmployee) return setError("담당 직원을 먼저 선택해 주세요.");
    if (workType === "package-out" && !selectedPackage) return setError("출고할 패키지를 선택해 주세요.");
    if (workType !== "package-out" && selectedEntries.length === 0) return setError("품목을 먼저 선택해 주세요.");
    if (workType !== "package-out" && selectedEntries.some((e) => e.quantity <= 0)) return setError("모든 선택 품목의 수량은 1 이상이어야 합니다.");

    try {
      setSubmitting(true);
      setError(null);
      const producedBy = `${selectedEmployee.name} (${normalizeDepartment(selectedEmployee.department)})`;

      if (workType === "package-out" && selectedPackage) {
        try {
          await api.shipPackage({
            package_id: selectedPackage.package_id,
            quantity: 1,
            reference_no: referenceNo || undefined,
            produced_by: producedBy,
            notes: notes || undefined,
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : "패키지 출고에 실패했습니다.";
          // 데이터 정합성을 위해 items는 새로고침해 둠
          try {
            const refreshed = await api.getItems({ limit: 2000, search: globalSearch.trim() || undefined });
            setItems(refreshed);
          } catch { /* 무시 */ }
          setResultModal({ kind: "fail", successCount: 0, failures: [{ name: selectedPackage.name ?? "패키지", reason }] });
          return;
        }
      } else {
        const failures: { name: string; reason: string }[] = [];
        const successIds: string[] = [];
        for (const entry of selectedEntries) {
          try {
            await dispatchSingleItem(entry.item, entry.quantity, producedBy);
            successIds.push(entry.item.item_id);
          } catch (err) {
            const reason = err instanceof Error ? err.message : "처리 실패";
            failures.push({ name: entry.item.item_name, reason });
          }
        }

        // items는 항상 refresh — 부분 성공분이 화면에 반영돼야 함
        try {
          const refreshed = await api.getItems({ limit: 2000, search: globalSearch.trim() || undefined });
          setItems(refreshed);
        } catch { /* 무시: 모달이 우선 */ }

        if (failures.length > 0) {
          // 성공한 항목은 selectedItems에서 제거 → 재시도 시 이중 commit 방지
          if (successIds.length > 0) {
            setSelectedItems((prev) => {
              const next = new Map(prev);
              for (const id of successIds) next.delete(id);
              return next;
            });
            // 부분 성공: 외부에 반영
            onSubmitSuccess?.();
          }
          setResultModal({
            kind: successIds.length > 0 ? "partial" : "fail",
            successCount: successIds.length,
            failures,
          });
          return;
        }
      }

      const doneCount = workType !== "package-out" ? selectedEntries.length : 1;
      setReferenceNo("");
      setNotes("");
      setSelectedItems(new Map());
      setStep2Confirmed(false);
      setForcedStep(null);
      // package-out 흐름은 위 분기에서 이미 refresh 안 했을 수 있으므로 success 직전 한 번 더 보장
      if (workType === "package-out") {
        try {
          const refreshed = await api.getItems({ limit: 2000, search: globalSearch.trim() || undefined });
          setItems(refreshed);
        } catch { /* 무시 */ }
      }
      setLastResult({ count: doneCount, label: effectiveLabel });
      onStatusChange(`${effectiveLabel} ${workType !== "package-out" ? selectedEntries.length + "건 " : ""}처리를 완료했습니다.`);
      onSubmitSuccess?.();
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "입출고 처리를 완료하지 못했습니다.";
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

  // ─── render ───
  return (
    <div className="flex h-full min-h-0 flex-1 justify-center overflow-y-auto pr-4" ref={refs.scrollRootRef}>
      <WarehouseCompletionOverlay flyout={completionFlyout} phase={completionPhase} />

      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-6 pb-10 pt-4">
        <WarehouseHeader loadFailure={loadFailure} />
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
        title="실행 전 최종 확인"
        tone={isCaution ? "danger" : "normal"}
        cautionMessage={isCaution ? "되돌릴 수 없는 작업입니다. 내용을 다시 한 번 확인하세요." : undefined}
        onClose={() => setShowConfirm(false)}
        onConfirm={async () => {
          await submit();
          setShowConfirm(false);
        }}
        busy={submitting}
        busyLabel="처리 중..."
        confirmLabel="최종 실행"
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
