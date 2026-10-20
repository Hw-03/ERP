import { useState } from "react";
import { api, type IoBundle, type IoSubType, type IoWorkType } from "@/lib/api";

export function useIoDraft() {
  const [drafting, setDrafting] = useState(false);

  async function saveDraft(payload: {
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
    batchId?: string | null;
    bundles: IoBundle[];
  }) {
    setDrafting(true);
    try {
      return await api.saveDraft({
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
        batch_id: payload.batchId ?? null,
        bundles: payload.bundles,
      });
    } finally {
      setDrafting(false);
    }
  }

  async function restoreDraft(employeeId: string, workType: IoWorkType, subType: IoSubType) {
    setDrafting(true);
    try {
      return await api.getDraft(employeeId, workType, subType);
    } finally {
      setDrafting(false);
    }
  }

  return { drafting, saveDraft, restoreDraft };
}
