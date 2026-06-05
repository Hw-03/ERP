import { useState } from "react";
import { api, type IoPreviewTarget } from "@/lib/api";
import type { IoSubType, IoWorkType } from "./types";

export function useIoPreview() {
  const [previewing, setPreviewing] = useState(false);

  async function previewTarget(options: {
    employeeId?: string | null;
    workType: IoWorkType;
    subType: IoSubType;
    fromDepartment?: string | null;
    toDepartment?: string | null;
    target: IoPreviewTarget;
  }) {
    setPreviewing(true);
    try {
      return await api.preview({
        requester_employee_id: options.employeeId || null,
        work_type: options.workType,
        sub_type: options.subType,
        from_department: options.fromDepartment || null,
        to_department: options.toDepartment || null,
        targets: [options.target],
      });
    } finally {
      setPreviewing(false);
    }
  }

  return { previewing, previewTarget };
}
