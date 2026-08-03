"use client";

import type { Operator } from "../../login/useCurrentOperator";
import { DailyWorkReportScreen } from "../../_daily_report/DailyWorkReportScreen";

export function MobileDailyWorkReportScreen({
  operator,
  onDirtyChange,
  flushSaveRef,
}: {
  operator: Operator | null;
  onDirtyChange: (dirty: boolean) => void;
  flushSaveRef: React.MutableRefObject<(() => Promise<void>) | null>;
}) {
  return <DailyWorkReportScreen employeeId={operator?.employee_id} operator={operator} onDirtyChange={onDirtyChange} saveRef={flushSaveRef} />;
}
