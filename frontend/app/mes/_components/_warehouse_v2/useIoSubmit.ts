import { useRef, useState } from "react";
import { api, type IoBundle, type IoSubType, type IoWorkType } from "@/lib/api";
import { ApiError } from "@/lib/api-core";

// crypto.randomUUID 는 보안 컨텍스트(HTTPS / localhost)에서만 정의됨.
// LAN IP (http://192.168.x.x) 같은 비보안 origin 에서는 undefined → 제출 실패. 동일 형식의 UUID v4 폴백 제공.
function makeClientRequestId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
      clientRequestIdRef.current = makeClientRequestId();
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
