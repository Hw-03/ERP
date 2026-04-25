"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Employee, type Item, type ProductModel, type ShipPackage } from "@/lib/api";
import { LEGACY_COLORS, formatNumber, normalizeDepartment } from "./legacyUi";
import { LoadFailureCard } from "./common/LoadFailureCard";
import { ResultModal } from "./common/ResultModal";
import { ConfirmModal } from "./common/ConfirmModal";
import {
  CAUTION_WORK_TYPES,
  EmployeeStep,
  ExecuteStep,
  ItemPickStep,
  QuantityStep,
  WizardStepCard,
  WorkTypeStep,
  type WorkType,
} from "./_warehouse_steps";
import { useWarehouseFilters } from "./_warehouse_hooks/useWarehouseFilters";
import { useWarehouseWizardState } from "./_warehouse_hooks/useWarehouseWizardState";
import { useWarehouseCompletionFeedback } from "./_warehouse_hooks/useWarehouseCompletionFeedback";

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
  // ─── 데이터 ───
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);

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

  // ─── 최종 실행 확인 팝업 ───
  const [showConfirm, setShowConfirm] = useState(false);

  // ─── 실행 결과 모달 (실패 / 부분 실패) ───
  const [resultModal, setResultModal] = useState<
    | {
        kind: "fail" | "partial";
        successCount: number;
        failures: { name: string; reason: string }[];
      }
    | null
  >(null);
  // 데이터 로드 실패 — 빈 화면 방지용 인라인 안내
  const [loadFailure, setLoadFailure] = useState<string | null>(null);

  // ─── refs (스크롤/sticky용) ───
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);
  const step4Ref = useRef<HTMLDivElement>(null);
  const prevStep1DoneRef = useRef(false);
  const prevStep2DoneRef = useRef(false);
  const prevForcedStepRef = useRef<1 | 2 | null>(null);
  const prevLastResultRef = useRef<{ count: number; label: string } | null>(null);

  // ───────────────────── data load ─────────────────────

  useEffect(() => {
    void api
      .getModels()
      .then((models) => setProductModels(models))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "모델 목록을 불러오지 못했습니다.";
        onStatusChange(msg);
      });
  }, [onStatusChange]);

  useEffect(() => {
    void Promise.all([
      api.getEmployees({ activeOnly: true }),
      api.getItems({ limit: 2000, search: globalSearch.trim() || undefined }),
      api.getShipPackages(),
    ])
      .then(([nextEmployees, nextItems, nextPackages]) => {
        setEmployees(nextEmployees);
        setItems(nextItems);
        setPackages(nextPackages);
        setLoadFailure(null);
        onStatusChange(`입출고 준비 완료: 직원 ${nextEmployees.length}명, 품목 ${nextItems.length}건`);
      })
      .catch((nextError) => {
        const msg = nextError instanceof Error ? nextError.message : "입출고 데이터를 불러오지 못했습니다.";
        setLoadFailure(msg);
        onStatusChange(msg);
      });
  }, [globalSearch, onStatusChange]);

  useEffect(() => {
    if (preselectedItem) {
      setSelectedItems(new Map([[preselectedItem.item_id, 1]]));
      setPendingScrollId(preselectedItem.item_id);
    }
  }, [preselectedItem]);

  // ───────────────────── selection-derived ─────────────────────

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

  // ───────────────────── wizard state (extracted to hook) ─────────────────────

  const {
    workType,
    rawDirection,
    warehouseDirection,
    deptDirection,
    selectedDept,
    defectiveSource,
    forcedStep,
    setWorkType,
    setForcedStep,
    setStep2Confirmed,
    changeRawDir,
    changeWarehouseDir,
    changeDeptDir,
    changeSelectedDept,
    changeDefectiveSource,
    confirmStep2,
    step2Ready,
    step2Done,
    step1State,
    step2State,
    hasItems,
    showStep3,
    showStep4,
    showStep5,
    resetWizardConfig,
  } = useWarehouseWizardState({ step1Done, hasSelectedPackage, hasSelectedItems });

  // ───────────────────── workType-derived ─────────────────────

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

  // ───────────────────── filters (extracted to hook) ─────────────────────

  const {
    localSearch,
    setLocalSearch,
    dept,
    setDept,
    modelFilter,
    setModelFilter,
    categoryFilter,
    setCategoryFilter,
    displayLimit,
    setDisplayLimit,
    filteredItems,
    filteredPackages,
    hiddenSelectedCount,
    hasActiveFilter,
    clearFilters,
  } = useWarehouseFilters({
    items,
    packages,
    selectedItems,
    globalSearch,
    isPackageMode: workType === "package-out",
  });

  // ───────────────────── completion feedback (extracted to hook) ─────────────────────

  const { completionFlyout, completionPhase } = useWarehouseCompletionFeedback({
    lastResult,
    workType,
    rawDirection,
    warehouseDirection,
    deptDirection,
  });

  // ───────────────────── parent-owned wrapped setters (cross-cutting) ─────────────────────

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

  // ───────────────────── api calls (preserved) ─────────────────────

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

  // ───────────────────── helpers ─────────────────────

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

  // ───────────────────── summaries (for collapsed cards) ─────────────────────

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

  // 직전 단계 sticky 요약 (가장 최근 complete 1개)
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

  // ───────────────────── effects: post-success reset / status / scroll ─────────────────────

  function resetAfterSuccess() {
    resetWizardConfig();
    setSelectedItems(new Map());
    setSelectedPackage(null);
    setNotes("");
    setReferenceNo("");
  }

  // submit() 본문은 변경하지 않음 — lastResult 변화를 watch해서 추가 reset/status 처리
  useEffect(() => {
    if (lastResult && lastResult !== prevLastResultRef.current) {
      resetAfterSuccess();
      onStatusChange(`방금 완료 · ${lastResult.label} · ${lastResult.count}건`);
    }
    prevLastResultRef.current = lastResult;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResult]);

  // 자동 스크롤 — 카드 mount 애니메이션이 먼저 보이고 그 뒤로 스크롤이 따라오는 느낌
  function scrollToRef(ref: React.RefObject<HTMLDivElement>, delay = 150) {
    window.setTimeout(() => {
      requestAnimationFrame(() => {
        ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }, delay);
  }
  useEffect(() => {
    if (step1Done && !prevStep1DoneRef.current) scrollToRef(step2Ref);
    prevStep1DoneRef.current = step1Done;
  }, [step1Done]);
  useEffect(() => {
    if (step2Done && !prevStep2DoneRef.current) scrollToRef(step3Ref);
    prevStep2DoneRef.current = step2Done;
  }, [step2Done]);
  useEffect(() => {
    if (lastResult && lastResult !== prevLastResultRef.current) {
      // submit 완료 후 작업유형(2단계)으로 부드럽게 복귀 — 약간 더 여유있게
      scrollToRef(step2Ref, 200);
    }
  }, [lastResult]);

  useEffect(() => {
    if (forcedStep === 1 && prevForcedStepRef.current !== 1) scrollToRef(step1Ref);
    if (forcedStep === 2 && prevForcedStepRef.current !== 2) scrollToRef(step2Ref);
    prevForcedStepRef.current = forcedStep;
  }, [forcedStep]);

  // ESC 닫기는 ConfirmModal 내부에서 busy 잠금과 함께 처리

  // ───────────────────── render ─────────────────────

  return (
    <div className="flex h-full min-h-0 flex-1 justify-center overflow-y-auto pr-4" ref={scrollRootRef}>
      {completionFlyout && (() => {
        const isIn = completionFlyout.kind === "in";
        const tone = isIn ? LEGACY_COLORS.green : LEGACY_COLORS.yellow;
        const heading = isIn ? "입고 완료" : "출고 완료";
        return (
          <div
            key={completionFlyout.nonce}
            className="pointer-events-none fixed left-1/2 top-1/2 z-[400]"
            style={{
              transition: "opacity 380ms ease-out, transform 380ms ease-out",
              willChange: "transform, opacity",
              transform:
                completionPhase === "out"
                  ? "translate(-50%, -50%) scale(0.94)"
                  : "translate(-50%, -50%) scale(1)",
              opacity: completionPhase === "out" ? 0 : 1,
            }}
          >
            <div
              className="rounded-[36px] border-2 px-16 py-12 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)]"
              style={{
                background: `linear-gradient(135deg, ${tone}, color-mix(in srgb, ${tone} 68%, #000 32%))`,
                borderColor: `color-mix(in srgb, ${tone} 55%, #fff 45%)`,
                color: "#ffffff",
                minWidth: 380,
              }}
            >
              <div className="text-center text-[48px] font-black leading-none tracking-[-0.02em]">
                {heading}
              </div>
              <div className="mt-4 text-center text-xl font-bold opacity-90">
                {completionFlyout.count}건
              </div>
            </div>
          </div>
        );
      })()}
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-6 pb-10 pt-4">
        {/* 헤더 */}
        <header className="pb-1">
          <h1 className="text-2xl font-black" style={{ color: LEGACY_COLORS.text }}>
            입출고 작업
          </h1>
        </header>

        {/* 데이터 로드 실패 안내 — 빈 화면 방지 */}
        {loadFailure && <LoadFailureCard message={loadFailure} />}

        {/* 직전 단계 sticky 요약 — 압축된 완료 카드 느낌 */}
        {stickySummary && (
          <div
            className="sticky top-0 z-10 flex items-center gap-3 rounded-[18px] border px-4 py-3 backdrop-blur-md"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.s1} 92%, transparent)`,
              borderColor: LEGACY_COLORS.border,
            }}
          >
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black"
              style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}
            >
              {stickySummary.n}
            </div>
            <div className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-[0.12em]" style={{ color: LEGACY_COLORS.muted2 }}>
              {stickySummary.title}
            </div>
            <div className="min-w-0 max-w-[60%] truncate text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
              {stickySummary.text}
            </div>
          </div>
        )}

        {/* 1단계: 담당자 */}
        <div ref={step1Ref} style={{ scrollMarginTop: 56 }}>
          <WizardStepCard
            n={1}
            title={step1State === "active" ? "담당자를 선택하세요" : "담당자"}
            state={step1State}
            summary={step1Summary}
            onChange={step1State === "complete" ? () => setForcedStep(1) : undefined}
          >
            <EmployeeStep
              employees={employees}
              selectedId={employeeId}
              onSelect={selectEmployee}
              expanded={employeeExpanded}
              setExpanded={setEmployeeExpanded}
            />
          </WizardStepCard>
        </div>

        {/* 2단계: 작업 유형 (담당자 선택 후에만 등장) */}
        {step1Done && (
          <div ref={step2Ref} style={{ scrollMarginTop: 56 }}>
            <WizardStepCard
              n={2}
              title={step2State === "active" ? "작업 유형을 선택하세요" : "작업 유형"}
              state={step2State}
              summary={step2Summary}
              onChange={step2State === "complete" ? () => setForcedStep(2) : undefined}
              accent={step2Accent}
            >
              <WorkTypeStep
                workType={workType}
                onWorkTypeChange={changeWorkType}
                rawDirection={rawDirection}
                setRawDirection={changeRawDir}
                warehouseDirection={warehouseDirection}
                setWarehouseDirection={changeWarehouseDir}
                deptDirection={deptDirection}
                setDeptDirection={changeDeptDir}
                selectedDept={selectedDept}
                setSelectedDept={changeSelectedDept}
                defectiveSource={defectiveSource}
                setDefectiveSource={changeDefectiveSource}
                ready={step2Ready}
                onConfirm={confirmStep2}
              />
            </WizardStepCard>
          </div>
        )}

        {/* 3단계: 품목 선택 */}
        {showStep3 && (
          <div ref={step3Ref} style={{ scrollMarginTop: 56 }}>
            <WizardStepCard
              n={3}
              title={hasItems ? `품목 ${itemsSummary}` : "품목을 선택하세요"}
              state="active"
            >
              <ItemPickStep
                workType={workType}
                filteredItems={filteredItems}
                filteredPackages={filteredPackages}
                selectedItems={selectedItems}
                selectedPackage={selectedPackage}
                onToggleItem={toggleSelectItem}
                onSelectPackage={setSelectedPackage}
                productModels={productModels}
                dept={dept}
                setDept={setDept}
                modelFilter={modelFilter}
                setModelFilter={setModelFilter}
                categoryFilter={categoryFilter}
                setCategoryFilter={setCategoryFilter}
                localSearch={localSearch}
                setLocalSearch={setLocalSearch}
                displayLimit={displayLimit}
                setDisplayLimit={setDisplayLimit}
                hiddenSelectedCount={hiddenSelectedCount}
                hasActiveFilter={hasActiveFilter}
                clearFilters={clearFilters}
                pendingScrollId={pendingScrollId}
                onScrolled={() => setPendingScrollId(null)}
              />
            </WizardStepCard>
          </div>
        )}

        {/* 4단계: 수량 · 메모 */}
        {showStep4 && (
          <div ref={step4Ref} style={{ scrollMarginTop: 56 }}>
            <WizardStepCard
              n={4}
              title="수량 · 메모"
              state="active"
              accent={accent}
            >
              <QuantityStep
                workType={workType}
                selectedEntries={selectedEntries}
                isOutbound={isOutbound}
                selectedPackage={selectedPackage}
                onQuantityChange={(itemId, qty) => {
                  setSelectedItems((prev) => {
                    const next = new Map(prev);
                    next.set(itemId, qty);
                    return next;
                  });
                }}
                onRemove={(itemId) => {
                  setSelectedItems((prev) => {
                    const next = new Map(prev);
                    next.delete(itemId);
                    return next;
                  });
                }}
                onClearPackage={() => setSelectedPackage(null)}
                notes={notes}
                setNotes={setNotes}
                totalQty={totalQty}
              />
            </WizardStepCard>
          </div>
        )}

        {/* 5단계: 실행 */}
        {showStep5 && (
          <WizardStepCard
            n={5}
            title="실행"
            state="active"
            accent={accent}
          >
            <ExecuteStep
              shortLabel={shortLabel}
              workType={workType}
              selectedEntries={selectedEntries}
              canExecute={canExecute}
              isCaution={isCaution}
              accent={accent}
              blockerText={blockerText}
              submitting={submitting}
              onSubmit={() => setShowConfirm(true)}
            />
          </WizardStepCard>
        )}

        {/* 에러 */}
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

      {/* 실행 결과 모달 — 완전 실패 / 부분 실패 */}
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

      {/* 최종 실행 확인 팝업 */}
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
        <dl
          className="mb-4 grid grid-cols-[100px_1fr] gap-x-3 gap-y-2 rounded-[14px] border p-3 text-sm"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>담당자</dt>
          <dd className="font-black" style={{ color: LEGACY_COLORS.text }}>
            {selectedEmployee
              ? `${selectedEmployee.name} · ${normalizeDepartment(selectedEmployee.department)}`
              : "-"}
          </dd>
          <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>작업</dt>
          <dd className="font-black" style={{ color: LEGACY_COLORS.text }}>{effectiveLabel}</dd>
          {workType !== "package-out" ? (
            <>
              <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>품목 수</dt>
              <dd className="font-black" style={{ color: LEGACY_COLORS.text }}>{selectedEntries.length}건</dd>
              <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>총 수량</dt>
              <dd className="font-black tabular-nums" style={{ color: LEGACY_COLORS.text }}>
                {formatNumber(totalQty)} EA
              </dd>
            </>
          ) : (
            <>
              <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>패키지</dt>
              <dd className="font-black" style={{ color: LEGACY_COLORS.text }}>{selectedPackage?.name ?? "-"}</dd>
            </>
          )}
          {notes && (
            <>
              <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>메모</dt>
              <dd className="truncate" style={{ color: LEGACY_COLORS.text }}>{notes}</dd>
            </>
          )}
        </dl>

        {workType !== "package-out" && selectedEntries.length > 0 && (
          <div
            className="mb-1 max-h-[180px] overflow-y-auto rounded-[14px] border"
            style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, overscrollBehavior: "contain" }}
          >
            <ul className="divide-y" style={{ borderColor: LEGACY_COLORS.border }}>
              {selectedEntries.map((entry) => (
                <li
                  key={entry.item.item_id}
                  className="flex items-center justify-between px-3 py-2 text-xs"
                  style={{ borderColor: LEGACY_COLORS.border }}
                >
                  <span className="truncate" style={{ color: LEGACY_COLORS.text }}>
                    {entry.item.item_name}
                  </span>
                  <span className="shrink-0 font-black tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>
                    ×{formatNumber(entry.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}
