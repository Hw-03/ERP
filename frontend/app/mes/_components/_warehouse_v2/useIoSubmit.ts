import { useState } from "react";
import {
  api,
  type IoBundle,
  type IoDraftPayload,
  type IoSubType,
  type IoWorkType,
} from "@/lib/api";
import { runPendingCommand } from "@/lib/pending-command-storage";
import { makeClientRequestId } from "@/lib/uuid";

export function useIoSubmit() {
  const [submitting, setSubmitting] = useState(false);

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
    try {
      return await runPendingCommand(
        `i:${payload.employeeId}`,
        {
          requester_employee_id: payload.employeeId,
          work_type: payload.workType,
          sub_type: payload.subType,
          from_department: payload.fromDepartment || null,
          to_department: payload.toDepartment || null,
          reference_no: payload.referenceNo || null,
          notes: payload.notes || null,
          client_request_id: makeClientRequestId(),
          bundles: payload.bundles,
        } as IoDraftPayload,
        (request) => api.submit(request),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return { submitting, submit };
}
