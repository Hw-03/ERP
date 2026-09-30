"use client";

import type { Operator } from "../../login/useCurrentOperator";
import { DailyWorkReportScreen } from "../../_daily_report/DailyWorkReportScreen";
import { MobileScrollFrame } from "../primitives/MobileScrollFrame";

export function MobileDailyWorkReportScreen({
  operator,
  flushSaveRef,
}: {
  operator: Operator | null;
  flushSaveRef: React.MutableRefObject<(() => Promise<void>) | null>;
}) {
  return <MobileScrollFrame><DailyWorkReportScreen employeeId={operator?.employee_id} operator={operator} saveRef={flushSaveRef} mobile /></MobileScrollFrame>;
}
