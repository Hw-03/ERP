"use client";

import type { Operator } from "./login/useCurrentOperator";
import { DailyWorkReportScreen } from "./_daily_report/DailyWorkReportScreen";
import { useConfirmNavigation } from "@/lib/ui/dirty-guard";

export function DesktopDailyWorkReportView({ operator }: { operator: Operator | null }) {
  const confirmNavigation = useConfirmNavigation();
  return <DailyWorkReportScreen employeeId={operator?.employee_id} confirmNavigation={confirmNavigation} />;
}
