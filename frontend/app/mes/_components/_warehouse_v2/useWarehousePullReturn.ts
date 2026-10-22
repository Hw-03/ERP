import { useEffect, useState, type MutableRefObject } from "react";
import type { IoStep, useIoWorkState } from "./useIoWorkState";

/** 원작업의 서버 저장을 요구하지 않고 현재 작성 세션에 복귀 지점을 보존한다. */
export function useWarehousePullReturn(
  state: ReturnType<typeof useIoWorkState>,
  batchIdRef: MutableRefObject<string | null>,
  captureSession: () => () => void,
  onRestored?: (batchId: string | null, step: IoStep, replacedBatchId: string | null) => void,
) {
  const [resume, setResume] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (!resume) return;
    const warn = (event: BeforeUnloadEvent): void => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [resume]);

  function capture(): () => void {
    const snapshot = { ...state };
    const batchId = batchIdRef.current;
    const restoreSession = captureSession();
    return () => {
      const replacedBatchId = batchIdRef.current;
      restoreSession();
      state.setWorkType(snapshot.workType);
      state.setSubType(snapshot.subType);
      state.setDeptIoDirectionRaw(snapshot.deptIoDirection);
      state.setFromDepartment(snapshot.fromDepartment);
      state.setToDepartment(snapshot.toDepartment);
      state.setReferenceNo(snapshot.referenceNo);
      state.setNotes(snapshot.notes);
      state.setReasonCategory(snapshot.reasonCategory, snapshot.reasonCategoryId);
      state.setSupplier(snapshot.selectedSupplierId ? { supplier_id: snapshot.selectedSupplierId, name: snapshot.selectedSupplierName ?? "" } : null);
      state.setSupplierSelectionReady(snapshot.supplierSelectionReady);
      state.setBundles(snapshot.bundles);
      state.goTo(snapshot.step);
      batchIdRef.current = batchId;
      onRestored?.(batchId, snapshot.step, replacedBatchId);
      setResume(null);
    };
  }
  return { pending: resume !== null, capture, retain: (restore: () => void): void => setResume(() => restore), resume };
}
