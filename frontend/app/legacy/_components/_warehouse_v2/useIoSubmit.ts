import { useRef, useState } from "react";
import { api, type IoBundle, type IoSubType, type IoWorkType } from "@/lib/api";
import { ApiError } from "@/lib/api-core";

export function useIoSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const clientRequestIdRef = useRef<string | null>(null);

  async function submit(payload: {
    employeeId: string;
    workType: IoWorkType;
    subType: IoSubType;
    fromDepartment?: string | null;
    toDepartment?: string | null;
    referenceNo?: string | null;
    notes?: string | null;
    bundles: IoBundle[];
  }) {
    setSubmitting(true);
    // 폼 세션 멱등 키: 동일 시도 재전송 시 서버가 기존 batch 멱등 반환 → 재고 이중 차감 방지
    if (!clientRequestIdRef.current) {
      clientRequestIdRef.current = crypto.randomUUID();
    }
    try {
      const result = await api.submit({
        requester_employee_id: payload.employeeId,
        work_type: payload.workType,
        sub_type: payload.subType,
        from_department: payload.fromDepartment || null,
        to_department: payload.toDepartment || null,
        reference_no: payload.referenceNo || null,
        notes: payload.notes || null,
        client_request_id: clientRequestIdRef.current,
        bundles: payload.bundles,
      });
      // 성공 시 키 폐기 — 다음 폼 세션은 새 UUID
      clientRequestIdRef.current = null;
      return result;
    } catch (err) {
      // 503(과부하)는 같은 키로 재시도 가능하도록 유지. 그 외 실패도 사용자가 수정 후 재제출하므로 키 폐기.
      if (!(err instanceof ApiError) || !err.isUnavailable) {
        clientRequestIdRef.current = null;
      }
      throw err;
    } finally {
      setSubmitting(false);
    }
  }

  return { submitting, submit };
}
