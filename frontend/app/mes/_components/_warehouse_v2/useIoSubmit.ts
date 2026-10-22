import { useRef, useState, type MutableRefObject } from "react";
import { api, type IoBundle, type IoSubType, type IoWorkType } from "@/lib/api";
import { makeClientRequestId } from "@/lib/uuid";
import { ApiError } from "@/lib/api-core";

export function useIoSubmit(onReservationChanged?: () => void | Promise<void>, onCommittedFailure?: (batchId: string) => Promise<void>, sessionCreationKey?: MutableRefObject<string | null>) {
  const [submitting, setSubmitting] = useState(false);
  const inFlightRef = useRef(false);
  const standaloneCreationKey = useRef<string | null>(null);
  const clientRequestIdRef = sessionCreationKey ?? standaloneCreationKey;
  const generation = useRef(0);

  async function refreshReservations(): Promise<void> {
    try { await onReservationChanged?.(); } catch { /* 조회 오류가 확정된 제출 결과를 바꾸지 않는다. */ }
  }

  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (inFlightRef.current) return undefined;
    inFlightRef.current = true;
    setSubmitting(true);
    try {
      return await work();
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  }

  async function submit(payload: {
    employeeId: string;
    workType: IoWorkType;
    subType: IoSubType;
    fromDepartment?: string | null;
    toDepartment?: string | null;
    referenceNo?: string | null;
    notes?: string | null;
    reasonCategoryId?: string | null;
    reasonCategory?: string | null;
    supplierId?: string | null;
    bundles: IoBundle[];
  }) {
    // 폼 세션 멱등 키: 동일 시도 재전송 시 서버가 기존 batch 멱등 반환 → 재고 이중 차감 방지
    if (!clientRequestIdRef.current) {
      clientRequestIdRef.current = makeClientRequestId();
    }
    const submittedGeneration = generation.current;
    try {
      const result = await api.submit({
        requester_employee_id: payload.employeeId,
        work_type: payload.workType,
        sub_type: payload.subType,
        from_department: payload.fromDepartment || null,
        to_department: payload.toDepartment || null,
        reference_no: payload.referenceNo || null,
        notes: payload.notes || null,
        ...(payload.subType === "defect_quarantine" ? {
          reason_category_id: payload.reasonCategoryId ?? null,
          reason_category: payload.reasonCategory?.trim() || null,
        } : {}),
        supplier_id: payload.supplierId ?? null,
        client_request_id: clientRequestIdRef.current,
        bundles: payload.bundles,
      });
      // 성공 시 키 폐기 — 다음 폼 세션은 새 UUID
      if (submittedGeneration === generation.current) clientRequestIdRef.current = null;
      await refreshReservations();
      return result;
    } catch (err) {
      await refreshReservations();
      if (submittedGeneration === generation.current && err instanceof ApiError && err.extra?.state_committed === true && typeof err.extra.batch_id === "string") {
        await onCommittedFailure?.(err.extra.batch_id);
      }
      throw err;
    }
  }

  function resetSession(): void { generation.current += 1; clientRequestIdRef.current = null; }
  function captureSession(): () => void {
    const key = clientRequestIdRef.current;
    return () => { generation.current += 1; clientRequestIdRef.current = key; };
  }
  return { submitting, run, submit, resetSession, captureSession };
}
