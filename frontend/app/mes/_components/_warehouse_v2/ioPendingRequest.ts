import type { IoDraftPayload } from "@/lib/api";
import { readPendingCommand } from "@/lib/pending-command-storage";

export type IoSubmitInput = {
  employeeId: string;
  workType: IoDraftPayload["work_type"];
  subType: IoDraftPayload["sub_type"];
  fromDepartment?: string | null;
  toDepartment?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
  batchId?: string | null;
  bundles: IoDraftPayload["bundles"];
};

export type PendingIoDraftRequest = {
  batchId: string;
  employeeId: string;
};

/** 원 요청이 확인되기 전에는 현재 편집을 새 제출로 오인하지 않는다. */
export class PendingIoRequestError extends Error {
  constructor() {
    super("서버에서 이미 처리됐을 수 있습니다. 이전 요청 결과를 먼저 확인하세요. 현재 입력은 보존됩니다.");
    this.name = "PendingIoRequestError";
  }
}

export function getPendingIoRequest(employeeId: string): IoDraftPayload | null {
  return employeeId ? readPendingCommand<IoDraftPayload>(`i:${employeeId}`) : null;
}

/** 구 draft 제출 scope를 명시적 결과 확인 흐름으로 연결한다. */
export function getPendingIoDraftRequest(employeeId: string): PendingIoDraftRequest | null {
  if (!employeeId) return null;
  const request = readPendingCommand<PendingIoDraftRequest>(`io:draft-submit:${employeeId}`);
  return request?.employeeId === employeeId && typeof request.batchId === "string"
    ? request
    : null;
}

export function toIoSubmitRequest(payload: IoSubmitInput): IoDraftPayload {
  return {
    requester_employee_id: payload.employeeId,
    work_type: payload.workType,
    sub_type: payload.subType,
    from_department: payload.fromDepartment || null,
    to_department: payload.toDepartment || null,
    reference_no: payload.referenceNo || null,
    notes: payload.notes || null,
    ...(payload.batchId ? { batch_id: payload.batchId } : {}),
    bundles: payload.bundles,
  };
}

/** 새로 생성되는 식별자만 제외하고 입력 전체가 같은 경우에만 폼을 비운다. */
export function matchesPendingIoRequest(request: IoDraftPayload, current: IoSubmitInput): boolean {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !["client_request_id", "bundle_id", "line_id"].includes(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalize(entry)]));
    }
    return value;
  };
  return JSON.stringify(normalize(request)) === JSON.stringify(normalize(toIoSubmitRequest(current)));
}
