"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { api, type Department, type Employee, type Item, type ProductModel, type ShipPackage } from "@/lib/api";
import { LEGACY_COLORS, normalizeDepartment } from "./legacyUi";
import {
  CAUTION_WORK_TYPES,
  EmployeeStep,
  ExecuteStep,
  ItemPickStep,
  PAGE_SIZE,
  QuantityStep,
  WizardStepCard,
  WorkTypeStep,
  matchesSearch,
  type DefectiveSource,
  type Direction,
  type TransferDirection,
  type WorkType,
} from "./_warehouse_steps";

export function DesktopWarehouseView({
  globalSearch,
  onStatusChange,
  preselectedItem,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  preselectedItem?: Item | null;
}) {
  // ─── 작업 설정 state ───
  const [workType, setWorkType] = useState<WorkType>("raw-io");
  const [rawDirection, setRawDirection] = useState<Direction>("in");
  const [warehouseDirection, setWarehouseDirection] = useState<TransferDirection>("wh-to-dept");
  const [deptDirection, setDeptDirection] = useState<Direction>("in");
  const [selectedDept, setSelectedDept] = useState<Department>("조립");
  const [defectiveSource, setDefectiveSource] = useState<DefectiveSource>("warehouse");

  // ─── 데이터 ───
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);

  // ─── 선택 ───
  const [employeeId, setEmployeeId] = useState("");
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());
  const [selectedPackage, setSelectedPackage] = useState<ShipPackage | null>(null);

  // ─── 검색/필터 ───
  const [localSearch, setLocalSearch] = useState("");
  const [dept, setDept] = useState("ALL");
  const [modelFilter, setModelFilter] = useState("전체");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

  // ─── 메모 ───
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");

  // ─── 실행/UI ───
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ count: number; label: string } | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const [employeeExpanded, setEmployeeExpanded] = useState(false);

  // ─── Wizard 단계 제어 ───
  const [forcedStep, setForcedStep] = useState<1 | 2 | null>(null);
  const [step2Confirmed, setStep2Confirmed] = useState(false);

  // ───────────────────── data load ─────────────────────

  useEffect(() => {
    void api.getModels().then(setProductModels).catch(() => {});
  }, []);

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
        onStatusChange(`입출고 준비 완료: 직원 ${nextEmployees.length}명, 품목 ${nextItems.length}건`);
      })
      .catch((nextError) => {
        onStatusChange(nextError instanceof Error ? nextError.message : "입출고 데이터를 불러오지 못했습니다.");
      });
  }, [globalSearch, onStatusChange]);

  useEffect(() => {
    if (preselectedItem) {
      setSelectedItems(new Map([[preselectedItem.item_id, 1]]));
      setPendingScrollId(preselectedItem.item_id);
    }
  }, [preselectedItem]);

  // ───────────────────── derivations ─────────────────────

  const selectedEntries = useMemo(
    () =>
      Array.from(selectedItems.entries())
        .map(([id, qty]) => ({ item: items.find((i) => i.item_id === id)!, quantity: qty }))
        .filter((e) => e.item != null),
    [selectedItems, items],
  );

  const selectedEmployee = employees.find((e) => e.employee_id === employeeId) ?? null;
  const searchKeyword = `${globalSearch} ${localSearch}`.trim().toLowerCase();

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

  // ───────────────────── filters ─────────────────────

  const filteredItems = useMemo(
    () =>
      items
        .filter((item) => {
          if (dept === "ALL") return true;
          if (dept === "창고") return (item.warehouse_qty ?? 0) > 0;
          return item.locations?.some((loc) => loc.department === dept && loc.quantity > 0) ?? false;
        })
        .filter((item) => modelFilter === "전체" || item.legacy_model === modelFilter)
        .filter((item) => {
          if (categoryFilter === "ALL") return true;
          if (categoryFilter === "RM") return item.category === "RM";
          if (categoryFilter === "A") return ["TA", "HA", "VA", "BA"].includes(item.category);
          if (categoryFilter === "F") return ["TF", "HF", "VF", "AF"].includes(item.category);
          if (categoryFilter === "FG") return item.category === "FG";
          return true;
        })
        .filter((item) => matchesSearch(item, searchKeyword)),
    [items, dept, modelFilter, categoryFilter, searchKeyword],
  );

  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [filteredItems]);

  const filteredPackages = useMemo(
    () =>
      packages.filter((pkg) =>
        searchKeyword ? `${pkg.name} ${pkg.package_code}`.toLowerCase().includes(searchKeyword) : true,
      ),
    [packages, searchKeyword],
  );

  // ───────────────────── step gating ─────────────────────

  const step1Done = !!selectedEmployee;

  const step2Ready =
    workType === "package-out"
      ? true
      : workType === "raw-io"
        ? true
        : workType === "warehouse-io"
          ? !!selectedDept && !!warehouseDirection
          : workType === "dept-io"
            ? !!selectedDept
            : workType === "defective-register"
              ? !!selectedDept && !!defectiveSource
              : workType === "supplier-return"
                ? !!selectedDept
                : false;

  const step2Done = step2Ready && step2Confirmed;
  const hasItems = workType === "package-out" ? !!selectedPackage : selectedEntries.length > 0;

  const step1State: "active" | "complete" | "locked" =
    forcedStep === 1 ? "active" : step1Done ? "complete" : "active";

  const step2State: "active" | "complete" | "locked" =
    forcedStep === 1 || (!step1Done && forcedStep !== 2)
      ? "locked"
      : forcedStep === 2
        ? "active"
        : step2Done
          ? "complete"
          : "active";

  const showStep3 = step1Done && step2Done && forcedStep === null;
  const showStep4 = showStep3 && hasItems;
  const showStep5 = showStep4; // 5단계는 4단계와 함께 노출하고 blocker로 사유 안내

  // ───────────────────── wrapped setters (step2Confirmed reset) ─────────────────────

  function changeWorkType(wt: WorkType) {
    if (wt === workType) return;
    setWorkType(wt);
    setSelectedItems(new Map());
    setSelectedPackage(null);
    setStep2Confirmed(false);
    setError(null);
  }
  function changeRawDir(d: Direction) {
    setRawDirection(d);
    setStep2Confirmed(false);
  }
  function changeWarehouseDir(d: TransferDirection) {
    setWarehouseDirection(d);
    setStep2Confirmed(false);
  }
  function changeDeptDir(d: Direction) {
    setDeptDirection(d);
    setStep2Confirmed(false);
  }
  function changeSelectedDept(d: Department) {
    setSelectedDept(d);
    setStep2Confirmed(false);
  }
  function changeDefectiveSource(s: DefectiveSource) {
    setDefectiveSource(s);
    setStep2Confirmed(false);
  }

  function selectEmployee(id: string) {
    setEmployeeId(id);
    setForcedStep(null);
  }

  function confirmStep2() {
    if (!step2Ready) return;
    setStep2Confirmed(true);
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
        await api.shipPackage({
          package_id: selectedPackage.package_id,
          quantity: 1,
          reference_no: referenceNo || undefined,
          produced_by: producedBy,
          notes: notes || undefined,
        });
      } else {
        const failures: string[] = [];
        for (const entry of selectedEntries) {
          try {
            await dispatchSingleItem(entry.item, entry.quantity, producedBy);
          } catch {
            failures.push(entry.item.item_name);
          }
        }
        if (failures.length > 0) {
          setError(`처리 실패 품목: ${failures.join(", ")}`);
          return;
        }
      }

      const doneCount = workType !== "package-out" ? selectedEntries.length : 1;
      setReferenceNo("");
      setNotes("");
      setSelectedItems(new Map());
      setStep2Confirmed(false);
      setForcedStep(null);
      const refreshed = await api.getItems({ limit: 2000, search: globalSearch.trim() || undefined });
      setItems(refreshed);
      setLastResult({ count: doneCount, label: effectiveLabel });
      onStatusChange(`${effectiveLabel} ${workType !== "package-out" ? selectedEntries.length + "건 " : ""}처리를 완료했습니다.`);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "입출고 처리를 완료하지 못했습니다.";
      setError(message);
      onStatusChange(message);
    } finally {
      setSubmitting(false);
    }
  }

  // ───────────────────── helpers ─────────────────────

  const blockerText = !selectedEmployee
    ? "담당자를 선택하세요"
    : workType === "package-out" && !selectedPackage
      ? "출고할 패키지를 선택하세요"
      : workType !== "package-out" && selectedEntries.length === 0
        ? "품목을 선택하세요"
        : quantityInvalid
          ? "수량을 확인하세요"
          : null;

  function toggleSelectItem(itemId: string) {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.set(itemId, 1);
      return next;
    });
  }

  function resetAll() {
    setSelectedItems(new Map());
    setReferenceNo("");
    setNotes("");
    setEmployeeId("");
    setSelectedPackage(null);
    setError(null);
    setForcedStep(null);
    setStep2Confirmed(false);
  }

  // ───────────────────── summaries (for collapsed cards) ─────────────────────

  const step1Summary = selectedEmployee
    ? `${selectedEmployee.name} · ${normalizeDepartment(selectedEmployee.department)}`
    : "";
  const step2Summary = effectiveLabel;
  const step2Accent = isCaution ? LEGACY_COLORS.red : LEGACY_COLORS.blue;

  // ───────────────────── render ─────────────────────

  return (
    <div className="flex h-full min-h-0 flex-1 justify-center overflow-y-auto pr-4">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-3 px-6 pb-10 pt-4">
        {/* 헤더 */}
        <header className="flex items-center justify-between pb-1">
          <div>
            <h1 className="text-2xl font-black" style={{ color: LEGACY_COLORS.text }}>
              입출고 작업
            </h1>
            <p className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              담당자 → 작업 유형 → 품목 → 수량 → 실행 순서로 진행됩니다.
            </p>
          </div>
          <button
            onClick={resetAll}
            className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors hover:brightness-125"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          >
            <RotateCcw className="h-3 w-3" />
            전체 초기화
          </button>
        </header>

        {/* 방금 완료 토스트 */}
        {lastResult && (
          <div
            className="flex items-center gap-3 rounded-[16px] border px-4 py-3"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.green} 10%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.green} 40%, transparent)`,
            }}
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: LEGACY_COLORS.green }}
            >
              <Check className="h-4 w-4" color="#041008" strokeWidth={3} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.green }}>
                방금 완료
              </div>
              <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                {lastResult.label} · {lastResult.count}건
              </div>
            </div>
            <button
              className="shrink-0 rounded-full p-1 transition-colors hover:bg-white/10"
              style={{ color: LEGACY_COLORS.muted2 }}
              onClick={() => setLastResult(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* 1단계: 담당자 */}
        <WizardStepCard
          n={1}
          title={step1State === "active" ? "담당자를 선택하세요" : "담당자"}
          state={step1State}
          summary={step1Summary}
          onChange={step1State === "complete" ? () => setForcedStep(1) : undefined}
          hint={step1State === "active" ? "입출고 작업을 처리할 담당자를 먼저 선택합니다." : undefined}
        >
          <EmployeeStep
            employees={employees}
            selectedId={employeeId}
            onSelect={selectEmployee}
            expanded={employeeExpanded}
            setExpanded={setEmployeeExpanded}
          />
        </WizardStepCard>

        {/* 2단계: 작업 유형 */}
        <WizardStepCard
          n={2}
          title={step2State === "active" ? "작업 유형을 선택하세요" : "작업 유형"}
          state={step2State}
          summary={step2Summary}
          onChange={step2State === "complete" ? () => setForcedStep(2) : undefined}
          accent={step2Accent}
          hint={
            step2State === "active"
              ? "어떤 종류의 입출고 작업인지 선택하고 방향·부서를 확인하세요."
              : undefined
          }
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

        {/* 3단계: 품목 선택 */}
        {showStep3 && (
          <WizardStepCard
            n={3}
            title={hasItems ? "품목 선택 (계속 추가/해제 가능)" : "품목을 선택하세요"}
            state="active"
            hint={
              hasItems
                ? "필요하면 계속 품목을 추가하거나 해제할 수 있습니다."
                : "입출고할 품목을 선택하면 다음 단계에서 수량을 조정할 수 있습니다."
            }
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
              pendingScrollId={pendingScrollId}
              onScrolled={() => setPendingScrollId(null)}
            />
          </WizardStepCard>
        )}

        {/* 4단계: 수량 · 메모 */}
        {showStep4 && (
          <WizardStepCard
            n={4}
            title="수량 · 메모"
            state="active"
            accent={accent}
            hint="각 품목의 수량을 조정하고 필요 시 참조번호·메모를 입력하세요."
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
              referenceNo={referenceNo}
              setReferenceNo={setReferenceNo}
              notes={notes}
              setNotes={setNotes}
              totalQty={totalQty}
            />
          </WizardStepCard>
        )}

        {/* 5단계: 실행 */}
        {showStep5 && (
          <WizardStepCard
            n={5}
            title="실행"
            state="active"
            accent={accent}
            hint="모든 정보를 확인한 뒤 실행 버튼을 누르세요."
          >
            <ExecuteStep
              effectiveLabel={effectiveLabel}
              shortLabel={shortLabel}
              selectedEmployee={selectedEmployee}
              workType={workType}
              selectedDept={selectedDept}
              totalQty={totalQty}
              selectedEntries={selectedEntries}
              selectedPackage={selectedPackage}
              canExecute={canExecute}
              isCaution={isCaution}
              accent={accent}
              blockerText={blockerText}
              submitting={submitting}
              onSubmit={() => void submit()}
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
    </div>
  );
}
