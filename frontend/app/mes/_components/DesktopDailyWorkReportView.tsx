"use client";

import type { ReactNode } from "react";
import type { Operator } from "./login/useCurrentOperator";
import { DailyWorkReportScreen } from "./_daily_report/DailyWorkReportScreen";
import { useConfirmNavigation } from "@/lib/ui/dirty-guard";

export function DesktopDailyWorkReportView({
  operator,
  onTopbarControlsChange,
}: {
  operator: Operator | null;
  onTopbarControlsChange?: (controls: ReactNode | null) => void;
}) {
  const confirmNavigation = useConfirmNavigation();
  return <DailyWorkReportScreen employeeId={operator?.employee_id} operator={operator} confirmNavigation={confirmNavigation} onTopbarControlsChange={onTopbarControlsChange} />;
}
