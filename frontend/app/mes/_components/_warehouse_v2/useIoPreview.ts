import { useRef, useState } from "react";
import { api, type IoPreviewTarget } from "@/lib/api";
import type { IoSubType, IoWorkType } from "./types";

export function useIoPreview() {
  const [previewing, setPreviewing] = useState(false);
  const pendingCountRef = useRef(0);

  async function previewTarget(options: {
    employeeId?: string | null;
    workType: IoWorkType;
    subType: IoSubType;
    fromDepartment?: string | null;
    toDepartment?: string | null;
    target: IoPreviewTarget;
  }) {
    pendingCountRef.current += 1;
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
      pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
      if (pendingCountRef.current === 0) setPreviewing(false);
    }
  }

  return { previewing, previewTarget };
}
