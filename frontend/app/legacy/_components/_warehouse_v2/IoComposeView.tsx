"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type IoLine, type IoSourceKind, type IoSubType, type IoWorkType, type Item } from "@/lib/api";
import { IoWorkTypeStep } from "./IoWorkTypeStep";
import { IoTargetPicker } from "./IoTargetPicker";
import { IoBundleCart } from "./IoBundleCart";
import { IoConfirmStep } from "./IoConfirmStep";
import { IoSubmitModals, type IoSubmitResultState } from "./IoSubmitModals";
import { DEPARTMENT_OPTIONS, requiresDepartments } from "./ioWorkType";
import { useIoDraft } from "./useIoDraft";
import { useIoPreview } from "./useIoPreview";
import { useIoSubmit } from "./useIoSubmit";
import { useIoWorkState } from "./useIoWorkState";
import type { IoComposeViewProps } from "./types";

function locationQuantity(item: Item, department: string | null | undefined, status: "PRODUCTION" | "DEFECTIVE") {
  if (!department) return 0;
  return item.locations.find((loc) => loc.department === department && loc.status === status)?.quantity ?? 0;
}

export function IoComposeView({
  globalSearch,
  operator,
  employees,
  items,
  packages,
  setItems,
  preselectedItem,
  restoreDraft: draftToRestore,
  onStatusChange,
  onSubmitSuccess,
}: IoComposeViewProps) {
  const [employeeId, setEmployeeId] = useState(operator?.employee_id ?? "");
  const [search, setSearch] = useState(globalSearch);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IoSubmitResultState | null>(null);
  const preselectedHandledRef = useRef<string | null>(null);
  const restoredDraftRef = useRef<string | null>(null);

  const state = useIoWorkState(operator?.department);
  const { previewing, previewTarget } = useIoPreview();
  const { drafting, saveDraft, restoreDraft } = useIoDraft();
  const { submitting, submit } = useIoSubmit();

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.employee_id === employeeId) ?? null,
    [employeeId, employees],
  );

  useEffect(() => {
    if (operator?.employee_id && !employeeId) setEmployeeId(operator.employee_id);
  }, [operator?.employee_id, employeeId]);

  useEffect(() => {
    setSearch(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    if (!draftToRestore) return;
    if (restoredDraftRef.current === draftToRestore.batch_id) return;
    restoredDraftRef.current = draftToRestore.batch_id;
    state.setWorkType(draftToRestore.work_type);
    state.setSubType(draftToRestore.sub_type);
    state.setFromDepartment(draftToRestore.from_department || state.fromDepartment);
    state.setToDepartment(draftToRestore.to_department || state.toDepartment);
    state.setReferenceNo(draftToRestore.reference_no || "");
    state.setNotes(draftToRestore.notes || "");
    state.setBundles(draftToRestore.bundles);
    onStatusChange("임시저장 작업을 불러왔습니다.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftToRestore?.batch_id]);

  async function addItem(item: Item, sourceKind: IoSourceKind = "direct_item") {
    setError(null);
    try {
      const response = await previewTarget({
        employeeId,
        workType: state.workType,
        subType: state.subType,
        fromDepartment: state.fromDepartment,
        toDepartment: state.toDepartment,
        target: { source_kind: sourceKind, item_id: item.item_id, quantity: 1 },
      });
      state.setBundles((prev) => [...prev, ...response.bundles]);
      onStatusChange(`${item.item_name} 작업 묶음 생성`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "품목 전개에 실패했습니다.");
    }
  }

  async function addPackage(pkg: (typeof packages)[number]) {
    setError(null);
    try {
      const response = await previewTarget({
        employeeId,
        workType: state.workType,
        subType: "ship",
        fromDepartment: null,
        toDepartment: null,
        target: { source_kind: "ship_package", package_id: pkg.package_id, quantity: 1 },
      });
      state.setBundles((prev) => [...prev, ...response.bundles]);
      onStatusChange(`${pkg.name} 패키지 전개`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "패키지 전개에 실패했습니다.");
    }
  }

  useEffect(() => {
    if (!preselectedItem) return;
    if (preselectedHandledRef.current === preselectedItem.item_id) return;
    preselectedHandledRef.current = preselectedItem.item_id;
    void addItem(preselectedItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedItem?.item_id]);

  function getAvailable(line: IoLine) {
    const item = items.find((row) => row.item_id === line.item_id);
    if (!item || line.from_bucket === "none") return null;
    if (line.from_bucket === "warehouse") {
      return Math.max(0, (item.warehouse_qty || 0) - (item.pending_quantity || 0));
    }
    if (line.from_bucket === "production") {
      return locationQuantity(item, line.from_department, "PRODUCTION");
    }
    if (line.from_bucket === "defective") {
      return locationQuantity(item, line.from_department, "DEFECTIVE");
    }
    return null;
  }

  function changeFromDepartment(next: string) {
    state.setFromDepartment(next);
    if (state.bundles.length > 0) {
      state.setBundles([]);
      onStatusChange("부서 변경으로 작업 묶음을 초기화했습니다.");
    }
  }

  function changeToDepartment(next: string) {
    state.setToDepartment(next);
    if (state.bundles.length > 0) {
      state.setBundles([]);
      onStatusChange("부서 변경으로 작업 묶음을 초기화했습니다.");
    }
  }

  function handleSubTypeChange(next: IoSubType) {
    state.setSubType(next);
    state.setBundles([]);
    if (next === "ship") state.setWorkType("ship");
  }

  function handleWorkTypeChange(next: IoWorkType) {
    state.setWorkType(next);
    setError(null);
  }

  async function handleSaveDraft() {
    if (!employeeId) {
      setError("작업자를 선택하세요.");
      return;
    }
    try {
      await saveDraft({
        employeeId,
        workType: state.workType,
        subType: state.subType,
        fromDepartment: state.fromDepartment,
        toDepartment: state.toDepartment,
        referenceNo: state.referenceNo,
        notes: state.notes,
        bundles: state.bundles,
      });
      setResult({ kind: "success", title: "임시저장 완료", message: "현재 작업 묶음이 저장되었습니다." });
    } catch (err) {
      setResult({
        kind: "error",
        title: "임시저장 실패",
        message: err instanceof Error ? err.message : "임시저장 중 오류가 발생했습니다.",
      });
    }
  }

  async function handleRestoreDraft() {
    if (!employeeId) return;
    try {
      const draft = await restoreDraft(employeeId, state.workType, state.subType);
      if (!draft) {
        setResult({ kind: "error", title: "복원할 작업 없음", message: "현재 작업 유형의 임시저장이 없습니다." });
        return;
      }
      state.setFromDepartment(draft.from_department || state.fromDepartment);
      state.setToDepartment(draft.to_department || state.toDepartment);
      state.setReferenceNo(draft.reference_no || "");
      state.setNotes(draft.notes || "");
      state.setBundles(draft.bundles);
      setResult({ kind: "success", title: "임시저장 복원", message: "저장된 작업 묶음을 불러왔습니다." });
    } catch (err) {
      setResult({
        kind: "error",
        title: "복원 실패",
        message: err instanceof Error ? err.message : "임시저장 복원 중 오류가 발생했습니다.",
      });
    }
  }

  async function handleSubmit() {
    if (!employeeId) {
      setError("작업자를 선택하세요.");
      return;
    }
    try {
      const response = await submit({
        employeeId,
        workType: state.workType,
        subType: state.subType,
        fromDepartment: state.fromDepartment,
        toDepartment: state.toDepartment,
        referenceNo: state.referenceNo,
        notes: state.notes,
        bundles: state.bundles,
      });
      setResult({
        kind: "success",
        title: response.requires_approval ? "승인 요청 완료" : "입출고 반영 완료",
        message: response.message,
      });
      state.reset();
      onStatusChange(response.message);
      try {
        const refreshed = await api.getItems({ limit: 2000, search: globalSearch.trim() || undefined });
        setItems(refreshed);
      } catch {
        /* ignore refresh failure */
      }
      onSubmitSuccess?.();
    } catch (err) {
      setResult({
        kind: "error",
        title: "제출 실패",
        message: err instanceof Error ? err.message : "제출 중 오류가 발생했습니다.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_180px]">
          <label>
            <span className="mb-1 block text-xs font-black text-slate-500">작업자</span>
            <select
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:border-blue-500"
            >
              <option value="">작업자 선택</option>
              {employees.map((employee) => (
                <option key={employee.employee_id} value={employee.employee_id}>
                  {employee.name} · {employee.department}
                </option>
              ))}
            </select>
          </label>

          {requiresDepartments(state.subType) && (
            <>
              <label>
                <span className="mb-1 block text-xs font-black text-slate-500">출발 부서</span>
                <select
                  value={state.fromDepartment}
                  onChange={(event) => changeFromDepartment(event.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:border-blue-500"
                >
                  {DEPARTMENT_OPTIONS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-black text-slate-500">도착 부서</span>
                <select
                  value={state.toDepartment}
                  onChange={(event) => changeToDepartment(event.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:border-blue-500"
                >
                  {DEPARTMENT_OPTIONS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleRestoreDraft}
              disabled={!selectedEmployee || drafting}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              임시저장 복원
            </button>
          </div>
        </div>
      </section>

      <IoWorkTypeStep
        workType={state.workType}
        subType={state.subType}
        onWorkTypeChange={handleWorkTypeChange}
        onSubTypeChange={handleSubTypeChange}
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <IoTargetPicker
          workType={state.workType}
          items={items}
          packages={packages}
          search={search}
          onSearchChange={setSearch}
          onAddItem={addItem}
          onAddPackage={addPackage}
          busy={previewing}
        />
        <IoBundleCart
          bundles={state.bundles}
          getAvailable={getAvailable}
          onToggleLine={(bundleId, lineId) =>
            state.updateLine(bundleId, lineId, (line) => ({
              ...line,
              included: !line.included,
              shortage: line.included
                ? 0
                : Math.max(0, line.quantity - (getAvailable(line) ?? line.quantity)),
              exclusion_note:
                line.included && state.subType === "disassemble" && line.origin === "bom_auto"
                  ? "회수 안 됨"
                  : line.included
                  ? "이번 작업 제외"
                  : null,
            }))
          }
          onQuantityChange={(bundleId, lineId, quantity, shortage) =>
            state.updateLine(bundleId, lineId, (line) => ({
              ...line,
              quantity,
              shortage,
              edited:
                line.bom_expected !== null
                  ? Math.abs(quantity - line.bom_expected) > 0.0001
                  : line.origin === "manual" || line.edited,
            }))
          }
          onRemoveLine={state.removeLine}
          onRemoveBundle={(bundleId) =>
            state.setBundles((prev) => prev.filter((bundle) => bundle.bundle_id !== bundleId))
          }
        />
      </div>

      <IoConfirmStep
        subType={state.subType}
        bundles={state.bundles}
        notes={state.notes}
        referenceNo={state.referenceNo}
        hasShortage={state.hasShortage}
        hasInvalidQuantity={state.hasInvalidQuantity}
        submitting={submitting || drafting}
        onNotesChange={state.setNotes}
        onReferenceChange={state.setReferenceNo}
        onSaveDraft={handleSaveDraft}
        onSubmit={handleSubmit}
      />

      <IoSubmitModals result={result} onClose={() => setResult(null)} />
    </div>
  );
}
